from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/prospector"
    google_maps_api_key: str = ""
    hunter_api_key: str = ""
    aws_region: str = "us-east-1"
    aws_account_id: str = ""
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "hello@brownshift.com"
    sendgrid_from_name: str = "Brownshift Technologies"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "hello@brownshift.com"
    smtp_from_name: str = "Brownshift Technologies"
    smtp_use_tls: bool = True
    api_cors_origins: list[str] = ["http://localhost:3000"]
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
