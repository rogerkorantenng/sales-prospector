-- Companies discovered from Google Maps / directories
CREATE TABLE companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    website text,
    phone text,
    industry text,
    category text,
    region text,
    city text,
    address text,
    size_estimate text CHECK (size_estimate IN ('micro', 'small', 'medium', 'large')),
    google_maps_id text,
    source text NOT NULL DEFAULT 'google_maps',
    about_text text,
    scraped_at timestamptz,
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'enriched', 'analyzed', 'contacted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_companies_dedup ON companies (name, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_companies_status ON companies (status);
CREATE INDEX idx_companies_region ON companies (region);
CREATE INDEX idx_companies_industry ON companies (industry);

-- Contacts extracted from company websites
CREATE TABLE contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name text,
    role text,
    email text,
    phone text,
    source text NOT NULL DEFAULT 'website',
    verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_company ON contacts (company_id);
CREATE INDEX idx_contacts_email ON contacts (email) WHERE email IS NOT NULL;

-- AI analysis results per company
CREATE TABLE ai_analyses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recommended_services jsonb NOT NULL DEFAULT '[]',
    pain_points jsonb NOT NULL DEFAULT '[]',
    confidence_score integer NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    reasoning text,
    model_used text NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    analyzed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyses_company ON ai_analyses (company_id);
CREATE INDEX idx_analyses_confidence ON ai_analyses (confidence_score);

-- Campaigns group outreach efforts
CREATE TABLE campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    target_regions jsonb NOT NULL DEFAULT '[]',
    target_industries jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    stats jsonb NOT NULL DEFAULT '{"sent": 0, "opened": 0, "clicked": 0, "replied": 0}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Emails drafted by AI, approved by human, sent via SendGrid
CREATE TABLE emails (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    subject text NOT NULL,
    body text NOT NULL,
    tone text NOT NULL DEFAULT 'professional',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed')),
    scheduled_at timestamptz,
    sent_at timestamptz,
    sendgrid_id text,
    opened_at timestamptz,
    clicked_at timestamptz,
    replied_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emails_status ON emails (status);
CREATE INDEX idx_emails_company ON emails (company_id);
CREATE INDEX idx_emails_campaign ON emails (campaign_id);

-- Discovery run history
CREATE TABLE discovery_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    config jsonb NOT NULL,
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    companies_found integer NOT NULL DEFAULT 0,
    contacts_found integer NOT NULL DEFAULT 0,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- Service catalog (editable by user)
CREATE TABLE service_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NOT NULL,
    keywords jsonb NOT NULL DEFAULT '[]',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to auto-update updated_at on companies
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
