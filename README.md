# Brownshift Prospector

Sales intelligence tool for discovering Ghana-based companies, analyzing their tech needs with AI, and sending personalized cold outreach.

## Architecture

- **Frontend**: Next.js 16 (Vercel)
- **Backend**: FastAPI + SQLAlchemy (AWS ECS Fargate)
- **Database**: PostgreSQL (AWS RDS)
- **Auth**: JWT (FastAPI built-in)
- **AI**: Claude API (Anthropic)
- **Email**: SendGrid
- **Discovery**: Google Maps Places API

## Quick start (Docker)

Runs Postgres, the API, and the static frontend together:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000 (health check at `/health`, docs at `/docs`)

External integrations (Google Maps, Claude, SendGrid, Hunter) need API keys —
pass them as environment variables on the `api` service to use those features.

## Setup

### Prerequisites
- Node.js 24+
- Python 3.13+
- PostgreSQL 16+
- Google Maps API key
- Anthropic API key
- SendGrid API key

### 1. Clone and install

```bash
git clone <repo-url> && cd brownshift-prospector
npm install           # installs web dependencies
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Database

Create a PostgreSQL database:
```bash
createdb prospector
```

Tables are auto-created on first startup via SQLAlchemy.

### 3. Environment variables

Copy `.env.example` to `.env` in both `apps/web` and `apps/api`, fill in your keys.

### 4. Run locally

```bash
# Terminal 1 — API
cd apps/api && source .venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2 — Web
cd apps/web && npm run dev
```

### 5. Create first user

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"roger@brownshift.com","password":"your-password","name":"Roger"}'
```

## Deploy to AWS

### RDS PostgreSQL
1. Create RDS PostgreSQL instance (db.t3.micro for free tier)
2. Set `DATABASE_URL` to: `postgresql+asyncpg://user:pass@your-rds-endpoint:5432/prospector`

### ECS Fargate (API)
1. Push Docker image to ECR:
   ```bash
   cd apps/api
   docker build -t prospector-api .
   aws ecr create-repository --repository-name prospector-api
   docker tag prospector-api:latest <account>.dkr.ecr.<region>.amazonaws.com/prospector-api:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/prospector-api:latest
   ```
2. Create ECS Fargate service with the image
3. Set environment variables in task definition
4. Configure ALB for HTTPS

### Vercel (Frontend)
1. Push to GitHub, connect to Vercel
2. Set `API_URL` env var to your ECS/ALB endpoint
