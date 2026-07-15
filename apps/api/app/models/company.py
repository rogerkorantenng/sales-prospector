from pydantic import BaseModel
from datetime import datetime


class CompanyBase(BaseModel):
    name: str
    website: str | None = None
    phone: str | None = None
    industry: str | None = None
    category: str | None = None
    region: str | None = None
    city: str | None = None
    address: str | None = None
    size_estimate: str | None = None
    google_maps_id: str | None = None
    source: str = "google_maps"


class CompanyCreate(CompanyBase):
    pass


class Company(CompanyBase):
    id: str
    about_text: str | None = None
    scraped_at: datetime | None = None
    status: str = "new"
    created_at: datetime
    updated_at: datetime


class ContactBase(BaseModel):
    name: str | None = None
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    source: str = "website"


class ContactCreate(ContactBase):
    company_id: str


class Contact(ContactBase):
    id: str
    company_id: str
    verified: bool = False
    created_at: datetime
