import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class SMTPService:
    def __init__(self, host: str, port: int, username: str, password: str, from_email: str, from_name: str, use_tls: bool = True):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.from_email = from_email
        self.from_name = from_name
        self.use_tls = use_tls

    def send_email(self, to_email: str, subject: str, body_html: str, body_text: str | None = None, extra_to: list[str] | None = None) -> dict:
        reply_to = "rogerkorantenng@gmail.com"
        cc_addresses = ["roger.koranteng@brownshift.com"]

        all_to = [to_email] + (extra_to or [])

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = ", ".join(all_to)
        msg["Subject"] = subject
        msg["Reply-To"] = reply_to
        msg["Cc"] = ", ".join(cc_addresses)
        # Tag with SES configuration set to enable bounce/complaint tracking
        msg["X-SES-CONFIGURATION-SET"] = "prospector-emails"

        if body_text:
            msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        recipients = all_to + cc_addresses

        try:
            with smtplib.SMTP(self.host, self.port) as server:
                if self.use_tls:
                    server.starttls()
                server.login(self.username, self.password)
                server.sendmail(self.from_email, recipients, msg.as_string())
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
