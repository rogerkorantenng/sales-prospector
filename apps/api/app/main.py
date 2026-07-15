from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth import get_current_user
from app.config import settings
from app.db import engine, Base
from app.models.tables import *  # noqa: F401, F403 — registers all models
from app.routers import (
    auth, discovery, prospects, enrichment, analysis, email,
    settings as settings_router, pipeline, scoring, intelligence, sequences, export, demos, webhooks,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Brownshift Prospector API", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api"
AUTH_REQUIRED = [Depends(get_current_user)]

# Open: login/register, SES bounce webhooks, and the demo preview proxy
# (loaded in an <iframe>, which cannot send an Authorization header).
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(webhooks.router, prefix=API_PREFIX)
app.include_router(demos.preview_router, prefix=API_PREFIX)

for protected in (
    discovery, prospects, enrichment, analysis, email, settings_router,
    pipeline, scoring, intelligence, sequences, export, demos,
):
    app.include_router(protected.router, prefix=API_PREFIX, dependencies=AUTH_REQUIRED)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/tasks", dependencies=AUTH_REQUIRED)
async def list_demo_tasks():
    """List all running demo Fargate tasks."""
    import boto3
    ecs = boto3.client("ecs", region_name="us-east-1")
    ec2 = boto3.client("ec2", region_name="us-east-1")

    task_arns = ecs.list_tasks(cluster="prospector-cluster")["taskArns"]
    if not task_arns:
        return {"tasks": []}

    tasks_resp = ecs.describe_tasks(cluster="prospector-cluster", tasks=task_arns)
    demo_tasks = []

    for t in tasks_resp["tasks"]:
        td = t["taskDefinitionArn"]
        if "demo" not in td.lower():
            continue

        ip = None
        for att in t.get("attachments", []):
            for detail in att.get("details", []):
                if detail["name"] == "networkInterfaceId":
                    try:
                        eni = ec2.describe_network_interfaces(NetworkInterfaceIds=[detail["value"]])
                        ip = eni["NetworkInterfaces"][0].get("Association", {}).get("PublicIp")
                    except Exception:
                        pass

        demo_tasks.append({
            "task_arn": t["taskArn"],
            "status": t["lastStatus"],
            "ip": ip,
            "task_def": td.split("/")[-1],
            "started_at": t.get("startedAt", "").isoformat() if t.get("startedAt") else None,
            "cpu": t.get("cpu"),
            "memory": t.get("memory"),
        })

    return {"tasks": demo_tasks, "count": len(demo_tasks)}


@app.post("/api/tasks/stop-all", dependencies=AUTH_REQUIRED)
async def stop_all_demo_tasks():
    """Stop all running demo Fargate tasks."""
    import boto3
    ecs = boto3.client("ecs", region_name="us-east-1")

    task_arns = ecs.list_tasks(cluster="prospector-cluster")["taskArns"]
    if not task_arns:
        return {"stopped": 0}

    tasks_resp = ecs.describe_tasks(cluster="prospector-cluster", tasks=task_arns)
    stopped = 0

    for t in tasks_resp["tasks"]:
        if "demo" in t["taskDefinitionArn"].lower():
            ecs.stop_task(cluster="prospector-cluster", task=t["taskArn"])
            stopped += 1

    return {"stopped": stopped}


@app.post("/api/tasks/{task_arn}/stop", dependencies=AUTH_REQUIRED)
async def stop_demo_task(task_arn: str):
    """Stop a specific demo Fargate task."""
    import boto3
    ecs = boto3.client("ecs", region_name="us-east-1")
    ecs.stop_task(cluster="prospector-cluster", task=task_arn)
    return {"stopped": True}


@app.post("/migrate", dependencies=AUTH_REQUIRED)
async def migrate():
    """Add missing columns to existing tables (safe to run multiple times)."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        migrations = [
            "ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS suggested_send_time VARCHAR",
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS variant_group VARCHAR",
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS override_email VARCHAR",
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ",
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounce_type VARCHAR",
            "ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounce_reason VARCHAR",
        ]
        results = []
        for sql in migrations:
            try:
                await conn.execute(text(sql))
                results.append({"sql": sql[:60], "status": "ok"})
            except Exception as e:
                results.append({"sql": sql[:60], "status": str(e)})
    return {"migrations": results}


@app.post("/reset", dependencies=AUTH_REQUIRED)
async def reset_all_data():
    """Delete all prospect data and start fresh. Keeps service catalog and users."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        tables = [
            "sequence_enrollments", "sequences",
            "competitor_intel", "lead_scores", "pipeline_runs",
            "emails", "ai_analyses", "contacts", "discovery_runs", "companies",
        ]
        for table in tables:
            await conn.execute(text(f"DELETE FROM {table}"))
    return {"status": "reset", "tables_cleared": len(tables)}
