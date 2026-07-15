from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.db import get_db
from app.models.tables import Company

router = APIRouter(prefix="/prospects", tags=["prospects"])


@router.get("")
@router.get("/")
async def list_prospects(
    status: str | None = None,
    region: str | None = None,
    industry: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(Company).options(
        selectinload(Company.contacts),
        selectinload(Company.ai_analyses),
    )

    if status:
        query = query.where(Company.status == status)
    if region:
        query = query.where(Company.region == region)
    if industry:
        query = query.where(Company.industry == industry)
    if search:
        query = query.where(Company.name.ilike(f"%{search}%"))

    query = query.order_by(Company.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    companies = result.scalars().unique().all()

    return [
        {
            "id": c.id, "name": c.name, "website": c.website, "phone": c.phone,
            "industry": c.industry, "region": c.region, "city": c.city,
            "status": c.status,
            "contacts": [{"id": ct.id, "email": ct.email} for ct in c.contacts],
            "ai_analyses": [{"confidence_score": a.confidence_score} for a in c.ai_analyses],
        }
        for c in companies
    ]


@router.get("/stats")
async def prospect_stats(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count(Company.id)))).scalar() or 0
    enriched = (await db.execute(select(func.count(Company.id)).where(Company.status == "enriched"))).scalar() or 0
    analyzed = (await db.execute(select(func.count(Company.id)).where(Company.status == "analyzed"))).scalar() or 0
    contacted = (await db.execute(select(func.count(Company.id)).where(Company.status == "contacted"))).scalar() or 0

    return {"total": total, "enriched": enriched, "analyzed": analyzed, "contacted": contacted}


@router.get("/{company_id}")
async def get_prospect(company_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company)
        .options(
            selectinload(Company.contacts),
            selectinload(Company.ai_analyses),
            selectinload(Company.emails),
        )
        .where(Company.id == company_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return {
        "id": company.id, "name": company.name, "website": company.website,
        "phone": company.phone, "industry": company.industry, "region": company.region,
        "city": company.city, "address": company.address,
        "size_estimate": company.size_estimate, "about_text": company.about_text,
        "status": company.status,
        "contacts": [
            {"id": ct.id, "name": ct.name, "email": ct.email, "role": ct.role, "phone": ct.phone}
            for ct in company.contacts
        ],
        "ai_analyses": [
            {
                "id": a.id, "confidence_score": a.confidence_score,
                "recommended_services": a.recommended_services,
                "pain_points": a.pain_points, "reasoning": a.reasoning,
            }
            for a in company.ai_analyses
        ],
        "emails": [
            {"id": e.id, "subject": e.subject, "status": e.status,
             "sent_at": e.sent_at.isoformat() if e.sent_at else None}
            for e in company.emails
        ],
    }


@router.delete("/{company_id}")
async def delete_prospect(company_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.delete(company)
    await db.commit()
    return {"deleted": True}
