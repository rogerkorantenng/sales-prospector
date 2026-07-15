from pydantic import BaseModel
from datetime import datetime


class DiscoveryConfig(BaseModel):
    regions: list[str]
    cities: list[str] = []
    industries: list[str] = []
    radius_km: int = 10
    size_filter: list[str] = []  # ["micro", "small", "medium", "large"]
    has_website: bool | None = None  # None = no filter


class DiscoveryRunCreate(BaseModel):
    config: DiscoveryConfig


class DiscoveryRun(BaseModel):
    id: str
    config: dict
    status: str
    companies_found: int
    contacts_found: int
    started_at: datetime
    completed_at: datetime | None = None
