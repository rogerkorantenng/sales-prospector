import pytest
from unittest.mock import AsyncMock, patch
from app.services.google_maps import GoogleMapsService


@pytest.mark.asyncio
async def test_search_places_returns_companies(sample_places_response):
    service = GoogleMapsService(api_key="test-key")

    with patch.object(service, "_search_nearby", new_callable=AsyncMock) as mock:
        mock.return_value = sample_places_response["places"]
        results = await service.search_places(
            latitude=5.6037,
            longitude=-0.1870,
            radius_km=10,
            place_type="it_services",
        )

    assert len(results) == 1
    assert results[0]["name"] == "Accra Digital Centre"
    assert results[0]["phone"] == "+233 30 277 1234"
    assert results[0]["website"] == "https://accradigital.com"
    assert results[0]["google_maps_id"] == "ChIJx8SRZhSj3w8RkA0S7ZfAFRo"


@pytest.mark.asyncio
async def test_search_places_skips_entries_without_name():
    service = GoogleMapsService(api_key="test-key")

    with patch.object(service, "_search_nearby", new_callable=AsyncMock) as mock:
        mock.return_value = [{"id": "abc", "formattedAddress": "123 Main St"}]
        results = await service.search_places(
            latitude=5.6037, longitude=-0.1870, radius_km=10, place_type="restaurant"
        )

    assert len(results) == 0
