from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db, async_session
from app.models.tables import Company, Contact
from app.services.scraper import WebsiteScraper
from app.services.hunter import HunterService
from app.config import settings

router = APIRouter(prefix="/enrichment", tags=["enrichment"])
scraper = WebsiteScraper()
hunter = HunterService(api_key=settings.hunter_api_key)


async def _enrich_company(company_id: str, website: str):
    result = await scraper.scrape_company(website)

    async with async_session() as db:
        existing = await db.execute(select(Contact).where(Contact.company_id == company_id))
        existing_emails = {c.email.lower() for c in existing.scalars().all()}

        for c in result.get("contacts", []):
            if c["email"].lower() in existing_emails:
                continue
            contact = Contact(
                company_id=company_id,
                email=c["email"],
                name=c.get("name"),
                role=c.get("role"),
                source="website",
            )
            db.add(contact)
            existing_emails.add(c["email"].lower())

        company = await db.execute(select(Company).where(Company.id == company_id))
        c = company.scalar_one_or_none()
        if c:
            c.status = "enriched"
            c.scraped_at = datetime.now(timezone.utc)
            if result["about_text"]:
                c.about_text = result["about_text"]
            if result["size_estimate"]:
                c.size_estimate = result["size_estimate"]

        await db.commit()


@router.post("/batch")
async def enrich_batch(background_tasks: BackgroundTasks, limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company)
        .where(Company.status == "new", Company.website.isnot(None))
        .limit(limit)
    )
    companies = result.scalars().all()

    count = 0
    for company in companies:
        background_tasks.add_task(_enrich_company, company.id, company.website)
        count += 1

    return {"status": "enriching", "count": count}


@router.post("/{company_id}")
async def enrich_company(company_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        return {"error": "Company not found"}
    if not company.website:
        return {"error": "Company has no website"}

    background_tasks.add_task(_enrich_company, company_id, company.website)
    return {"status": "enriching", "company_id": company_id}


@router.post("/{company_id}/hunter")
async def hunter_enrich(company_id: str, db: AsyncSession = Depends(get_db)):
    """Search Hunter.io for owner/staff emails for this company."""
    if not settings.hunter_api_key:
        raise HTTPException(status_code=503, detail="Hunter API key not configured")

    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company.website:
        raise HTTPException(status_code=400, detail="Company has no website")

    contacts = await hunter.domain_search(company.website)

    if not contacts:
        return {"found": 0, "contacts": []}

    existing = await db.execute(select(Contact).where(Contact.company_id == company_id))
    existing_emails = {c.email.lower() for c in existing.scalars().all()}

    added = []
    for c in contacts:
        if c["email"].lower() in existing_emails:
            continue
        contact = Contact(
            company_id=company_id,
            email=c["email"],
            name=c.get("name"),
            role=c.get("role"),
            verified=c.get("verified", False),
            source="hunter",
        )
        db.add(contact)
        existing_emails.add(c["email"].lower())
        added.append(c)

    await db.commit()
    return {"found": len(added), "contacts": added}


class FindEmailRequest(BaseModel):
    first_name: str
    last_name: str


@router.post("/{company_id}/hunter/find")
async def hunter_find_email(company_id: str, body: FindEmailRequest, db: AsyncSession = Depends(get_db)):
    """Find a specific person's email by name using Hunter.io."""
    if not settings.hunter_api_key:
        raise HTTPException(status_code=503, detail="Hunter API key not configured")

    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company.website:
        raise HTTPException(status_code=400, detail="Company has no website")

    found = await hunter.find_email(company.website, body.first_name, body.last_name)
    if not found:
        return {"found": False}

    existing = await db.execute(
        select(Contact).where(Contact.company_id == company_id, Contact.email == found["email"])
    )
    if not existing.scalar_one_or_none():
        contact = Contact(
            company_id=company_id,
            email=found["email"],
            name=found.get("name"),
            role=found.get("role"),
            verified=found.get("verified", False),
            source="hunter",
        )
        db.add(contact)
        await db.commit()

    return {"found": True, **found}
