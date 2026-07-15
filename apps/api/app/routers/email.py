import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.db import get_db
from app.config import settings
from app.models.tables import Company, Email, DemoProject
from app.services.ai_analyzer import AIAnalyzerService, EMAIL_SYSTEM_PROMPT
from app.services.smtp_client import SMTPService

router = APIRouter(prefix="/emails", tags=["emails"])
ai_service = AIAnalyzerService(region=settings.aws_region)
smtp_service = SMTPService(
    host=settings.smtp_host,
    port=settings.smtp_port,
    username=settings.smtp_username,
    password=settings.smtp_password,
    from_email=settings.smtp_from_email,
    from_name=settings.smtp_from_name,
    use_tls=settings.smtp_use_tls,
)


def _serialize_email(e: Email, company: Company | None = None, contact=None) -> dict:
    data = {
        "id": e.id, "company_id": e.company_id, "contact_id": e.contact_id,
        "subject": e.subject, "body": e.body, "tone": e.tone, "status": e.status,
        "variant_group": e.variant_group,
        "sent_at": e.sent_at.isoformat() if e.sent_at else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "bounced_at": e.bounced_at.isoformat() if e.bounced_at else None,
        "bounce_type": e.bounce_type,
        "bounce_reason": e.bounce_reason,
        "recipient_email": e.override_email or (contact.email if contact else None) or (e.contact.email if hasattr(e, "contact") and e.contact else None),
        "hunter_emails": [
            {"email": c.email, "name": c.name, "role": c.role}
            for c in (company.contacts if company and hasattr(company, "contacts") else [])
            if c.source == "hunter" and c.email
        ] if company else [],
    }
    if company:
        data["companies"] = {"name": company.name, "industry": company.industry, "region": company.region}
    return data


@router.post("/draft/{company_id}")
async def draft_email(company_id: str, tone: str = "professional", variants: int = 1, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company).options(selectinload(Company.ai_analyses), selectinload(Company.contacts))
        .where(Company.id == company_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    if not c.ai_analyses:
        raise HTTPException(status_code=400, detail="Company has no AI analysis yet")

    # Check if an email was already sent to this company within the last 30 days
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    recent_email = await db.execute(
        select(Email).where(
            Email.company_id == company_id,
            Email.sent_at.isnot(None),
            Email.sent_at >= thirty_days_ago,
        ).limit(1)
    )
    if recent_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An email was already sent to this company within the last 30 days. You can send a follow-up from the Sent tab.")

    analysis = c.ai_analyses[-1]
    services = [s["service_name"] for s in analysis.recommended_services]
    # Prefer decision-maker contacts (CEO, owner, founder, etc.)
    DECISION_MAKER_ROLES = {"ceo", "founder", "co-founder", "owner", "director", "managing director", "md", "president", "general manager", "gm", "proprietor", "principal"}
    contact = next(
        (ct for ct in c.contacts if ct.email and ct.role and ct.role.lower() in DECISION_MAKER_ROLES),
        next((ct for ct in c.contacts if ct.email), None)
    )

    # Look up deployed demo for this prospect
    demo_result = await db.execute(
        select(DemoProject).where(
            DemoProject.prospect_id == company_id,
            DemoProject.status == "deployed",
            DemoProject.live_url.isnot(None),
        ).order_by(DemoProject.updated_at.desc()).limit(1)
    )
    demo = demo_result.scalar_one_or_none()
    demo_url = demo.live_url if demo else None

    variants = max(1, min(variants, 5))  # clamp 1-5
    variant_group = str(uuid.uuid4()) if variants > 1 else None

    created_emails = []
    for _ in range(variants):
        ai_result = await ai_service.draft_email(
            company_name=c.name,
            industry=c.industry or "",
            recommended_services=services,
            reasoning=analysis.reasoning,
            tone=tone,
            demo_url=demo_url,
            about_text=c.about_text,
            website=c.website,
            city=c.city,
            contact_name=contact.name if contact else None,
            contact_role=contact.role if contact else None,
        )

        email = Email(
            company_id=company_id,
            contact_id=contact.id if contact else None,
            subject=ai_result["subject"],
            body=ai_result["body"],
            tone=tone,
            variant_group=variant_group,
            status="draft",
        )
        db.add(email)
        await db.flush()
        created_emails.append(email)

    await db.commit()
    for e in created_emails:
        await db.refresh(e)

    if len(created_emails) == 1:
        return _serialize_email(created_emails[0], c)

    return {
        "variant_group": variant_group,
        "variants": [_serialize_email(e, c) for e in created_emails],
    }


@router.get("")
@router.get("/")
async def list_emails(
    status: str | None = None,
    campaign_id: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(Email).options(selectinload(Email.company).selectinload(Company.contacts), selectinload(Email.contact))

    if status:
        query = query.where(Email.status == status)
    if campaign_id:
        query = query.where(Email.campaign_id == campaign_id)

    query = query.order_by(Email.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    emails = result.scalars().unique().all()
    return [_serialize_email(e, e.company, e.contact) for e in emails]


@router.get("/stats")
async def email_stats(db: AsyncSession = Depends(get_db)):
    draft = (await db.execute(select(func.count(Email.id)).where(Email.status == "draft"))).scalar() or 0
    approved = (await db.execute(select(func.count(Email.id)).where(Email.status == "approved"))).scalar() or 0
    sent = (await db.execute(select(func.count(Email.id)).where(Email.status == "sent"))).scalar() or 0
    opened = (await db.execute(select(func.count(Email.id)).where(Email.opened_at.isnot(None)))).scalar() or 0
    replied = (await db.execute(select(func.count(Email.id)).where(Email.replied_at.isnot(None)))).scalar() or 0

    return {
        "draft": draft,
        "approved": approved,
        "sent": sent,
        "opened": opened,
        "replied": replied,
        "open_rate": round((opened / sent * 100), 1) if sent > 0 else 0,
        "reply_rate": round((replied / sent * 100), 1) if sent > 0 else 0,
    }


class EmailUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    status: str | None = None
    override_email: str | None = None


@router.patch("/{email_id}")
async def update_email(email_id: str, updates: EmailUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email).options(selectinload(Email.company).selectinload(Company.contacts))
        .where(Email.id == email_id)
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    if updates.subject is not None:
        email.subject = updates.subject
    if updates.body is not None:
        email.body = updates.body
    if updates.status is not None:
        email.status = updates.status
    if updates.override_email is not None:
        email.override_email = updates.override_email or None

    await db.commit()
    return _serialize_email(email, email.company)


@router.post("/{email_id}/approve")
async def approve_email(email_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email).options(selectinload(Email.company).selectinload(Company.contacts))
        .where(Email.id == email_id)
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email.status = "approved"
    await db.commit()
    return _serialize_email(email, email.company)


def _build_html_email(body_text: str) -> str:
    paragraphs = body_text.strip().split("\n\n")
    html_parts = []
    for p in paragraphs:
        lines = p.strip().split("\n")
        html_parts.append("<div style=\"margin-bottom:12px;\">" + "<br>".join(lines) + "</div>")

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
{"".join(html_parts)}
</body>
</html>"""


class SendRequest(BaseModel):
    to_email: str | None = None
    extra_to: list[str] | None = None


@router.post("/{email_id}/send")
async def send_email(email_id: str, body: SendRequest = SendRequest(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email).options(
            selectinload(Email.contact),
            selectinload(Email.company).selectinload(Company.contacts),
        ).where(Email.id == email_id)
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.status not in ("approved", "draft"):
        raise HTTPException(status_code=400, detail=f"Cannot send email with status '{email.status}'")

    to_email = body.to_email or email.override_email or (email.contact.email if email.contact else None)
    if not to_email:
        raise HTTPException(status_code=400, detail="No recipient email address")

    # Use frontend-provided extra recipients (editable by user)
    extra_to = [e for e in (body.extra_to or []) if e and e.lower() != to_email.lower()]

    body_html = _build_html_email(email.body)

    smtp_result = smtp_service.send_email(
        to_email=to_email,
        subject=email.subject,
        body_html=body_html,
        body_text=email.body,
        extra_to=extra_to if extra_to else None,
    )

    if smtp_result["success"]:
        email.status = "sent"
        email.sent_at = datetime.now(timezone.utc)
        if email.company:
            email.company.status = "contacted"
        await db.commit()
        return {"sent": True}
    else:
        error = smtp_result.get("error", "Send failed")
        email.status = "failed"
        email.bounced_at = datetime.now(timezone.utc)
        email.bounce_type = "permanent"
        email.bounce_reason = str(error)[:500]
        await db.commit()
        raise HTTPException(status_code=500, detail=error)


@router.post("/{email_id}/regenerate")
async def regenerate_email(email_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email).options(
            selectinload(Email.company).selectinload(Company.ai_analyses),
            selectinload(Email.company).selectinload(Company.contacts),
        ).where(Email.id == email_id)
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.status == "sent":
        raise HTTPException(status_code=400, detail="Cannot regenerate a sent email")

    c = email.company
    if not c or not c.ai_analyses:
        raise HTTPException(status_code=400, detail="No AI analysis found for this company")

    analysis = c.ai_analyses[-1]
    services = [s["service_name"] for s in analysis.recommended_services]

    demo_result = await db.execute(
        select(DemoProject).where(
            DemoProject.prospect_id == c.id,
            DemoProject.status == "deployed",
            DemoProject.live_url.isnot(None),
        ).order_by(DemoProject.updated_at.desc()).limit(1)
    )
    demo = demo_result.scalar_one_or_none()

    DECISION_MAKER_ROLES = {"ceo", "founder", "co-founder", "owner", "director", "managing director", "md", "president", "general manager", "gm", "proprietor", "principal"}
    contact = next(
        (ct for ct in c.contacts if ct.email and ct.role and ct.role.lower() in DECISION_MAKER_ROLES),
        next((ct for ct in c.contacts if ct.email), None)
    )

    ai_result = await ai_service.draft_email(
        company_name=c.name,
        industry=c.industry or "",
        recommended_services=services,
        reasoning=analysis.reasoning,
        tone=email.tone or "professional",
        demo_url=demo.live_url if demo else None,
        about_text=c.about_text,
        website=c.website,
        city=c.city,
        contact_name=contact.name if contact else None,
        contact_role=contact.role if contact else None,
    )

    email.subject = ai_result["subject"]
    email.body = ai_result["body"]
    email.status = "draft"
    await db.commit()
    await db.refresh(email)
    return _serialize_email(email, c, contact)


class FollowUpRequest(BaseModel):
    tone: str = "conversational"


@router.post("/{email_id}/follow-up")
async def create_follow_up(email_id: str, body: FollowUpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email).options(selectinload(Email.company))
        .where(Email.id == email_id, Email.status == "sent")
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Sent email not found")

    follow_up_prompt = f"""Company: {email.company.name}
Industry: {email.company.industry or ''}
Original email subject: {email.subject}
Original email we sent: {email.body}

Write a SHORT follow-up email (under 80 words). Reference the previous email naturally. Don't repeat everything — just bump the thread with a new angle or a gentle nudge. Be casual and human."""

    ai_result = await ai_service._ainvoke(EMAIL_SYSTEM_PROMPT, follow_up_prompt)

    follow_up = Email(
        company_id=email.company_id,
        contact_id=email.contact_id,
        subject=f"Re: {email.subject}",
        body=ai_result["body"],
        tone=body.tone,
        status="draft",
    )
    db.add(follow_up)
    await db.commit()
    await db.refresh(follow_up)
    return _serialize_email(follow_up, email.company)


class TestSendRequest(BaseModel):
    to_email: str


@router.post("/{email_id}/test-send")
async def test_send_email(email_id: str, body: TestSendRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Email).where(Email.id == email_id))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    body_html = _build_html_email(email.body)
    smtp_result = smtp_service.send_email(
        to_email=body.to_email,
        subject=email.subject,
        body_html=body_html,
        body_text=email.body,
    )

    if smtp_result["success"]:
        return {"sent": True, "to": body.to_email}
    else:
        raise HTTPException(status_code=500, detail=smtp_result.get("error", "Send failed"))


@router.post("/bulk-approve")
async def bulk_approve(min_confidence: int = 70, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email).options(selectinload(Email.company).selectinload(Company.ai_analyses))
        .where(Email.status == "draft")
    )
    emails = result.scalars().unique().all()

    approved = 0
    for e in emails:
        if e.company and e.company.ai_analyses:
            latest = e.company.ai_analyses[-1]
            if latest.confidence_score >= min_confidence:
                e.status = "approved"
                approved += 1

    await db.commit()
    return {"approved": approved}
