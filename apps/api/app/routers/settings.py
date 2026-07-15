from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db
from app.models.tables import ServiceCatalog

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/services")
async def list_services(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ServiceCatalog).order_by(ServiceCatalog.name))
    services = result.scalars().all()
    return [
        {"id": s.id, "name": s.name, "description": s.description, "keywords": s.keywords, "active": s.active}
        for s in services
    ]


@router.post("/services")
async def create_service(name: str, description: str, keywords: list[str] | None = None, db: AsyncSession = Depends(get_db)):
    service = ServiceCatalog(name=name, description=description, keywords=keywords or [])
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return {"id": service.id, "name": service.name, "description": service.description, "keywords": service.keywords, "active": service.active}


@router.patch("/services/{service_id}")
async def update_service(
    service_id: str,
    name: str | None = None,
    description: str | None = None,
    active: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ServiceCatalog).where(ServiceCatalog.id == service_id))
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    if name is not None:
        service.name = name
    if description is not None:
        service.description = description
    if active is not None:
        service.active = active

    await db.commit()
    await db.refresh(service)
    return {"id": service.id, "name": service.name, "description": service.description, "active": service.active}


@router.delete("/services/{service_id}")
async def delete_service(service_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ServiceCatalog).where(ServiceCatalog.id == service_id))
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    await db.delete(service)
    await db.commit()
    return {"deleted": True}
