import csv
import io
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db import get_db
from app.models.tables import Company

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/prospects")
@router.get("/prospects/")
async def export_prospects(
    format: str = Query(default="json", regex="^(csv|json)$"),
    status: str | None = None,
    region: str | None = None,
    industry: str | None = None,
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

    query = query.order_by(Company.created_at.desc())
    result = await db.execute(query)
    companies = result.scalars().unique().all()

    rows = []
    for c in companies:
        contact_emails = ", ".join(ct.email for ct in c.contacts if ct.email)
        latest_score = None
        if c.ai_analyses:
            latest_score = c.ai_analyses[-1].confidence_score

        rows.append({
            "id": c.id,
            "name": c.name,
            "website": c.website or "",
            "phone": c.phone or "",
            "industry": c.industry or "",
            "region": c.region or "",
            "city": c.city or "",
            "address": c.address or "",
            "size_estimate": c.size_estimate or "",
            "status": c.status,
            "contact_emails": contact_emails,
            "confidence_score": latest_score,
            "created_at": c.created_at.isoformat() if c.created_at else "",
        })

    if format == "csv":
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        else:
            writer = csv.writer(output)
            writer.writerow(["id", "name", "website", "phone", "industry", "region", "city", "address", "size_estimate", "status", "contact_emails", "confidence_score", "created_at"])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=prospects.csv"},
        )

    return JSONResponse(content=rows)
