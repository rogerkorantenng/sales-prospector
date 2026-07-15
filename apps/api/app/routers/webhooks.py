import json
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Response
from sqlalchemy import select
from app.db import async_session
from app.models.tables import Email

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/ses")
async def ses_webhook(request: Request):
    body = await request.body()
    try:
        payload = json.loads(body)
    except Exception:
        return Response(status_code=400)

    msg_type = payload.get("Type")

    # SNS subscription confirmation — must GET the SubscribeURL to confirm
    if msg_type == "SubscriptionConfirmation":
        url = payload.get("SubscribeURL")
        if url:
            async with httpx.AsyncClient() as client:
                await client.get(url)
        return Response(status_code=200)

    if msg_type != "Notification":
        return Response(status_code=200)

    try:
        message = json.loads(payload.get("Message", "{}"))
    except Exception:
        return Response(status_code=200)

    event_type = message.get("eventType") or message.get("notificationType")
    mail = message.get("mail", {})
    message_id = mail.get("messageId")

    if not message_id or event_type not in ("Bounce", "Complaint"):
        return Response(status_code=200)

    async with async_session() as db:
        result = await db.execute(
            select(Email).where(Email.sendgrid_id == message_id)
        )
        email = result.scalar_one_or_none()
        if not email:
            return Response(status_code=200)

        now = datetime.now(timezone.utc)

        if event_type == "Bounce":
            bounce = message.get("bounce", {})
            bounce_type = bounce.get("bounceType", "").lower()  # Permanent / Transient
            sub_type = bounce.get("bounceSubType", "")
            recipients = bounce.get("bouncedRecipients", [])
            reason = recipients[0].get("diagnosticCode", "") if recipients else sub_type

            email.bounced_at = now
            email.bounce_type = bounce_type or "permanent"
            email.bounce_reason = reason[:500] if reason else None
            email.status = "failed"

        elif event_type == "Complaint":
            email.bounced_at = now
            email.bounce_type = "complaint"
            email.bounce_reason = "Recipient marked as spam"
            email.status = "failed"

        await db.commit()

    return Response(status_code=200)
