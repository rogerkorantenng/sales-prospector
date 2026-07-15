import httpx

# Ghana region centers with sub-points for grid search
GHANA_REGIONS = {
    "Greater Accra": [
        {"lat": 5.6037, "lng": -0.1870, "name": "Central Accra"},
        {"lat": 5.6350, "lng": -0.1650, "name": "East Legon / Airport"},
        {"lat": 5.5770, "lng": -0.2300, "name": "Dansoman / Mamprobi"},
        {"lat": 5.6650, "lng": -0.2180, "name": "Achimota / Dome"},
        {"lat": 5.6400, "lng": -0.1100, "name": "Tema / Spintex"},
        {"lat": 5.6900, "lng": -0.2600, "name": "Amasaman / Pokuase"},
    ],
    "Ashanti": [
        {"lat": 6.6885, "lng": -1.6244, "name": "Kumasi Central"},
        {"lat": 6.7200, "lng": -1.5800, "name": "Kumasi East"},
        {"lat": 6.6500, "lng": -1.6700, "name": "Kumasi West"},
    ],
    "Western": [
        {"lat": 5.0527, "lng": -1.7596, "name": "Takoradi"},
        {"lat": 4.9300, "lng": -1.7700, "name": "Sekondi"},
    ],
    "Eastern": [
        {"lat": 6.1042, "lng": -0.2572, "name": "Koforidua"},
    ],
    "Central": [
        {"lat": 5.1315, "lng": -1.2795, "name": "Cape Coast"},
    ],
    "Northern": [
        {"lat": 9.4034, "lng": -0.8424, "name": "Tamale"},
    ],
    "Volta": [
        {"lat": 6.6126, "lng": 0.4677, "name": "Ho"},
    ],
    "Bono": [
        {"lat": 7.3500, "lng": -2.3333, "name": "Sunyani"},
    ],
    "Upper East": [
        {"lat": 10.7852, "lng": -0.8582, "name": "Bolgatanga"},
    ],
    "Upper West": [
        {"lat": 10.0601, "lng": -2.5099, "name": "Wa"},
    ],
}

# Map each industry to MULTIPLE place types for broader coverage
INDUSTRY_TO_PLACE_TYPES = {
    "education": ["school", "university", "primary_school", "secondary_school"],
    "healthcare": ["hospital", "doctor", "dentist", "physiotherapist", "medical_lab"],
    "retail": ["store", "shopping_mall", "clothing_store", "electronics_store"],
    "finance": ["bank", "accounting", "insurance_agency", "financial_planner"],
    "hospitality": ["hotel", "resort_hotel", "guest_house", "lodging"],
    "restaurant": ["restaurant", "cafe", "bakery", "bar"],
    "pharmacy": ["pharmacy", "drugstore"],
    "supermarket": ["supermarket", "grocery_store", "convenience_store"],
}

# Fallback for single type lookup
INDUSTRY_TO_PLACE_TYPE = {k: v[0] for k, v in INDUSTRY_TO_PLACE_TYPES.items()}


class GoogleMapsService:
    BASE_URL = "https://places.googleapis.com/v1/places:searchNearby"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def _search_nearby(
        self, latitude: float, longitude: float, radius_m: int, place_type: str
    ) -> list[dict]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.BASE_URL,
                headers={
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.rating,places.location",
                },
                json={
                    "includedTypes": [place_type],
                    "locationRestriction": {
                        "circle": {
                            "center": {
                                "latitude": latitude,
                                "longitude": longitude,
                            },
                            "radius": min(radius_m, 50000),
                        }
                    },
                    "maxResultCount": 20,
                },
                timeout=15,
            )
            response.raise_for_status()
            return response.json().get("places", [])

    def _parse_place(self, place: dict) -> dict | None:
        display_name = place.get("displayName", {})
        name = display_name.get("text") if isinstance(display_name, dict) else None
        if not name:
            return None

        return {
            "name": name,
            "address": place.get("formattedAddress"),
            "phone": place.get("nationalPhoneNumber"),
            "website": place.get("websiteUri"),
            "category": place.get("primaryType"),
            "rating": place.get("rating"),
            "google_maps_id": place.get("id"),
            "latitude": place.get("location", {}).get("latitude"),
            "longitude": place.get("location", {}).get("longitude"),
        }

    async def search_places(
        self,
        latitude: float,
        longitude: float,
        radius_km: int,
        place_type: str,
    ) -> list[dict]:
        raw_places = await self._search_nearby(
            latitude, longitude, radius_km * 1000, place_type
        )

        seen_ids: set[str] = set()
        results = []
        for place in raw_places:
            parsed = self._parse_place(place)
            if parsed and parsed["google_maps_id"] not in seen_ids:
                seen_ids.add(parsed["google_maps_id"])
                results.append(parsed)

        return results

    async def discover_region(
        self, region: str, industry: str, radius_km: int = 10
    ) -> list[dict]:
        points = GHANA_REGIONS.get(region, [])
        if not points:
            return []

        # Get all place types for this industry
        place_types = INDUSTRY_TO_PLACE_TYPES.get(industry, [industry])

        seen_ids: set[str] = set()
        all_results = []

        for point in points:
            for place_type in place_types:
                try:
                    results = await self.search_places(
                        point["lat"], point["lng"], radius_km, place_type
                    )
                    for r in results:
                        if r["google_maps_id"] not in seen_ids:
                            seen_ids.add(r["google_maps_id"])
                            all_results.append(r)
                except Exception:
                    continue

        return all_results
