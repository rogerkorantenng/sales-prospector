from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db, async_session
from app.config import settings
from app.models.tables import (
    PipelineRun, Company, Contact, AIAnalysis, Email, ServiceCatalog,
)
from app.services.google_maps import GoogleMapsService
from app.services.scraper import WebsiteScraper
from app.services.ai_analyzer import AIAnalyzerService

router = APIRouter(prefix="/pipeline", tags=["pipeline"])
maps_service = GoogleMapsService(api_key=settings.google_maps_api_key)
scraper = WebsiteScraper()
ai_service = AIAnalyzerService(region=settings.aws_region)


class PipelineConfig(BaseModel):
    regions: list[str]
    industries: list[str] = []
    radius_km: int = 10


class PipelineRunRequest(BaseModel):
    config: PipelineConfig


async def _get_service_catalog(db: AsyncSession) -> list[str]:
    result = await db.execute(select(ServiceCatalog.name).where(ServiceCatalog.active == True))  # noqa: E712
    return [row[0] for row in result.all()]


async def _run_pipeline(run_id: str, config: PipelineConfig):
    async with async_session() as db:
        try:
            # --- Step 1: Discover ---
            result = await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
            run = result.scalar_one()
            run.current_step = "discovering"
            await db.commit()

            discovered_ids: list[str] = []
            industries = config.industries or ["restaurant", "school", "hospital", "store", "bank", "hotel"]
            for region in config.regions:
                for industry in industries:
                    results = await maps_service.discover_region(
                        region=region, industry=industry, radius_km=config.radius_km,
                    )
                    for place in results:
                        existing = await db.execute(
                            select(Company).where(Company.google_maps_id == place["google_maps_id"])
                        )
                        if not existing.scalar_one_or_none():
                            company = Company(
                                name=place["name"],
                                website=place.get("website"),
                                phone=place.get("phone"),
                                industry=industry,
                                category=place.get("category"),
                                region=region,
                                city=region,
                                address=place.get("address"),
                                google_maps_id=place["google_maps_id"],
                                source="google_maps",
                            )
                            db.add(company)
                            await db.flush()
                            discovered_ids.append(company.id)

            await db.commit()
            run.progress = {**run.progress, "discovered": len(discovered_ids)}
            await db.commit()

            # --- Step 2: Enrich ---
            run.current_step = "enriching"
            await db.commit()

            enriched_ids: list[str] = []
            for cid in discovered_ids:
                c_result = await db.execute(select(Company).where(Company.id == cid))
                c = c_result.scalar_one_or_none()
                if not c or not c.website:
                    continue
                try:
                    scrape_result = await scraper.scrape_company(c.website)
                    for email in scrape_result["emails"]:
                        contact = Contact(company_id=cid, email=email, source="website")
                        db.add(contact)
                    c.status = "enriched"
                    c.scraped_at = datetime.now(timezone.utc)
                    if scrape_result["about_text"]:
                        c.about_text = scrape_result["about_text"]
                    if scrape_result["size_estimate"]:
                        c.size_estimate = scrape_result["size_estimate"]
                    enriched_ids.append(cid)
                except Exception:
                    continue

            await db.commit()
            run.progress = {**run.progress, "enriched": len(enriched_ids)}
            await db.commit()

            # --- Step 3: Analyze ---
            run.current_step = "analyzing"
            await db.commit()

            catalog = await _get_service_catalog(db)
            analyzed_ids: list[str] = []
            for cid in enriched_ids:
                c_result = await db.execute(select(Company).where(Company.id == cid))
                c = c_result.scalar_one_or_none()
                if not c:
                    continue
                try:
                    ai_result = await ai_service.analyze_company(
                        company_name=c.name,
                        industry=c.industry or "unknown",
                        city=c.city or "unknown",
                        about_text=c.about_text,
                        service_catalog=catalog,
                    )
                    analysis = AIAnalysis(
                        company_id=cid,
                        recommended_services=ai_result["recommended_services"],
                        pain_points=ai_result["pain_points"],
                        confidence_score=ai_result["confidence_score"],
                        reasoning=ai_result["reasoning"],
                        suggested_send_time=ai_result.get("suggested_send_time"),
                    )
                    db.add(analysis)
                    c.status = "analyzed"
                    analyzed_ids.append(cid)
                except Exception:
                    continue

            await db.commit()
            run.progress = {**run.progress, "analyzed": len(analyzed_ids)}
            await db.commit()

            # --- Step 4: Draft emails ---
            run.current_step = "drafting"
            await db.commit()

            drafted = 0
            for cid in analyzed_ids:
                c_result = await db.execute(
                    select(Company).where(Company.id == cid)
                )
                c = c_result.scalar_one_or_none()
                if not c:
                    continue

                a_result = await db.execute(
                    select(AIAnalysis).where(AIAnalysis.company_id == cid).order_by(AIAnalysis.analyzed_at.desc())
                )
                analysis = a_result.scalar_one_or_none()
                if not analysis:
                    continue

                try:
                    services = [s["service_name"] for s in analysis.recommended_services]
                    email_result = await ai_service.draft_email(
                        company_name=c.name,
                        industry=c.industry or "",
                        recommended_services=services,
                        reasoning=analysis.reasoning,
                        tone="professional",
                    )

                    ct_result = await db.execute(
                        select(Contact).where(Contact.company_id == cid, Contact.email.isnot(None))
                    )
                    contact = ct_result.scalar_one_or_none()

                    email = Email(
                        company_id=cid,
                        contact_id=contact.id if contact else None,
                        subject=email_result["subject"],
                        body=email_result["body"],
                        tone="professional",
                        status="draft",
                    )
                    db.add(email)
                    drafted += 1
                except Exception:
                    continue

            await db.commit()
            run.progress = {**run.progress, "drafted": drafted}
            run.status = "completed"
            run.current_step = "done"
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception:
            await db.rollback()
            result = await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
            run = result.scalar_one_or_none()
            if run:
                run.status = "failed"
                await db.commit()
            raise


@router.post("/run")
async def start_pipeline(body: PipelineRunRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    run = PipelineRun(
        config=body.config.model_dump(),
        status="running",
        current_step="queued",
        progress={"discovered": 0, "enriched": 0, "analyzed": 0, "drafted": 0},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    background_tasks.add_task(_run_pipeline, run.id, body.config)
    return {"id": run.id, "status": "running"}


@router.get("/runs")
@router.get("/runs/")
async def list_pipeline_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PipelineRun).order_by(PipelineRun.started_at.desc()).limit(50)
    )
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "status": r.status,
            "config": r.config,
            "current_step": r.current_step,
            "progress": r.progress,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_pipeline_run(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return {
        "id": run.id,
        "status": run.status,
        "config": run.config,
        "current_step": run.current_step,
        "progress": run.progress,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }
