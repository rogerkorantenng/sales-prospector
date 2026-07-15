import re
import httpx
from bs4 import BeautifulSoup

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
PHONE_REGEX = re.compile(
    r"(?:\+233|0)\s*\d[\d\s\-]{7,12}"
)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
DECISION_MAKER_TITLES = re.compile(
    r"\b(ceo|chief executive|founder|co-founder|owner|director|managing director|md|president|head of|general manager|gm|proprietor|principal)\b",
    re.IGNORECASE,
)

CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/our-team", "/leadership"]


class WebsiteScraper:
    def __init__(self, timeout: int = 10):
        self.timeout = timeout

    def extract_emails(self, html: str) -> list[str]:
        raw = EMAIL_REGEX.findall(html)
        emails = []
        for email in raw:
            lower = email.lower()
            if any(lower.endswith(ext) for ext in IMAGE_EXTENSIONS):
                continue
            if lower not in [e.lower() for e in emails]:
                emails.append(email)
        return emails

    def extract_phones(self, html: str) -> list[str]:
        return list(set(PHONE_REGEX.findall(html)))

    def extract_about_text(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")

        for selector in ["[class*='about']", "[id*='about']", "main", "article"]:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(separator=" ", strip=True)
                if len(text) > 50:
                    return text[:2000]

        body = soup.find("body")
        if body:
            text = body.get_text(separator=" ", strip=True)
            if len(text) > 50:
                return text[:2000]

        return None

    def _estimate_size(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        team_links = soup.find_all("a", string=re.compile(r"team|staff|people", re.I))
        if team_links:
            return "small"
        job_links = soup.find_all("a", string=re.compile(r"career|job|hiring", re.I))
        if job_links:
            return "medium"
        return None

    async def _fetch_page(self, client: httpx.AsyncClient, url: str) -> str | None:
        try:
            resp = await client.get(url, timeout=self.timeout, follow_redirects=True)
            if resp.status_code == 200:
                return resp.text
        except (httpx.RequestError, httpx.HTTPStatusError):
            pass
        return None

    def extract_contact_context(self, html: str) -> list[dict]:
        """Extract emails with surrounding context to identify decision-makers."""
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        contacts = []

        for match in EMAIL_REGEX.finditer(text):
            email = match.group()
            lower = email.lower()
            if any(lower.endswith(ext) for ext in IMAGE_EXTENSIONS):
                continue

            # Grab 300 chars around the email for context
            start = max(0, match.start() - 300)
            end = min(len(text), match.end() + 300)
            context = text[start:end]

            # Check if a decision-maker title appears near this email
            is_decision_maker = bool(DECISION_MAKER_TITLES.search(context))

            # Try to extract a name (words before title keywords)
            name = None
            title_match = DECISION_MAKER_TITLES.search(context)
            if title_match:
                # Look for a capitalized name in the 100 chars before the title
                before = context[:title_match.start()]
                name_match = re.search(r'([A-Z][a-z]+ [A-Z][a-z]+)\s*$', before.strip())
                if name_match:
                    name = name_match.group(1)

            role = title_match.group(0).title() if title_match else None

            contacts.append({
                "email": email,
                "name": name,
                "role": role,
                "is_decision_maker": is_decision_maker,
            })

        # Deduplicate by email, preferring decision-maker entries
        seen: dict[str, dict] = {}
        for c in contacts:
            key = c["email"].lower()
            if key not in seen or c["is_decision_maker"]:
                seen[key] = c

        return list(seen.values())

    async def scrape_company(self, website: str) -> dict:
        all_emails: list[str] = []
        all_phones: list[str] = []
        about_text: str | None = None
        size_estimate: str | None = None
        all_contacts: list[dict] = []

        base = website.rstrip("/")

        async with httpx.AsyncClient(
            headers={"User-Agent": "BrownshiftProspector/1.0"}
        ) as client:
            # Fetch main page
            main_html = await self._fetch_page(client, base)
            if main_html:
                all_emails.extend(self.extract_emails(main_html))
                all_phones.extend(self.extract_phones(main_html))
                all_contacts.extend(self.extract_contact_context(main_html))
                about_text = self.extract_about_text(main_html)
                size_estimate = self._estimate_size(main_html)

            # Fetch contact/about/team pages
            for path in CONTACT_PATHS:
                html = await self._fetch_page(client, f"{base}{path}")
                if html:
                    all_emails.extend(self.extract_emails(html))
                    all_phones.extend(self.extract_phones(html))
                    all_contacts.extend(self.extract_contact_context(html))
                    if not about_text:
                        about_text = self.extract_about_text(html)

        # Deduplicate emails
        seen_emails: set[str] = set()
        unique_emails = []
        for e in all_emails:
            if e.lower() not in seen_emails:
                seen_emails.add(e.lower())
                unique_emails.append(e)

        # Deduplicate contacts, preferring decision-maker entries
        seen_contacts: dict[str, dict] = {}
        for c in all_contacts:
            key = c["email"].lower()
            if key not in seen_contacts or c["is_decision_maker"]:
                seen_contacts[key] = c

        # Sort: decision-makers first
        sorted_contacts = sorted(seen_contacts.values(), key=lambda x: not x["is_decision_maker"])

        return {
            "emails": unique_emails,
            "contacts": sorted_contacts,
            "phones": list(set(all_phones)),
            "about_text": about_text,
            "size_estimate": size_estimate,
        }
