import json
import pytest
from unittest.mock import MagicMock, patch
from app.services.ai_analyzer import AIAnalyzerService


@pytest.fixture
def mock_bedrock_client():
    mock_client = MagicMock()

    def make_response(data):
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps({
            "content": [{"text": json.dumps(data)}]
        }).encode()
        return {"body": mock_body}

    return mock_client, make_response


@pytest.mark.asyncio
async def test_analyze_company(mock_bedrock_client):
    mock_client, make_response = mock_bedrock_client

    analysis_data = {
        "recommended_services": [
            {
                "service_name": "Payroll Management System",
                "relevance": "high",
                "reason": "School with multiple campuses needs automated payroll",
            }
        ],
        "pain_points": ["Manual payroll processing", "No centralized HR system"],
        "confidence_score": 85,
        "reasoning": "Educational institution with multiple branches likely processes payroll manually.",
    }
    mock_client.invoke_model.return_value = make_response(analysis_data)

    with patch("boto3.client", return_value=mock_client):
        service = AIAnalyzerService(region="us-east-1")
        result = await service.analyze_company(
            company_name="Kumasi Royal Schools",
            industry="education",
            city="Kumasi",
            about_text="A private school with campuses in Kumasi and Accra.",
            service_catalog=["Payroll Management System", "Custom Web Application"],
        )

    assert result["confidence_score"] == 85
    assert len(result["recommended_services"]) == 1
    assert result["recommended_services"][0]["service_name"] == "Payroll Management System"


@pytest.mark.asyncio
async def test_draft_email(mock_bedrock_client):
    mock_client, make_response = mock_bedrock_client

    email_data = {
        "subject": "Streamline Payroll at Kumasi Royal Schools",
        "body": "Dear Sir/Madam,\n\nI noticed Kumasi Royal Schools operates across multiple campuses...",
    }
    mock_client.invoke_model.return_value = make_response(email_data)

    with patch("boto3.client", return_value=mock_client):
        service = AIAnalyzerService(region="us-east-1")
        result = await service.draft_email(
            company_name="Kumasi Royal Schools",
            industry="education",
            recommended_services=["Payroll Management System"],
            reasoning="School needs automated payroll",
            tone="professional",
        )

    assert "subject" in result
    assert "body" in result
    assert len(result["subject"]) > 0
