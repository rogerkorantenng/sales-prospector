from pydantic import BaseModel
from datetime import datetime


class ServiceRecommendation(BaseModel):
    service_name: str
    relevance: str  # "high", "medium", "low"
    reason: str


class AIAnalysisCreate(BaseModel):
    company_id: str
    recommended_services: list[ServiceRecommendation]
    pain_points: list[str]
    confidence_score: int
    reasoning: str
    model_used: str = "claude-sonnet-4-20250514"


class AIAnalysis(AIAnalysisCreate):
    id: str
    analyzed_at: datetime
