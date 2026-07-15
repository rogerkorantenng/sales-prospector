from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db, async_session
from app.config import settings
from app.models.tables import Company, CompetitorIntel
from app.services.ai_analyzer import AIAnalyzerService
from app.services.scraper import WebsiteScraper

router = APIRouter(prefix="/intelligence", tags=["intelligence"])
ai_service = AIAnalyzerService(region=settings.aws_region)
scraper = WebsiteScraper()

INTEL_SYSTEM_PROMPT = """You are a competitive intelligence analyst for Brownshift Technologies, a software development and IT consulting company based in Ghana.

Analyze the company's website content to understand their current technology stack and digital maturity. Return JSON only.

Output format:
{
    "current_technologies": ["list of technologies or platforms they currently use, e.g. WordPress, Wix, manual forms, WhatsApp for orders"],
    "digital_maturity": "low" | "medium" | "high",
    "gaps": ["list of technology gaps, e.g. no online booking, no payment system, no mobile app"],
    "opportunities": ["list of service opportunities for Brownshift, e.g. custom web app, payment integration, inventory system"]
}

Guidelines:
- digital_maturity: "low" = basic or no web presence, "medium" = has website but limited functionality, "high" = modern web presence with multiple digital tools
- Look for signs of manual processes, outdated technology, missing features
- Be specific about what technologies they lack and what Brownshift could provide"""


async def _analyze_intel(company_id: str):
    async with async_session() as db:
        result = await db.execute(select(Company).where(Company.id == company_id))
        c = result.scalar_one_or_none()
        if not c:
            return

        website_content = ""
        if c.website:
            try:
                scrape_result = await scraper.scrape_company(c.website)
                website_content = scrape_result.get("about_text", "") or ""
            except Exception:
                website_content = ""

        user_message = f"""Company: {c.name}
Industry: {c.industry or 'unknown'}
Location: {c.city or c.region or 'Ghana'}
Website: {c.website or 'no website'}
Website content: {website_content or 'Could not scrape website content'}
About (from previous scrape): {c.about_text or 'No information available'}

Analyze this company's technology landscape and identify opportunities."""

        ai_result = await ai_service._ainvoke(INTEL_SYSTEM_PROMPT, user_message)

        intel = CompetitorIntel(
            company_id=company_id,
            current_technologies=ai_result.get("current_technologies", []),
            digital_maturity=ai_result.get("digital_maturity", "low"),
            gaps=ai_result.get("gaps", []),
            opportunities=ai_result.get("opportunities", []),
        )
        db.add(intel)
        await db.commit()


@router.post("/batch")
async def intel_batch(background_tasks: BackgroundTasks, limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company.id).where(Company.status.in_(["enriched", "analyzed"])).limit(limit)
    )
    company_ids = [row[0] for row in result.all()]

    for cid in company_ids:
        background_tasks.add_task(_analyze_intel, cid)

    return {"status": "analyzing", "count": len(company_ids)}


@router.post("/{company_id}")
async def analyze_company_intel(company_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Company not found")

    background_tasks.add_task(_analyze_intel, company_id)
    return {"status": "analyzing", "company_id": company_id}


@router.get("/{company_id}")
async def get_company_intel(company_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CompetitorIntel).where(CompetitorIntel.company_id == company_id)
        .order_by(CompetitorIntel.analyzed_at.desc())
    )
    intel = result.scalar_one_or_none()
    if not intel:
        raise HTTPException(status_code=404, detail="No intelligence found for this company")

    return {
        "id": intel.id,
        "company_id": intel.company_id,
        "current_technologies": intel.current_technologies,
        "digital_maturity": intel.digital_maturity,
        "gaps": intel.gaps,
        "opportunities": intel.opportunities,
        "analyzed_at": intel.analyzed_at.isoformat() if intel.analyzed_at else None,
    }
