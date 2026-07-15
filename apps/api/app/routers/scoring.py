from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db, async_session
from app.config import settings
from app.models.tables import Company, LeadScore, AIAnalysis
from app.services.ai_analyzer import AIAnalyzerService

router = APIRouter(prefix="/scoring", tags=["scoring"])
ai_service = AIAnalyzerService(region=settings.aws_region)

SCORING_SYSTEM_PROMPT = """You are a lead scoring analyst for Brownshift Technologies, a software development and IT consulting company based in Ghana that helps SMEs with technology.

Score this company on multiple dimensions. Return JSON only.

Output format:
{
    "technology_gap": 0-100,
    "size_fit": 0-100,
    "budget_likelihood": 0-100,
    "industry_match": 0-100,
    "urgency": 0-100,
    "overall_score": 0-100,
    "reasoning": {
        "technology_gap": "explanation",
        "size_fit": "explanation",
        "budget_likelihood": "explanation",
        "industry_match": "explanation",
        "urgency": "explanation",
        "overall": "explanation"
    },
    "estimated_deal_value": dollar amount integer,
    "deal_probability": 0-100
}

Scoring guidelines:
- technology_gap: How much they need modern technology solutions
- size_fit: How well they match Brownshift's target of SMEs (too big or too small = low score)
- budget_likelihood: Estimated ability to pay for tech services based on industry and size
- industry_match: How relevant Brownshift's software/IT services are to their industry
- urgency: How soon they might need services based on their current digital state
- overall_score: Weighted average (technology_gap 25%, industry_match 25%, budget_likelihood 20%, size_fit 15%, urgency 15%)
- estimated_deal_value: Estimated contract value in USD based on company size and services needed
- deal_probability: Percentage chance of closing the deal"""


async def _score_company(company_id: str):
    async with async_session() as db:
        result = await db.execute(select(Company).where(Company.id == company_id))
        c = result.scalar_one_or_none()
        if not c:
            return

        # Get latest analysis if available
        analysis_result = await db.execute(
            select(AIAnalysis).where(AIAnalysis.company_id == company_id)
            .order_by(AIAnalysis.analyzed_at.desc())
        )
        analysis = analysis_result.scalar_one_or_none()

        analysis_context = ""
        if analysis:
            services = [s.get("service_name", "") for s in analysis.recommended_services]
            analysis_context = f"""
Previous AI Analysis:
- Recommended services: {', '.join(services)}
- Pain points: {', '.join(analysis.pain_points) if analysis.pain_points else 'None identified'}
- Confidence: {analysis.confidence_score}/100
- Reasoning: {analysis.reasoning}"""

        user_message = f"""Company: {c.name}
Industry: {c.industry or 'unknown'}
Location: {c.city or c.region or 'Ghana'}
Size estimate: {c.size_estimate or 'unknown'}
Website: {c.website or 'no website'}
About: {c.about_text or 'No information available'}
{analysis_context}

Score this lead for Brownshift Technologies."""

        ai_result = await ai_service._ainvoke(SCORING_SYSTEM_PROMPT, user_message)

        deal_value = ai_result.get("estimated_deal_value", 0)
        deal_prob = ai_result.get("deal_probability", 0)

        score = LeadScore(
            company_id=company_id,
            technology_gap=ai_result["technology_gap"],
            size_fit=ai_result["size_fit"],
            budget_likelihood=ai_result["budget_likelihood"],
            industry_match=ai_result["industry_match"],
            urgency=ai_result["urgency"],
            overall_score=ai_result["overall_score"],
            reasoning=ai_result["reasoning"],
            estimated_deal_value=deal_value,
            deal_probability=deal_prob,
        )
        db.add(score)
        await db.commit()


@router.post("/batch")
async def score_batch(background_tasks: BackgroundTasks, limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company.id).where(Company.status.in_(["analyzed", "enriched"])).limit(limit)
    )
    company_ids = [row[0] for row in result.all()]

    for cid in company_ids:
        background_tasks.add_task(_score_company, cid)

    return {"status": "scoring", "count": len(company_ids)}


@router.post("/{company_id}")
async def score_company(company_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Company not found")

    background_tasks.add_task(_score_company, company_id)
    return {"status": "scoring", "company_id": company_id}


@router.get("/{company_id}")
async def get_score(company_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LeadScore).where(LeadScore.company_id == company_id)
        .order_by(LeadScore.scored_at.desc())
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(status_code=404, detail="No score found for this company")

    expected_revenue = round(score.estimated_deal_value * score.deal_probability / 100)

    return {
        "id": score.id,
        "company_id": score.company_id,
        "technology_gap": score.technology_gap,
        "size_fit": score.size_fit,
        "budget_likelihood": score.budget_likelihood,
        "industry_match": score.industry_match,
        "urgency": score.urgency,
        "overall_score": score.overall_score,
        "reasoning": score.reasoning,
        "estimated_deal_value": score.estimated_deal_value,
        "deal_probability": score.deal_probability,
        "expected_revenue": expected_revenue,
        "scored_at": score.scored_at.isoformat() if score.scored_at else None,
    }
