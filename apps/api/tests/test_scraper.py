import pytest
from app.services.scraper import WebsiteScraper


def test_extract_emails_from_html():
    html = """
    <html><body>
        <p>Contact us at info@example.com or sales@example.com</p>
        <p>Phone: 0302-123456</p>
    </body></html>
    """
    scraper = WebsiteScraper()
    emails = scraper.extract_emails(html)
    assert set(emails) == {"info@example.com", "sales@example.com"}


def test_extract_emails_ignores_image_extensions():
    html = '<img src="photo@2x.png"><p>real@company.com</p>'
    scraper = WebsiteScraper()
    emails = scraper.extract_emails(html)
    assert emails == ["real@company.com"]


def test_extract_phones_from_html():
    html = """
    <p>Call us: +233 30 277 1234 or 0302-123456</p>
    <p>Mobile: 0547738808</p>
    """
    scraper = WebsiteScraper()
    phones = scraper.extract_phones(html)
    assert len(phones) >= 2


def test_extract_about_text():
    html = """
    <html><body>
        <div class="about">
            <h2>About Us</h2>
            <p>We are a leading provider of educational services in Ghana.</p>
        </div>
    </body></html>
    """
    scraper = WebsiteScraper()
    about = scraper.extract_about_text(html)
    assert "leading provider" in about


@pytest.mark.asyncio
async def test_scrape_company_returns_enrichment_data(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com",
        html="<html><body><p>Contact: info@example.com</p><p>About Us: We build software.</p></body></html>",
    )
    httpx_mock.add_response(
        url="https://example.com/contact",
        html="<html><body><p>Email: sales@example.com Phone: 0302111222</p></body></html>",
    )
    httpx_mock.add_response(url="https://example.com/contact-us", status_code=404)
    httpx_mock.add_response(url="https://example.com/about", status_code=404)
    httpx_mock.add_response(url="https://example.com/about-us", status_code=404)
    httpx_mock.add_response(url="https://example.com/team", status_code=404)
    httpx_mock.add_response(url="https://example.com/our-team", status_code=404)
    httpx_mock.add_response(url="https://example.com/leadership", status_code=404)

    scraper = WebsiteScraper()
    result = await scraper.scrape_company("https://example.com")

    assert "info@example.com" in result["emails"]
    assert "sales@example.com" in result["emails"]
    assert result["about_text"] is not None
