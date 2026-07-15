from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content


class SendGridService:
    def __init__(self, api_key: str, from_email: str, from_name: str):
        self.client = SendGridAPIClient(api_key=api_key)
        self.from_email = from_email
        self.from_name = from_name

    def _build_message(self, to_email: str, subject: str, body: str) -> Mail:
        message = Mail(
            from_email=Email(self.from_email, self.from_name),
            to_emails=To(to_email),
            subject=subject,
            plain_text_content=Content("text/plain", body),
        )
        return message

    def send_email(self, to_email: str, subject: str, body: str) -> dict:
        message = self._build_message(to_email, subject, body)
        try:
            response = self.client.send(message)
            return {
                "success": response.status_code in (200, 201, 202),
                "status_code": response.status_code,
                "message_id": response.headers.get("X-Message-Id"),
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }
