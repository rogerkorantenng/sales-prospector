import httpx
from urllib.parse import urlparse


class HunterService:
    BASE_URL = "https://api.hunter.io/v2"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _domain_from_website(self, website: str) -> str:
        parsed = urlparse(website if "://" in website else f"https://{website}")
        return parsed.netloc.removeprefix("www.") or website

    async def domain_search(self, website: str) -> list[dict]:
        """Get all emails found for a domain, sorted by decision-maker confidence."""
        domain = self._domain_from_website(website)
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.BASE_URL}/domain-search",
                params={"domain": domain, "api_key": self.api_key, "limit": 10},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})

        emails = data.get("emails", [])

        # Sort: seniority (executive > senior > junior) then confidence desc
        seniority_order = {"executive": 0, "senior": 1, "junior": 2, None: 3}
        emails.sort(key=lambda e: (seniority_order.get(e.get("seniority"), 3), -e.get("confidence", 0)))

        return [
            {
                "email": e["value"],
                "name": f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() or None,
                "role": e.get("position"),
                "seniority": e.get("seniority"),
                "confidence": e.get("confidence", 0),
                "verified": e.get("verification", {}).get("status") == "valid",
                "source": "hunter",
            }
            for e in emails
            if e.get("value")
        ]

    async def find_email(self, website: str, first_name: str, last_name: str) -> dict | None:
        """Find a specific person's email by name + domain."""
        domain = self._domain_from_website(website)
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.BASE_URL}/email-finder",
                params={
                    "domain": domain,
                    "first_name": first_name,
                    "last_name": last_name,
                    "api_key": self.api_key,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})

        if not data.get("email"):
            return None

        return {
            "email": data["email"],
            "name": f"{first_name} {last_name}".strip(),
            "role": data.get("position"),
            "confidence": data.get("score", 0),
            "verified": data.get("verification", {}).get("status") == "valid",
            "source": "hunter",
        }
