from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db
from app.models.tables import Sequence, SequenceEnrollment, Company, Contact

router = APIRouter(prefix="/sequences", tags=["sequences"])


class SequenceStep(BaseModel):
    delay_days: int
    template: str


class SequenceCreate(BaseModel):
    name: str
    steps: list[SequenceStep]
    campaign_id: str | None = None


@router.post("")
@router.post("/")
async def create_sequence(body: SequenceCreate, db: AsyncSession = Depends(get_db)):
    sequence = Sequence(
        name=body.name,
        steps=[s.model_dump() for s in body.steps],
        campaign_id=body.campaign_id,
        status="active",
    )
    db.add(sequence)
    await db.commit()
    await db.refresh(sequence)

    return {
        "id": sequence.id,
        "name": sequence.name,
        "steps": sequence.steps,
        "campaign_id": sequence.campaign_id,
        "status": sequence.status,
        "created_at": sequence.created_at.isoformat() if sequence.created_at else None,
    }


@router.get("")
@router.get("/")
async def list_sequences(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sequence).order_by(Sequence.created_at.desc()))
    sequences = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "steps": s.steps,
            "campaign_id": s.campaign_id,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sequences
    ]


@router.post("/{sequence_id}/enroll/{company_id}")
async def enroll_company(sequence_id: str, company_id: str, db: AsyncSession = Depends(get_db)):
    seq_result = await db.execute(select(Sequence).where(Sequence.id == sequence_id))
    sequence = seq_result.scalar_one_or_none()
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    comp_result = await db.execute(select(Company).where(Company.id == company_id))
    company = comp_result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if already enrolled
    existing = await db.execute(
        select(SequenceEnrollment).where(
            SequenceEnrollment.sequence_id == sequence_id,
            SequenceEnrollment.company_id == company_id,
            SequenceEnrollment.status == "active",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Company already enrolled in this sequence")

    # Find a contact with email
    contact_result = await db.execute(
        select(Contact).where(Contact.company_id == company_id, Contact.email.isnot(None))
    )
    contact = contact_result.scalar_one_or_none()

    # Calculate first send time from first step
    first_delay = sequence.steps[0]["delay_days"] if sequence.steps else 0
    next_send = datetime.now(timezone.utc) + timedelta(days=first_delay)

    enrollment = SequenceEnrollment(
        sequence_id=sequence_id,
        company_id=company_id,
        contact_id=contact.id if contact else None,
        current_step=0,
        status="active",
        next_send_at=next_send,
    )
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)

    return {
        "id": enrollment.id,
        "sequence_id": enrollment.sequence_id,
        "company_id": enrollment.company_id,
        "contact_id": enrollment.contact_id,
        "current_step": enrollment.current_step,
        "status": enrollment.status,
        "next_send_at": enrollment.next_send_at.isoformat() if enrollment.next_send_at else None,
        "enrolled_at": enrollment.enrolled_at.isoformat() if enrollment.enrolled_at else None,
    }


@router.get("/{sequence_id}/enrollments")
@router.get("/{sequence_id}/enrollments/")
async def list_enrollments(sequence_id: str, db: AsyncSession = Depends(get_db)):
    seq_result = await db.execute(select(Sequence).where(Sequence.id == sequence_id))
    if not seq_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sequence not found")

    result = await db.execute(
        select(SequenceEnrollment).where(SequenceEnrollment.sequence_id == sequence_id)
        .order_by(SequenceEnrollment.enrolled_at.desc())
    )
    enrollments = result.scalars().all()
    return [
        {
            "id": e.id,
            "sequence_id": e.sequence_id,
            "company_id": e.company_id,
            "contact_id": e.contact_id,
            "current_step": e.current_step,
            "status": e.status,
            "next_send_at": e.next_send_at.isoformat() if e.next_send_at else None,
            "enrolled_at": e.enrolled_at.isoformat() if e.enrolled_at else None,
        }
        for e in enrollments
    ]
