import pytest


@pytest.fixture
def sample_places_response():
    return {
        "places": [
            {
                "id": "ChIJx8SRZhSj3w8RkA0S7ZfAFRo",
                "displayName": {"text": "Accra Digital Centre"},
                "formattedAddress": "10 Independence Ave, Accra",
                "nationalPhoneNumber": "+233 30 277 1234",
                "websiteUri": "https://accradigital.com",
                "primaryType": "it_services",
                "rating": 4.2,
                "location": {"latitude": 5.6037, "longitude": -0.1870},
            }
        ]
    }
