from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db, async_session
from app.config import settings
from app.models.tables import Company, AIAnalysis, ServiceCatalog
from app.services.ai_analyzer import AIAnalyzerService

router = APIRouter(prefix="/analysis", tags=["analysis"])
ai_service = AIAnalyzerService(region=settings.aws_region)


async def _get_service_catalog(db: AsyncSession) -> list[str]:
    result = await db.execute(select(ServiceCatalog.name).where(ServiceCatalog.active.is_(True)))
    return [row[0] for row in result.all()]


async def _analyze_company(company_id: str):
    async with async_session() as db:
        result = await db.execute(select(Company).where(Company.id == company_id))
        c = result.scalar_one_or_none()
        if not c:
            return

        catalog = await _get_service_catalog(db)

        ai_result = await ai_service.analyze_company(
            company_name=c.name,
            industry=c.industry or "unknown",
            city=c.city or "unknown",
            about_text=c.about_text,
            service_catalog=catalog,
        )

        analysis = AIAnalysis(
            company_id=company_id,
            recommended_services=ai_result["recommended_services"],
            pain_points=ai_result["pain_points"],
            confidence_score=ai_result["confidence_score"],
            reasoning=ai_result["reasoning"],
            suggested_send_time=ai_result.get("suggested_send_time"),
        )
        db.add(analysis)
        c.status = "analyzed"
        await db.commit()


@router.post("/batch")
async def analyze_batch(background_tasks: BackgroundTasks, limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company.id).where(Company.status == "enriched").limit(limit)
    )
    company_ids = [row[0] for row in result.all()]

    for cid in company_ids:
        background_tasks.add_task(_analyze_company, cid)

    return {"status": "analyzing", "count": len(company_ids)}


@router.post("/{company_id}")
async def analyze_company(company_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_analyze_company, company_id)
    return {"status": "analyzing", "company_id": company_id}
