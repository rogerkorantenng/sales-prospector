from unittest.mock import MagicMock, patch
from app.services.sendgrid_client import SendGridService


def test_build_message():
    service = SendGridService(
        api_key="test-key",
        from_email="hello@brownshift.com",
        from_name="Brownshift Technologies",
    )
    message = service._build_message(
        to_email="info@company.com",
        subject="Hello",
        body="Test body",
    )
    assert message.from_email.email == "hello@brownshift.com"
    assert message.subject.get() == "Hello"


@patch("app.services.sendgrid_client.SendGridAPIClient")
def test_send_email_returns_message_id(mock_sg_class):
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.status_code = 202
    mock_response.headers = {"X-Message-Id": "abc123"}
    mock_client.send.return_value = mock_response
    mock_sg_class.return_value = mock_client

    service = SendGridService(
        api_key="test-key",
        from_email="hello@brownshift.com",
        from_name="Brownshift Technologies",
    )

    result = service.send_email(
        to_email="info@company.com",
        subject="Test Subject",
        body="Test body content",
    )

    assert result["success"] is True
    assert result["message_id"] == "abc123"


@patch("app.services.sendgrid_client.SendGridAPIClient")
def test_send_email_handles_failure(mock_sg_class):
    mock_client = MagicMock()
    mock_client.send.side_effect = Exception("API error")
    mock_sg_class.return_value = mock_client

    service = SendGridService(
        api_key="test-key",
        from_email="hello@brownshift.com",
        from_name="Brownshift Technologies",
    )

    result = service.send_email(
        to_email="info@company.com",
        subject="Test",
        body="Test",
    )

    assert result["success"] is False
    assert "error" in result
