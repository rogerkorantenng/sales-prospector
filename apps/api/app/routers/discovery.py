from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db import get_db, async_session
from app.config import settings
from app.models.discovery import DiscoveryConfig, DiscoveryRunCreate
from app.models.tables import DiscoveryRun, Company
from app.services.google_maps import GoogleMapsService, GHANA_REGIONS

router = APIRouter(prefix="/discovery", tags=["discovery"])
maps_service = GoogleMapsService(api_key=settings.google_maps_api_key)


def _normalize_name(name: str) -> str:
    """Normalize company name for dedup comparison."""
    return name.lower().strip().replace("  ", " ")


async def _is_duplicate(db, place: dict) -> bool:
    """Check if a company already exists by google_maps_id, or by name+region."""
    # Check by Google Maps ID first (exact match)
    if place.get("google_maps_id"):
        result = await db.execute(
            select(Company.id).where(Company.google_maps_id == place["google_maps_id"])
        )
        if result.scalar_one_or_none():
            return True

    # Check by normalized name + phone (fuzzy dedup)
    normalized = _normalize_name(place["name"])
    query = select(Company.id).where(
        func.lower(func.trim(Company.name)) == normalized
    )
    if place.get("phone"):
        query = query.where(Company.phone == place["phone"])

    result = await db.execute(query)
    if result.scalar_one_or_none():
        return True

    return False


async def _run_discovery(run_id: str, config: DiscoveryConfig):
    total_found = 0
    skipped = 0
    async with async_session() as db:
        try:
            industries = config.industries or [
                "restaurant", "school", "hospital", "store", "bank", "hotel",
                "pharmacy", "supermarket",
            ]

            for region in config.regions:
                for industry in industries:
                    results = await maps_service.discover_region(
                        region=region, industry=industry, radius_km=config.radius_km
                    )
                    for place in results:
                        if await _is_duplicate(db, place):
                            skipped += 1
                            continue

                        company = Company(
                            name=place["name"],
                            website=place.get("website"),
                            phone=place.get("phone"),
                            industry=industry,
                            category=place.get("category"),
                            region=region,
                            city=config.cities[0] if config.cities else region,
                            address=place.get("address"),
                            google_maps_id=place["google_maps_id"],
                            source="google_maps",
                        )
                        db.add(company)
                        total_found += 1

                    # Flush after each industry to avoid huge batch
                    await db.flush()

            await db.commit()

            result = await db.execute(select(DiscoveryRun).where(DiscoveryRun.id == run_id))
            run = result.scalar_one()
            run.status = "completed"
            run.companies_found = total_found
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception:
            await db.rollback()
            result = await db.execute(select(DiscoveryRun).where(DiscoveryRun.id == run_id))
            run = result.scalar_one_or_none()
            if run:
                run.status = "failed"
                await db.commit()
            raise


@router.post("/run")
async def start_discovery(body: DiscoveryRunCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    run = DiscoveryRun(config=body.config.model_dump(), status="running")
    db.add(run)
    await db.commit()
    await db.refresh(run)

    background_tasks.add_task(_run_discovery, run.id, body.config)
    return {"id": run.id, "status": "running"}


@router.get("/runs")
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DiscoveryRun).order_by(DiscoveryRun.started_at.desc()).limit(50)
    )
    runs = result.scalars().all()
    return [
        {
            "id": r.id, "config": r.config, "status": r.status,
            "companies_found": r.companies_found, "contacts_found": r.contacts_found,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DiscoveryRun).where(DiscoveryRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": run.id, "config": run.config, "status": run.status,
        "companies_found": run.companies_found, "started_at": run.started_at.isoformat(),
    }


@router.get("/regions")
async def list_regions():
    return list(GHANA_REGIONS.keys())
