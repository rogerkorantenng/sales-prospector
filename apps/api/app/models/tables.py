import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    website: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    industry: Mapped[str | None] = mapped_column(String)
    category: Mapped[str | None] = mapped_column(String)
    region: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(Text)
    size_estimate: Mapped[str | None] = mapped_column(String)
    google_maps_id: Mapped[str | None] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, default="google_maps")
    about_text: Mapped[str | None] = mapped_column(Text)
    scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    contacts: Mapped[list["Contact"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    ai_analyses: Mapped[list["AIAnalysis"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    emails: Mapped[list["Email"]] = relationship(back_populates="company", cascade="all, delete-orphan")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str | None] = mapped_column(String)
    role: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, default="website")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship(back_populates="contacts")


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    recommended_services: Mapped[dict] = mapped_column(JSON, default=list)
    pain_points: Mapped[dict] = mapped_column(JSON, default=list)
    confidence_score: Mapped[int] = mapped_column(Integer, nullable=False)
    reasoning: Mapped[str | None] = mapped_column(Text)
    model_used: Mapped[str] = mapped_column(String, default="claude-sonnet-4-20250514")
    suggested_send_time: Mapped[str | None] = mapped_column(String)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship(back_populates="ai_analyses")


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    target_regions: Mapped[dict] = mapped_column(JSON, default=list)
    target_industries: Mapped[dict] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="active")
    stats: Mapped[dict] = mapped_column(JSON, default=lambda: {"sent": 0, "opened": 0, "clicked": 0, "replied": 0})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    emails: Mapped[list["Email"]] = relationship(back_populates="campaign")


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[str | None] = mapped_column(String, ForeignKey("contacts.id", ondelete="SET NULL"))
    campaign_id: Mapped[str | None] = mapped_column(String, ForeignKey("campaigns.id", ondelete="SET NULL"))
    subject: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    tone: Mapped[str] = mapped_column(String, default="professional")
    override_email: Mapped[str | None] = mapped_column(String)
    variant_group: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="draft")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sendgrid_id: Mapped[str | None] = mapped_column(String)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bounced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bounce_type: Mapped[str | None] = mapped_column(String)  # permanent / transient / complaint
    bounce_reason: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship(back_populates="emails")
    contact: Mapped["Contact | None"] = relationship()
    campaign: Mapped["Campaign | None"] = relationship(back_populates="emails")


class DiscoveryRun(Base):
    __tablename__ = "discovery_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String, default="running")
    companies_found: Mapped[int] = mapped_column(Integer, default=0)
    contacts_found: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ServiceCatalog(Base):
    __tablename__ = "service_catalog"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[dict] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String, default="running")
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    current_step: Mapped[str | None] = mapped_column(Text)
    progress: Mapped[dict] = mapped_column(JSON, default=lambda: {"discovered": 0, "enriched": 0, "analyzed": 0, "drafted": 0})
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LeadScore(Base):
    __tablename__ = "lead_scores"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    technology_gap: Mapped[int] = mapped_column(Integer, nullable=False)
    size_fit: Mapped[int] = mapped_column(Integer, nullable=False)
    budget_likelihood: Mapped[int] = mapped_column(Integer, nullable=False)
    industry_match: Mapped[int] = mapped_column(Integer, nullable=False)
    urgency: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)
    reasoning: Mapped[dict] = mapped_column(JSON, nullable=False)
    estimated_deal_value: Mapped[int] = mapped_column(Integer, default=0)
    deal_probability: Mapped[int] = mapped_column(Integer, default=0)
    scored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship()


class CompetitorIntel(Base):
    __tablename__ = "competitor_intel"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    current_technologies: Mapped[dict] = mapped_column(JSON, default=list)
    digital_maturity: Mapped[str | None] = mapped_column(Text)
    gaps: Mapped[dict] = mapped_column(JSON, default=list)
    opportunities: Mapped[dict] = mapped_column(JSON, default=list)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship()


class Sequence(Base):
    __tablename__ = "sequences"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    steps: Mapped[dict] = mapped_column(JSON, default=list)
    campaign_id: Mapped[str | None] = mapped_column(String, ForeignKey("campaigns.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    campaign: Mapped["Campaign | None"] = relationship()
    enrollments: Mapped[list["SequenceEnrollment"]] = relationship(back_populates="sequence", cascade="all, delete-orphan")


class SequenceEnrollment(Base):
    __tablename__ = "sequence_enrollments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sequence_id: Mapped[str] = mapped_column(String, ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[str | None] = mapped_column(String, ForeignKey("contacts.id", ondelete="SET NULL"))
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="active")
    next_send_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sequence: Mapped["Sequence"] = relationship(back_populates="enrollments")
    company: Mapped["Company"] = relationship()
    contact: Mapped["Contact | None"] = relationship()


class DemoProject(Base):
    __tablename__ = "demo_projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    prospect_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    demo_type: Mapped[str] = mapped_column(String, nullable=False)  # "landing_page" | "saas_dashboard"
    status: Mapped[str] = mapped_column(String, default="configuring")  # configuring|generating|building|preview|deployed|failed
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    s3_prefix: Mapped[str | None] = mapped_column(String)
    preview_url: Mapped[str | None] = mapped_column(String)
    live_url: Mapped[str | None] = mapped_column(String)
    codebuild_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    prospect: Mapped["Company"] = relationship()
    messages: Mapped[list["DemoMessage"]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="DemoMessage.created_at")
    files: Mapped[list["DemoFile"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class DemoMessage(Base):
    __tablename__ = "demo_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("demo_projects.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # "system" | "assistant" | "user"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    msg_metadata: Mapped[dict | None] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["DemoProject"] = relationship(back_populates="messages")


class DemoFile(Base):
    __tablename__ = "demo_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("demo_projects.id", ondelete="CASCADE"), nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped["DemoProject"] = relationship(back_populates="files")
