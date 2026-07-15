from pydantic import BaseModel
from datetime import datetime


class EmailCreate(BaseModel):
    company_id: str
    contact_id: str | None = None
    campaign_id: str | None = None
    subject: str
    body: str
    tone: str = "professional"


class EmailUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    tone: str | None = None
    status: str | None = None
    scheduled_at: datetime | None = None


class Email(BaseModel):
    id: str
    company_id: str
    contact_id: str | None = None
    campaign_id: str | None = None
    subject: str
    body: str
    tone: str
    status: str
    scheduled_at: datetime | None = None
    sent_at: datetime | None = None
    sendgrid_id: str | None = None
    opened_at: datetime | None = None
    clicked_at: datetime | None = None
    replied_at: datetime | None = None
    created_at: datetime


class CampaignCreate(BaseModel):
    name: str
    target_regions: list[str] = []
    target_industries: list[str] = []


class Campaign(BaseModel):
    id: str
    name: str
    target_regions: list[str]
    target_industries: list[str]
    status: str
    stats: dict
    created_at: datetime
