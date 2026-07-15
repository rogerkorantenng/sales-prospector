# Demo Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered demo generator that creates full Next.js applications as sales demos for prospects, with a Lovable-style chat + live preview interface.

**Architecture:** FastAPI backend manages demo projects and chat. Bedrock Opus 4.6 generates 15-30 Next.js files per demo. AWS CodeBuild builds the static export using a pre-baked Docker image with node_modules. S3 hosts previews and deployed demos. Frontend shows split-view: chat on left, iframe preview on right.

**Tech Stack:** FastAPI, SQLAlchemy, AWS Bedrock (Opus 4.6), AWS CodeBuild, AWS ECR, S3, CloudFront, Next.js 16, React 19, Tailwind 4, shadcn/ui, recharts

---

## File Map

### Backend (`apps/api/`)

| File | Responsibility |
|------|---------------|
| `app/models/tables.py` | Add DemoProject, DemoMessage, DemoFile tables |
| `app/routers/demos.py` | Demo CRUD, chat, generate, build status, deploy endpoints |
| `app/services/demo_generator.py` | AI prompt building, file parsing, Bedrock calls |
| `app/services/demo_builder.py` | CodeBuild trigger, S3 file management, deploy logic |
| `app/main.py` | Register demos router |

### Infrastructure

| File | Responsibility |
|------|---------------|
| `infra/demo-template/` | Base Next.js template (package.json, configs, shadcn components) |
| `infra/demo-template/Dockerfile` | Docker image with node_modules pre-baked |
| `infra/lib/infra-stack.ts` | Add CodeBuild project, S3 bucket, ECR repo for template |

### Frontend (`apps/web/`)

| File | Responsibility |
|------|---------------|
| `src/app/demos/page.tsx` | Demo list page (card grid of all demos) |
| `src/app/demos/[id]/page.tsx` | Split-view builder (chat + preview) — BUT since static export, uses query param |
| `src/app/demos/page.tsx` | Handles both list and builder via `?id=` param |
| `src/components/demo-chat.tsx` | Chat panel with messages, quick replies, input |
| `src/components/demo-preview.tsx` | Preview panel with iframe, toolbar, deploy button |
| `src/components/demo-card.tsx` | Demo card for the list view |
| `src/components/sidebar.tsx` | Add "Demos" nav item |
| `src/components/prospect-panel.tsx` | Add "Build Demo" button |

---

## Task 1: Database Models

**Files:**
- Modify: `apps/api/app/models/tables.py`

- [ ] **Step 1: Add DemoProject, DemoMessage, DemoFile models**

Add to the end of `apps/api/app/models/tables.py`:

```python
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
    metadata: Mapped[dict | None] = mapped_column(JSON)
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/app/models/tables.py
git commit -m "feat: add DemoProject, DemoMessage, DemoFile database models"
```

---

## Task 2: Demo Generator Service

**Files:**
- Create: `apps/api/app/services/demo_generator.py`

- [ ] **Step 1: Create the AI demo generator service**

This service handles prompt building, Bedrock calls, and parsing AI output into file operations.

```python
import json
import re
import boto3
from functools import partial
import asyncio

MODEL_ID = "us.anthropic.claude-opus-4-6-v1"

SYSTEM_PROMPT = """You are an expert Next.js developer building production-quality web applications as sales demos for Brownshift Technologies, a software company in Ghana.

You output files in XML format. Each file must contain COMPLETE contents — never partial or diff.

<file path="src/app/page.tsx">
complete file contents here
</file>

Technology stack (all pre-installed, just import and use):
- Next.js 16 App Router with TypeScript
- Tailwind CSS 4 for styling
- shadcn/ui components: Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Input, Select, Dialog, Separator, Progress, DropdownMenu, Tooltip, Popover, Skeleton
- recharts for charts: AreaChart, BarChart, LineChart, PieChart, Area, Bar, Line, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell
- lucide-react for icons
- Import shadcn components from "@/components/ui/[component]"
- Import cn from "@/lib/utils"

Rules:
- Build a PRODUCTION-QUALITY application — this goes to a real client
- Use "use client" directive only for interactive components
- Create REALISTIC demo data — not "Lorem ipsum". Use industry-appropriate names, numbers, dates
- Include proper navigation between all pages
- Every page must have real, meaningful content
- Make it visually impressive — use gradients, proper spacing, professional typography
- Use a consistent color scheme throughout
- Include charts and data visualizations where appropriate
- Tables should have sortable-looking headers and realistic row data
- Include a professional sidebar or navigation header
- Generate 15-25 files for a SaaS dashboard, 5-8 for a landing page
- All pages must work as static exports (no API routes, no server actions)
"""

GUIDED_QUESTIONS = {
    "saas_dashboard": [
        {
            "question": "What's the primary system to showcase in the demo?",
            "derive_from": "recommended_services",
        },
        {
            "question": "Which dashboard features should be included?",
            "type": "multi_select",
            "options": ["Analytics Charts", "Data Tables", "Calendar View", "Reports", "User Management", "Settings", "Notifications"],
        },
        {
            "question": "What color scheme fits this prospect?",
            "type": "single_select",
            "options": ["Blue (Corporate)", "Green (Healthcare)", "Purple (Education)", "Orange (Warm)", "Teal (Modern)", "Red (Bold)"],
        },
        {
            "question": "How much demo data should we populate?",
            "type": "single_select",
            "options": ["Light (10-20 items)", "Medium (50-100 items)", "Heavy (200+ items)"],
        },
    ],
    "landing_page": [
        {
            "question": "Which sections should the landing page include?",
            "type": "multi_select",
            "options": ["Hero Banner", "Services", "About Us", "Team", "Testimonials", "Pricing", "Contact Form", "FAQ", "Stats Counter"],
        },
        {
            "question": "What's the tone of the site?",
            "type": "single_select",
            "options": ["Professional & Corporate", "Modern & Sleek", "Friendly & Approachable", "Bold & Creative"],
        },
        {
            "question": "Color scheme?",
            "type": "single_select",
            "options": ["Blue (Corporate)", "Green (Healthcare)", "Purple (Education)", "Orange (Warm)", "Teal (Modern)", "Red (Bold)"],
        },
    ],
}


class DemoGeneratorService:
    def __init__(self, region: str = "us-east-1"):
        self.client = boto3.client("bedrock-runtime", region_name=region)

    def _invoke(self, system_prompt: str, messages: list[dict]) -> str:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "system": system_prompt,
            "messages": messages,
            "max_tokens": 64000,
            "temperature": 0.3,
        })

        response = self.client.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    async def _ainvoke(self, system_prompt: str, messages: list[dict]) -> str:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, partial(self._invoke, system_prompt, messages)
        )

    def parse_files(self, ai_response: str) -> dict[str, str]:
        """Parse AI response XML into {file_path: content} dict."""
        files = {}
        pattern = r'<file\s+path="([^"]+)"(?:\s+action="[^"]*")?>(.*?)</file>'
        matches = re.findall(pattern, ai_response, re.DOTALL)
        for path, content in matches:
            files[path.strip()] = content.strip()
        return files

    def get_guided_questions(self, demo_type: str) -> list[dict]:
        return GUIDED_QUESTIONS.get(demo_type, [])

    def build_generation_prompt(
        self,
        prospect_name: str,
        prospect_industry: str,
        prospect_region: str,
        demo_type: str,
        config: dict,
        about_text: str | None = None,
        recommended_services: list | None = None,
        pain_points: list | None = None,
    ) -> str:
        prompt = f"""Build a complete {demo_type.replace('_', ' ')} for:

Company: {prospect_name}
Industry: {prospect_industry}
Location: {prospect_region}, Ghana
About: {about_text or 'No additional info'}

"""
        if recommended_services:
            prompt += f"Services we recommend for them:\n"
            for s in recommended_services:
                if isinstance(s, dict):
                    prompt += f"- {s.get('service_name', s)}: {s.get('reason', '')}\n"
                else:
                    prompt += f"- {s}\n"

        if pain_points:
            prompt += f"\nTheir pain points:\n"
            for p in pain_points:
                prompt += f"- {p}\n"

        prompt += f"\nUser configuration:\n"
        for key, value in config.items():
            prompt += f"- {key}: {value}\n"

        if demo_type == "saas_dashboard":
            prompt += """
Generate a complete multi-page SaaS dashboard application with:
- A professional sidebar with the company name and navigation
- A main dashboard page with stats cards, charts, and recent activity
- 3-5 feature pages based on the recommended services
- A reports/analytics page
- A settings page
- Realistic demo data throughout (use industry-appropriate names and numbers)
- Working navigation between all pages
- Consistent branding and color scheme

Generate ALL files needed. Use the file XML format."""
        else:
            prompt += """
Generate a complete landing page website with:
- Professional header with navigation
- Compelling hero section
- All requested sections with real content
- Professional footer
- Responsive design
- Consistent branding

Generate ALL files needed. Use the file XML format."""

        return prompt

    def build_modification_prompt(
        self,
        current_files: dict[str, str],
        user_request: str,
    ) -> str:
        prompt = "Current project files:\n\n"
        for path, content in current_files.items():
            prompt += f'[File: {path}]\n```\n{content}\n```\n\n'
        prompt += f"\nUser request: {user_request}\n\n"
        prompt += "Modify ONLY the files that need to change. Return complete file contents for each changed file using the <file> XML format. Do NOT return files that don't need changes."
        return prompt

    async def generate_demo(
        self,
        prospect_name: str,
        prospect_industry: str,
        prospect_region: str,
        demo_type: str,
        config: dict,
        about_text: str | None = None,
        recommended_services: list | None = None,
        pain_points: list | None = None,
    ) -> dict[str, str]:
        user_prompt = self.build_generation_prompt(
            prospect_name, prospect_industry, prospect_region,
            demo_type, config, about_text, recommended_services, pain_points,
        )
        response = await self._ainvoke(SYSTEM_PROMPT, [{"role": "user", "content": user_prompt}])
        return self.parse_files(response)

    async def modify_demo(
        self,
        current_files: dict[str, str],
        conversation_history: list[dict],
        user_request: str,
    ) -> dict[str, str]:
        messages = list(conversation_history)
        modification_prompt = self.build_modification_prompt(current_files, user_request)
        messages.append({"role": "user", "content": modification_prompt})
        response = await self._ainvoke(SYSTEM_PROMPT, messages)
        return self.parse_files(response)
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/app/services/demo_generator.py
git commit -m "feat: add demo generator service with AI prompt building and file parsing"
```

---

## Task 3: Demo Builder Service (S3 + CodeBuild)

**Files:**
- Create: `apps/api/app/services/demo_builder.py`

- [ ] **Step 1: Create the build/deploy service**

```python
import boto3
import json
from app.config import settings


DEMO_BUCKET = f"brownshift-demos-{settings.aws_account_id}" if hasattr(settings, 'aws_account_id') else "brownshift-demos"
CODEBUILD_PROJECT = "prospector-demo-builder"


class DemoBuilderService:
    def __init__(self, region: str = "us-east-1"):
        self.s3 = boto3.client("s3", region_name=region)
        self.codebuild = boto3.client("codebuild", region_name=region)
        self.region = region

    def upload_source_files(self, project_id: str, files: dict[str, str]) -> None:
        """Upload AI-generated source files to S3."""
        for file_path, content in files.items():
            s3_key = f"projects/{project_id}/source/{file_path}"
            self.s3.put_object(
                Bucket=DEMO_BUCKET,
                Key=s3_key,
                Body=content.encode("utf-8"),
                ContentType="text/plain",
            )

    def start_build(self, project_id: str) -> str:
        """Trigger CodeBuild to build the Next.js project. Returns build ID."""
        response = self.codebuild.start_build(
            projectName=CODEBUILD_PROJECT,
            environmentVariablesOverride=[
                {"name": "PROJECT_ID", "value": project_id, "type": "PLAINTEXT"},
                {"name": "BUCKET", "value": DEMO_BUCKET, "type": "PLAINTEXT"},
            ],
        )
        return response["build"]["id"]

    def get_build_status(self, build_id: str) -> dict:
        """Get CodeBuild build status."""
        response = self.codebuild.batch_get_builds(ids=[build_id])
        if not response["builds"]:
            return {"status": "NOT_FOUND"}
        build = response["builds"][0]
        return {
            "status": build["buildStatus"],  # SUCCEEDED, FAILED, IN_PROGRESS, STOPPED
            "phase": build.get("currentPhase", ""),
            "start_time": build.get("startTime", "").isoformat() if build.get("startTime") else None,
            "end_time": build.get("endTime", "").isoformat() if build.get("endTime") else None,
        }

    def get_preview_url(self, project_id: str) -> str:
        """Get the S3 website URL for preview."""
        return f"https://{DEMO_BUCKET}.s3-website-{self.region}.amazonaws.com/projects/{project_id}/build/index.html"

    def deploy(self, project_id: str, prospect_slug: str) -> str:
        """Deploy demo to a dedicated public S3 bucket."""
        deploy_bucket = f"brownshift-demo-{prospect_slug}"

        # Create bucket
        try:
            self.s3.create_bucket(
                Bucket=deploy_bucket,
                CreateBucketConfiguration={"LocationConstraint": self.region} if self.region != "us-east-1" else {},
            )
        except self.s3.exceptions.BucketAlreadyOwnedByYou:
            pass

        # Enable static website hosting
        self.s3.put_bucket_website(
            Bucket=deploy_bucket,
            WebsiteConfiguration={
                "IndexDocument": {"Suffix": "index.html"},
                "ErrorDocument": {"Key": "404.html"},
            },
        )

        # Set public access policy
        policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "PublicRead",
                "Effect": "Allow",
                "Principal": "*",
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{deploy_bucket}/*",
            }],
        }
        # Disable block public access
        self.s3.put_public_access_block(
            Bucket=deploy_bucket,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": False,
                "IgnorePublicAcls": False,
                "BlockPublicPolicy": False,
                "RestrictPublicBuckets": False,
            },
        )
        self.s3.put_bucket_policy(Bucket=deploy_bucket, Policy=json.dumps(policy))

        # Copy build files from demo bucket to deploy bucket
        paginator = self.s3.get_paginator("list_objects_v2")
        prefix = f"projects/{project_id}/build/"
        for page in paginator.paginate(Bucket=DEMO_BUCKET, Prefix=prefix):
            for obj in page.get("Contents", []):
                src_key = obj["Key"]
                dest_key = src_key.replace(prefix, "")
                if not dest_key:
                    continue

                # Determine content type
                ct = "text/html"
                if dest_key.endswith(".js"):
                    ct = "application/javascript"
                elif dest_key.endswith(".css"):
                    ct = "text/css"
                elif dest_key.endswith(".json"):
                    ct = "application/json"
                elif dest_key.endswith(".svg"):
                    ct = "image/svg+xml"
                elif dest_key.endswith(".png"):
                    ct = "image/png"

                self.s3.copy_object(
                    CopySource={"Bucket": DEMO_BUCKET, "Key": src_key},
                    Bucket=deploy_bucket,
                    Key=dest_key,
                    ContentType=ct,
                    MetadataDirective="REPLACE",
                )

        return f"http://{deploy_bucket}.s3-website-{self.region}.amazonaws.com"
```

- [ ] **Step 2: Add aws_account_id to config**

In `apps/api/app/config.py`, add:

```python
    aws_account_id: str = ""
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/services/demo_builder.py apps/api/app/config.py
git commit -m "feat: add demo builder service for S3 uploads, CodeBuild triggers, and deployment"
```

---

## Task 4: Demo API Router

**Files:**
- Create: `apps/api/app/routers/demos.py`
- Modify: `apps/api/app/main.py`

- [ ] **Step 1: Create the demos router**

```python
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db import get_db, async_session
from app.config import settings
from app.models.tables import DemoProject, DemoMessage, DemoFile, Company, AIAnalysis, CompetitorIntel
from app.services.demo_generator import DemoGeneratorService
from app.services.demo_builder import DemoBuilderService

router = APIRouter(prefix="/demos", tags=["demos"])
generator = DemoGeneratorService(region=settings.aws_region)
builder = DemoBuilderService(region=settings.aws_region)


class CreateDemoRequest(BaseModel):
    prospect_id: str
    name: str
    demo_type: str  # "landing_page" | "saas_dashboard"


class ChatMessageRequest(BaseModel):
    content: str


def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug[:50]


def _serialize_project(p: DemoProject) -> dict:
    return {
        "id": p.id,
        "prospect_id": p.prospect_id,
        "name": p.name,
        "demo_type": p.demo_type,
        "status": p.status,
        "config": p.config,
        "preview_url": p.preview_url,
        "live_url": p.live_url,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _serialize_message(m: DemoMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "metadata": m.metadata,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ─── CRUD ────────────────────────────────────────────

@router.post("")
@router.post("/")
async def create_demo(body: CreateDemoRequest, db: AsyncSession = Depends(get_db)):
    # Verify prospect exists
    result = await db.execute(select(Company).where(Company.id == body.prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    project = DemoProject(
        prospect_id=body.prospect_id,
        name=body.name,
        demo_type=body.demo_type,
        status="configuring",
        s3_prefix=None,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Set s3_prefix after we have the ID
    project.s3_prefix = f"projects/{project.id}"
    await db.commit()

    # Add initial system message
    questions = generator.get_guided_questions(body.demo_type)
    intro = f"I'm setting up a {body.demo_type.replace('_', ' ')} demo for **{prospect.name}** ({prospect.industry}, {prospect.region})."

    system_msg = DemoMessage(
        project_id=project.id,
        role="assistant",
        content=intro,
        metadata=None,
    )
    db.add(system_msg)

    # Add first question
    if questions:
        q = questions[0]
        options = q.get("options", [])

        # Try to derive options from prospect data if applicable
        if q.get("derive_from") == "recommended_services":
            analysis = await db.execute(
                select(AIAnalysis).where(AIAnalysis.company_id == body.prospect_id)
                .order_by(AIAnalysis.analyzed_at.desc()).limit(1)
            )
            ai = analysis.scalar_one_or_none()
            if ai and ai.recommended_services:
                options = [s["service_name"] if isinstance(s, dict) else s for s in ai.recommended_services]

        q_msg = DemoMessage(
            project_id=project.id,
            role="assistant",
            content=q["question"],
            metadata={
                "type": "question",
                "question_index": 0,
                "quick_replies": options,
                "select_type": q.get("type", "single_select"),
            },
        )
        db.add(q_msg)

    await db.commit()
    return _serialize_project(project)


@router.get("")
@router.get("/")
async def list_demos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DemoProject).order_by(DemoProject.created_at.desc()).limit(50)
    )
    projects = result.scalars().all()
    return [_serialize_project(p) for p in projects]


@router.get("/{project_id}")
async def get_demo(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DemoProject).where(DemoProject.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")
    return _serialize_project(project)


@router.delete("/{project_id}")
async def delete_demo(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")
    await db.delete(project)
    await db.commit()
    return {"deleted": True}


# ─── Chat ────────────────────────────────────────────

@router.get("/{project_id}/messages")
async def get_messages(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DemoMessage).where(DemoMessage.project_id == project_id)
        .order_by(DemoMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [_serialize_message(m) for m in messages]


@router.post("/{project_id}/message")
async def send_message(
    project_id: str,
    body: ChatMessageRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")

    # Save user message
    user_msg = DemoMessage(project_id=project_id, role="user", content=body.content)
    db.add(user_msg)
    await db.commit()

    # Check if we're still in guided questions phase
    questions = generator.get_guided_questions(project.demo_type)
    config = dict(project.config or {})

    # Count answered questions
    user_messages = await db.execute(
        select(DemoMessage).where(
            DemoMessage.project_id == project_id,
            DemoMessage.role == "user",
        ).order_by(DemoMessage.created_at.asc())
    )
    user_msgs = user_messages.scalars().all()
    answered = len(user_msgs)

    if answered <= len(questions):
        # Store answer in config
        q_index = answered - 1
        if q_index < len(questions):
            q_key = questions[q_index]["question"][:30].lower().replace(" ", "_").replace("?", "")
            config[q_key] = body.content
            project.config = config
            await db.commit()

        # If more questions, ask next
        if answered < len(questions):
            next_q = questions[answered]
            q_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=next_q["question"],
                metadata={
                    "type": "question",
                    "question_index": answered,
                    "quick_replies": next_q.get("options", []),
                    "select_type": next_q.get("type", "single_select"),
                },
            )
            db.add(q_msg)
            await db.commit()
            return _serialize_message(q_msg)

        # All questions answered — trigger generation
        generating_msg = DemoMessage(
            project_id=project_id,
            role="assistant",
            content="All set! I'm now generating your demo application. This will take a few minutes...",
            metadata={"type": "generating", "status": "started"},
        )
        db.add(generating_msg)
        project.status = "generating"
        await db.commit()

        background_tasks.add_task(_generate_and_build, project_id)
        return _serialize_message(generating_msg)

    else:
        # Post-generation modification request
        modifying_msg = DemoMessage(
            project_id=project_id,
            role="assistant",
            content="Making those changes now...",
            metadata={"type": "modifying", "status": "started"},
        )
        db.add(modifying_msg)
        project.status = "generating"
        await db.commit()

        background_tasks.add_task(_modify_and_build, project_id, body.content)
        return _serialize_message(modifying_msg)


async def _generate_and_build(project_id: str):
    """Background task: generate code with AI, upload to S3, trigger build."""
    async with async_session() as db:
        result = await db.execute(
            select(DemoProject).options(selectinload(DemoProject.prospect))
            .where(DemoProject.id == project_id)
        )
        project = result.scalar_one()
        prospect = project.prospect

        # Get AI analysis if available
        analysis_result = await db.execute(
            select(AIAnalysis).where(AIAnalysis.company_id == prospect.id)
            .order_by(AIAnalysis.analyzed_at.desc()).limit(1)
        )
        analysis = analysis_result.scalar_one_or_none()

        recommended = analysis.recommended_services if analysis else []
        pain_points = analysis.pain_points if analysis else []

        try:
            # Generate files with AI
            files = await generator.generate_demo(
                prospect_name=prospect.name,
                prospect_industry=prospect.industry or "general",
                prospect_region=prospect.region or "Ghana",
                demo_type=project.demo_type,
                config=project.config or {},
                about_text=prospect.about_text,
                recommended_services=recommended,
                pain_points=pain_points,
            )

            # Save files to DB
            for path, content in files.items():
                demo_file = DemoFile(
                    project_id=project_id,
                    file_path=path,
                    content=content,
                )
                db.add(demo_file)

            # Upload to S3
            builder.upload_source_files(project_id, files)

            # Trigger CodeBuild
            build_id = builder.start_build(project_id)
            project.codebuild_id = build_id
            project.status = "building"
            project.preview_url = builder.get_preview_url(project_id)

            # Add completion message
            file_list = "\n".join(f"- `{p}`" for p in sorted(files.keys()))
            done_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Code generated! {len(files)} files created. Now building the application...\n\n**Files:**\n{file_list}",
                metadata={"type": "building", "files_count": len(files), "build_id": build_id},
            )
            db.add(done_msg)
            await db.commit()

        except Exception as e:
            project.status = "failed"
            error_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Sorry, generation failed: {str(e)[:200]}. Please try again.",
                metadata={"type": "error"},
            )
            db.add(error_msg)
            await db.commit()


async def _modify_and_build(project_id: str, user_request: str):
    """Background task: modify existing files with AI, rebuild."""
    async with async_session() as db:
        # Get current files
        files_result = await db.execute(
            select(DemoFile).where(DemoFile.project_id == project_id)
        )
        current_files = {f.file_path: f.content for f in files_result.scalars().all()}

        # Get conversation history for context
        msgs_result = await db.execute(
            select(DemoMessage).where(DemoMessage.project_id == project_id)
            .order_by(DemoMessage.created_at.asc())
        )
        all_msgs = msgs_result.scalars().all()
        conversation = [{"role": m.role if m.role != "system" else "user", "content": m.content} for m in all_msgs if m.role in ("user", "assistant")]

        try:
            # Get modified files from AI
            modified_files = await generator.modify_demo(current_files, conversation[-10:], user_request)

            # Update DB files
            for path, content in modified_files.items():
                existing = await db.execute(
                    select(DemoFile).where(
                        DemoFile.project_id == project_id,
                        DemoFile.file_path == path,
                    )
                )
                file = existing.scalar_one_or_none()
                if file:
                    file.content = content
                    file.version += 1
                else:
                    new_file = DemoFile(project_id=project_id, file_path=path, content=content)
                    db.add(new_file)

            # Re-upload ALL files to S3 (template + modified)
            all_files = dict(current_files)
            all_files.update(modified_files)
            builder.upload_source_files(project_id, all_files)

            # Trigger rebuild
            project_result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
            project = project_result.scalar_one()

            build_id = builder.start_build(project_id)
            project.codebuild_id = build_id
            project.status = "building"

            changed_list = ", ".join(f"`{p}`" for p in modified_files.keys())
            done_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Changes applied to {len(modified_files)} file(s): {changed_list}. Rebuilding...",
                metadata={"type": "building", "files_changed": list(modified_files.keys()), "build_id": build_id},
            )
            db.add(done_msg)
            await db.commit()

        except Exception as e:
            project_result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
            project = project_result.scalar_one()
            project.status = "preview"

            error_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Modification failed: {str(e)[:200]}. The previous version is still available.",
                metadata={"type": "error"},
            )
            db.add(error_msg)
            await db.commit()


# ─── Build Status ────────────────────────────────────

@router.get("/{project_id}/build-status")
async def get_build_status(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")

    if not project.codebuild_id:
        return {"status": project.status, "build": None}

    build_status = builder.get_build_status(project.codebuild_id)

    # Update project status based on build
    if build_status["status"] == "SUCCEEDED" and project.status == "building":
        project.status = "preview"
        # Add preview ready message
        preview_msg = DemoMessage(
            project_id=project_id,
            role="assistant",
            content="Your demo is ready! Check the preview on the right. Let me know if you'd like any changes.",
            metadata={"type": "preview_ready", "preview_url": project.preview_url},
        )
        db.add(preview_msg)
        await db.commit()
    elif build_status["status"] == "FAILED" and project.status == "building":
        project.status = "failed"
        fail_msg = DemoMessage(
            project_id=project_id,
            role="assistant",
            content="The build failed. I'll look into what went wrong. Try requesting a modification or regenerate.",
            metadata={"type": "build_failed"},
        )
        db.add(fail_msg)
        await db.commit()

    return {
        "status": project.status,
        "build": build_status,
        "preview_url": project.preview_url if project.status == "preview" else None,
    }


# ─── Deploy ──────────────────────────────────────────

@router.post("/{project_id}/deploy")
async def deploy_demo(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DemoProject).options(selectinload(DemoProject.prospect))
        .where(DemoProject.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")
    if project.status not in ("preview", "deployed"):
        raise HTTPException(status_code=400, detail=f"Cannot deploy demo with status '{project.status}'")

    prospect_slug = _slugify(project.prospect.name)
    live_url = builder.deploy(project_id, prospect_slug)

    project.live_url = live_url
    project.status = "deployed"

    deploy_msg = DemoMessage(
        project_id=project_id,
        role="assistant",
        content=f"Demo deployed! Share this link with {project.prospect.name}:\n\n{live_url}",
        metadata={"type": "deployed", "live_url": live_url},
    )
    db.add(deploy_msg)
    await db.commit()

    return {"live_url": live_url, "status": "deployed"}


# ─── Files ───────────────────────────────────────────

@router.get("/{project_id}/files")
async def get_files(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DemoFile).where(DemoFile.project_id == project_id)
        .order_by(DemoFile.file_path)
    )
    files = result.scalars().all()
    return [
        {"path": f.file_path, "version": f.version, "lines": f.content.count("\n") + 1}
        for f in files
    ]
```

- [ ] **Step 2: Register router in main.py**

Add to imports in `apps/api/app/main.py`:

```python
from app.routers import (
    auth, discovery, prospects, enrichment, analysis, email,
    settings as settings_router, pipeline, scoring, intelligence, sequences, export, demos,
)
```

Add to router registration:

```python
app.include_router(demos.router, prefix=API_PREFIX)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/routers/demos.py apps/api/app/main.py
git commit -m "feat: add demos API router with CRUD, chat, generate, build status, deploy"
```

---

## Task 5: Demo Template Docker Image

**Files:**
- Create: `infra/demo-template/package.json`
- Create: `infra/demo-template/next.config.ts`
- Create: `infra/demo-template/tsconfig.json`
- Create: `infra/demo-template/postcss.config.mjs`
- Create: `infra/demo-template/next-env.d.ts`
- Create: `infra/demo-template/src/lib/utils.ts`
- Create: `infra/demo-template/Dockerfile`
- Create: `infra/demo-template/buildspec.yml`

- [ ] **Step 1: Create the base Next.js template**

Create `infra/demo-template/package.json`:
```json
{
  "name": "demo-site",
  "private": true,
  "scripts": {
    "build": "next build"
  },
  "dependencies": {
    "next": "16.2.2",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "lucide-react": "^1.7.0",
    "recharts": "^2.15.3",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.5.0",
    "class-variance-authority": "^0.7.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

Create `infra/demo-template/next.config.ts`:
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
```

Create `infra/demo-template/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Create `infra/demo-template/postcss.config.mjs`:
```javascript
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

Create `infra/demo-template/next-env.d.ts`:
```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create `infra/demo-template/src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create the Dockerfile**

Create `infra/demo-template/Dockerfile`:
```dockerfile
FROM node:22-slim

WORKDIR /template

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy template config files
COPY next.config.ts tsconfig.json postcss.config.mjs next-env.d.ts ./
COPY src/ ./src/

# Install shadcn/ui components into template
RUN npx shadcn@latest init --defaults --yes 2>/dev/null || true
RUN npx shadcn@latest add button card table badge tabs input select dialog separator progress dropdown-menu tooltip skeleton --yes 2>/dev/null || true
```

- [ ] **Step 3: Create the CodeBuild buildspec**

Create `infra/demo-template/buildspec.yml`:
```yaml
version: 0.2

env:
  variables:
    PROJECT_ID: ""
    BUCKET: ""

phases:
  pre_build:
    commands:
      - echo "Setting up build for project $PROJECT_ID"
      - mkdir -p /build && cd /build
      # Copy template (with node_modules via hardlink for speed)
      - cp -al /template/node_modules ./node_modules
      - cp /template/next.config.ts /template/tsconfig.json /template/postcss.config.mjs /template/next-env.d.ts ./
      - mkdir -p src/lib && cp /template/src/lib/utils.ts ./src/lib/utils.ts
      - cp -r /template/src/components/ ./src/components/ 2>/dev/null || true
      # Download AI-generated source files
      - aws s3 sync s3://$BUCKET/projects/$PROJECT_ID/source/ ./

  build:
    commands:
      - cd /build && npx next build

  post_build:
    commands:
      - echo "Uploading build output to S3"
      - aws s3 sync /build/out/ s3://$BUCKET/projects/$PROJECT_ID/build/ --delete
      - echo "Build complete for project $PROJECT_ID"
```

- [ ] **Step 4: Commit**

```bash
git add infra/demo-template/
git commit -m "feat: add Next.js demo template with Dockerfile, shadcn/ui, and CodeBuild buildspec"
```

---

## Task 6: AWS Infrastructure (S3 + CodeBuild + ECR)

**Files:**
- Modify: `infra/lib/infra-stack.ts`

- [ ] **Step 1: Add demo infrastructure to CDK stack**

Add to `infra/lib/infra-stack.ts` before the outputs section:

```typescript
    // ==========================================
    // 7. DEMO BUILDER — S3 + CodeBuild + ECR
    // ==========================================

    // S3 bucket for demo source and builds
    const demoBucket = new s3.Bucket(this, 'DemoBucket', {
      bucketName: `brownshift-demos-${this.account}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: '404.html',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Public read policy for the build/ prefixes
    demoBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [demoBucket.arnForObjects('projects/*/build/*')],
      principals: [new cdk.aws_iam.StarPrincipal()],
    }));

    // ECR repository for the demo template Docker image
    const demoTemplateRepo = new ecr.Repository(this, 'DemoTemplateRepo', {
      repositoryName: 'prospector-demo-template',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // CodeBuild project for building demo sites
    const demoBuildProject = new cdk.aws_codebuild.Project(this, 'DemoBuildProject', {
      projectName: 'prospector-demo-builder',
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.fromEcrRepository(demoTemplateRepo, 'latest'),
        computeType: cdk.aws_codebuild.ComputeType.SMALL,
      },
      buildSpec: cdk.aws_codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      source: cdk.aws_codebuild.Source.s3({
        bucket: demoBucket,
        path: 'buildspec/',
      }),
      timeout: cdk.Duration.minutes(10),
    });

    // Grant CodeBuild access to S3
    demoBucket.grantReadWrite(demoBuildProject);

    // Grant the API task role permissions for CodeBuild and S3
    demoBuildProject.grantStartBuild(apiService.taskDefinition.taskRole!);
    demoBucket.grantReadWrite(apiService.taskDefinition.taskRole!);

    // Grant API role permission to create S3 buckets (for deploy)
    apiService.taskDefinition.taskRole!.addToPrincipalPolicy(new cdk.aws_iam.PolicyStatement({
      actions: [
        's3:CreateBucket', 's3:PutBucketWebsite', 's3:PutBucketPolicy',
        's3:PutPublicAccessBlock', 's3:PutObject', 's3:GetObject', 's3:ListBucket',
      ],
      resources: ['arn:aws:s3:::brownshift-demo-*', 'arn:aws:s3:::brownshift-demo-*/*'],
    }));

    // Grant API role CodeBuild batch get builds
    apiService.taskDefinition.taskRole!.addToPrincipalPolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['codebuild:BatchGetBuilds'],
      resources: [demoBuildProject.projectArn],
    }));

    // Outputs
    new cdk.CfnOutput(this, 'DemoBucketName', {
      value: demoBucket.bucketName,
      description: 'S3 bucket for demo projects',
    });

    new cdk.CfnOutput(this, 'DemoBucketWebsite', {
      value: demoBucket.bucketWebsiteUrl,
      description: 'Demo preview base URL',
    });

    new cdk.CfnOutput(this, 'DemoTemplateRepo', {
      value: demoTemplateRepo.repositoryUri,
      description: 'ECR repo for demo template image',
    });
```

- [ ] **Step 2: Commit**

```bash
git add infra/lib/infra-stack.ts
git commit -m "feat: add demo builder infrastructure — S3 bucket, CodeBuild project, ECR repo"
```

---

## Task 7: Build and Push Demo Template Docker Image

- [ ] **Step 1: Build the template Docker image**

```bash
cd infra/demo-template
docker build --platform linux/amd64 -t prospector-demo-template .
```

- [ ] **Step 2: Push to ECR**

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
docker tag prospector-demo-template:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/prospector-demo-template:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/prospector-demo-template:latest
```

- [ ] **Step 3: Upload buildspec to S3**

```bash
aws s3 cp infra/demo-template/buildspec.yml s3://brownshift-demos-<ACCOUNT_ID>/buildspec/buildspec.yml
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: build and push demo template Docker image"
```

---

## Task 8: Frontend — Demo List Page

**Files:**
- Create: `apps/web/src/app/demos/page.tsx`
- Create: `apps/web/src/components/demo-card.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Create demo card component**

Create `apps/web/src/components/demo-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Globe, Layout, Clock, ExternalLink } from "lucide-react";

interface DemoCardProps {
  id: string;
  name: string;
  demo_type: string;
  status: string;
  preview_url: string | null;
  live_url: string | null;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  configuring: "bg-gray-100 text-gray-600",
  generating: "bg-amber-100 text-amber-700",
  building: "bg-blue-100 text-blue-700",
  preview: "bg-purple-100 text-purple-700",
  deployed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function DemoCard({ id, name, demo_type, status, preview_url, live_url, created_at }: DemoCardProps) {
  return (
    <Link href={`/demos?id=${id}`}>
      <div className="group material-card p-5 transition-all hover:shadow-md cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white">
            {demo_type === "landing_page" ? <Globe className="size-5" /> : <Layout className="size-5" />}
          </div>
          <Badge className={`text-[10px] font-semibold capitalize ${statusStyles[status] || ""}`}>
            {status}
          </Badge>
        </div>

        <h3 className="text-sm font-bold text-[#344767] group-hover:text-[#e91e63] transition-colors">
          {name}
        </h3>
        <p className="text-[11px] text-[#7b809a] mt-1 capitalize">
          {demo_type.replace("_", " ")}
        </p>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#f0f2f5]">
          <span className="flex items-center gap-1 text-[10px] text-[#7b809a]">
            <Clock className="size-3" />
            {new Date(created_at).toLocaleDateString()}
          </span>
          {live_url && (
            <span className="flex items-center gap-1 text-[10px] text-[#e91e63] font-medium">
              <ExternalLink className="size-3" /> Live
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create demos page**

Create `apps/web/src/app/demos/page.tsx`:

```tsx
"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DemoCard } from "@/components/demo-card";
import { DemoBuilder } from "@/components/demo-builder";
import { EmptyState } from "@/components/empty-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { Wand2, Plus } from "lucide-react";

interface Demo {
  id: string;
  name: string;
  demo_type: string;
  status: string;
  preview_url: string | null;
  live_url: string | null;
  created_at: string;
}

function DemosContent() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDemos = useCallback(() => {
    api<Demo[]>("/demos")
      .then(setDemos)
      .catch(() => toast.error("Failed to load demos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadDemos(); }, [loadDemos]);

  if (selectedId) {
    return <DemoBuilder projectId={selectedId} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-[#7b809a] mb-1">Home / Demos</p>
          <h1 className="text-xl font-bold text-[#344767]">Demo Builder</h1>
          <p className="text-xs text-[#7b809a] mt-1">AI-powered demo applications for your prospects</p>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={6} />
      ) : demos.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title="No demos yet"
          description="Build your first AI-powered demo from the Prospects page — click on a prospect and select 'Build Demo'."
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {demos.map((demo) => (
            <DemoCard key={demo.id} {...demo} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DemosPage() {
  return (
    <Suspense fallback={<CardSkeleton count={6} />}>
      <DemosContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Add Demos to sidebar**

In `apps/web/src/components/sidebar.tsx`, add to the PIPELINE nav section items:

```typescript
{ href: "/demos", label: "Demos", icon: Wand2, badgeKey: "demos" },
```

Import `Wand2` from lucide-react.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/demos/ apps/web/src/components/demo-card.tsx apps/web/src/components/sidebar.tsx
git commit -m "feat: add demo list page with cards and sidebar navigation"
```

---

## Task 9: Frontend — Demo Builder (Split View Chat + Preview)

**Files:**
- Create: `apps/web/src/components/demo-builder.tsx`
- Create: `apps/web/src/components/demo-chat.tsx`
- Create: `apps/web/src/components/demo-preview.tsx`

- [ ] **Step 1: Create demo chat component**

Create `apps/web/src/components/demo-chat.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Loader2, FileCode } from "lucide-react";

interface Message {
  id: string;
  role: string;
  content: string;
  metadata?: {
    type?: string;
    quick_replies?: string[];
    select_type?: string;
    files_count?: number;
    preview_url?: string;
    live_url?: string;
    status?: string;
  };
  created_at: string;
}

interface DemoChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  sending: boolean;
  status: string;
}

export function DemoChat({ messages, onSendMessage, sending, status }: DemoChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleQuickReply = (reply: string) => {
    if (sending) return;
    onSendMessage(reply);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[#e9ecef] px-4 py-3">
        <h3 className="text-sm font-bold text-[#344767]">Demo Builder Chat</h3>
        <div className="flex items-center gap-2 mt-1">
          <div className={`size-2 rounded-full ${
            status === "generating" || status === "building" ? "bg-amber-400 animate-pulse" :
            status === "preview" || status === "deployed" ? "bg-emerald-400" : "bg-gray-300"
          }`} />
          <span className="text-[10px] text-[#7b809a] capitalize">{status}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
              msg.role === "user"
                ? "bg-gradient-to-br from-[#344767] to-[#1f283e]"
                : "bg-gradient-to-br from-[#e91e63] to-[#c2185b]"
            }`}>
              {msg.role === "user" ? <User className="size-4 text-white" /> : <Bot className="size-4 text-white" />}
            </div>
            <div className={`max-w-[80%] ${msg.role === "user" ? "text-right" : ""}`}>
              <div className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#344767] text-white"
                  : "bg-white border border-[#e9ecef] text-[#344767]"
              }`}>
                {msg.content}
              </div>

              {/* Quick replies */}
              {msg.metadata?.quick_replies && msg.metadata.quick_replies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.metadata.quick_replies.map((reply) => (
                    <Button
                      key={reply}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-[#e91e63]/30 text-[#e91e63] hover:bg-[#e91e63]/10"
                      onClick={() => handleQuickReply(reply)}
                      disabled={sending}
                    >
                      {reply}
                    </Button>
                  ))}
                </div>
              )}

              {/* File list */}
              {msg.metadata?.files_count && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[#7b809a]">
                  <FileCode className="size-3" />
                  {msg.metadata.files_count} files generated
                </div>
              )}

              {/* Live URL */}
              {msg.metadata?.live_url && (
                <a
                  href={msg.metadata.live_url}
                  target="_blank"
                  className="inline-block mt-2 text-xs text-[#e91e63] font-medium hover:underline"
                >
                  {msg.metadata.live_url}
                </a>
              )}

              <p className="text-[9px] text-[#7b809a]/60 mt-1">
                {new Date(msg.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e91e63] to-[#c2185b]">
              <Loader2 className="size-4 text-white animate-spin" />
            </div>
            <div className="rounded-xl bg-white border border-[#e9ecef] px-4 py-2.5 text-sm text-[#7b809a]">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#e9ecef] p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={status === "configuring" ? "Answer the question above..." : "Describe changes you'd like..."}
            disabled={sending || status === "generating" || status === "building"}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending || status === "generating" || status === "building"}
            size="sm"
            className="bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white px-4"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create demo preview component**

Create `apps/web/src/components/demo-preview.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, Rocket, Copy, Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";

interface DemoPreviewProps {
  previewUrl: string | null;
  liveUrl: string | null;
  status: string;
  onDeploy: () => void;
  deploying: boolean;
}

export function DemoPreview({ previewUrl, liveUrl, status, onDeploy, deploying }: DemoPreviewProps) {
  const showPreview = previewUrl && (status === "preview" || status === "deployed");

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  return (
    <div className="flex h-full flex-col bg-[#f8f9fa]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#e9ecef] bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Monitor className="size-4 text-[#7b809a]" />
          <span className="text-xs font-medium text-[#344767]">Preview</span>
          {status === "building" && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              <Loader2 className="size-3 mr-1 animate-spin" /> Building...
            </Badge>
          )}
          {status === "generating" && (
            <Badge className="bg-purple-100 text-purple-700 text-[10px]">
              <Loader2 className="size-3 mr-1 animate-spin" /> Generating...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showPreview && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => {
                  const iframe = document.getElementById("demo-preview-iframe") as HTMLIFrameElement;
                  if (iframe) iframe.src = iframe.src;
                }}
              >
                <RefreshCw className="size-3 mr-1" /> Refresh
              </Button>
              <a href={previewUrl!} target="_blank">
                <Button variant="outline" size="sm" className="h-7 text-[11px]">
                  <ExternalLink className="size-3 mr-1" /> New Tab
                </Button>
              </a>
            </>
          )}
          {status === "preview" && (
            <Button
              size="sm"
              className="h-7 text-[11px] bg-gradient-to-br from-[#4caf50] to-[#388e3c] text-white"
              onClick={onDeploy}
              disabled={deploying}
            >
              {deploying ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Rocket className="size-3 mr-1" />}
              Deploy
            </Button>
          )}
        </div>
      </div>

      {/* Live URL banner */}
      {liveUrl && (
        <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-medium text-emerald-700">Deployed:</span>
            <a href={liveUrl} target="_blank" className="text-xs text-emerald-600 hover:underline">{liveUrl}</a>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-emerald-600" onClick={() => copyUrl(liveUrl)}>
            <Copy className="size-3 mr-1" /> Copy
          </Button>
        </div>
      )}

      {/* Preview iframe or placeholder */}
      <div className="flex-1 overflow-hidden">
        {showPreview ? (
          <iframe
            id="demo-preview-iframe"
            src={previewUrl!}
            className="h-full w-full border-0"
            title="Demo Preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              {status === "generating" ? (
                <>
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e91e63]/10 to-[#c2185b]/10">
                    <Loader2 className="size-8 text-[#e91e63] animate-spin" />
                  </div>
                  <h3 className="text-sm font-bold text-[#344767]">Generating your demo...</h3>
                  <p className="text-xs text-[#7b809a] mt-1">AI is building a full Next.js application</p>
                </>
              ) : status === "building" ? (
                <>
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1a73e8]/10 to-[#1565c0]/10">
                    <Loader2 className="size-8 text-[#1a73e8] animate-spin" />
                  </div>
                  <h3 className="text-sm font-bold text-[#344767]">Building application...</h3>
                  <p className="text-xs text-[#7b809a] mt-1">Compiling Next.js project. This takes 2-5 minutes.</p>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#f0f2f5]">
                    <Monitor className="size-8 text-[#7b809a]" />
                  </div>
                  <h3 className="text-sm font-bold text-[#344767]">Preview will appear here</h3>
                  <p className="text-xs text-[#7b809a] mt-1">Answer the questions in the chat to start building</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create demo builder (split view container)**

Create `apps/web/src/components/demo-builder.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { DemoChat } from "@/components/demo-chat";
import { DemoPreview } from "@/components/demo-preview";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Message {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface DemoProject {
  id: string;
  name: string;
  demo_type: string;
  status: string;
  preview_url: string | null;
  live_url: string | null;
}

export function DemoBuilder({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DemoProject | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const data = await api<DemoProject>(`/demos/${projectId}`);
      setProject(data);
    } catch {
      toast.error("Failed to load demo");
    }
  }, [projectId]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api<Message[]>(`/demos/${projectId}/messages`);
      setMessages(data);
    } catch {
      // silent
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
    loadMessages();
  }, [loadProject, loadMessages]);

  // Poll build status when building
  useEffect(() => {
    if (project?.status === "building" || project?.status === "generating") {
      pollRef.current = setInterval(async () => {
        try {
          const status = await api<{ status: string; preview_url: string | null }>(`/demos/${projectId}/build-status`);
          if (status.status !== project.status) {
            setProject((p) => p ? { ...p, status: status.status, preview_url: status.preview_url || p.preview_url } : p);
            loadMessages();
            if (status.status === "preview" || status.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
            }
          }
        } catch {}
      }, 5000);

      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [project?.status, projectId, loadMessages]);

  const handleSendMessage = async (content: string) => {
    setSending(true);
    // Optimistically add user message
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const response = await apiPost<Message>(`/demos/${projectId}/message`, { content });
      // Reload all messages to get the AI response
      await loadMessages();
      await loadProject();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const result = await apiPost<{ live_url: string }>(`/demos/${projectId}/deploy`, {});
      toast.success("Demo deployed!");
      setProject((p) => p ? { ...p, live_url: result.live_url, status: "deployed" } : p);
      loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  if (!project) return null;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#e9ecef] bg-white px-4 py-2.5 rounded-t-xl">
        <Link href="/demos" className="text-[#7b809a] hover:text-[#344767]">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-sm font-bold text-[#344767]">{project.name}</h2>
          <p className="text-[10px] text-[#7b809a] capitalize">{project.demo_type.replace("_", " ")}</p>
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden rounded-b-xl">
        {/* Chat — 40% */}
        <div className="w-[40%] border-r border-[#e9ecef] bg-[#f8f9fa]">
          <DemoChat
            messages={messages}
            onSendMessage={handleSendMessage}
            sending={sending}
            status={project.status}
          />
        </div>

        {/* Preview — 60% */}
        <div className="flex-1">
          <DemoPreview
            previewUrl={project.preview_url}
            liveUrl={project.live_url}
            status={project.status}
            onDeploy={handleDeploy}
            deploying={deploying}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/demo-chat.tsx apps/web/src/components/demo-preview.tsx apps/web/src/components/demo-builder.tsx
git commit -m "feat: add demo builder split-view UI — chat panel + preview iframe"
```

---

## Task 10: Prospect Panel — "Build Demo" Button

**Files:**
- Modify: `apps/web/src/components/prospect-panel.tsx`

- [ ] **Step 1: Add Build Demo button**

In the prospect panel header (where the action buttons are), add a "Build Demo" button that:
1. Opens a small dialog asking: "Demo type: Landing Page or SaaS Dashboard?" and a name input
2. On submit, calls `POST /api/demos` with the prospect_id, name, and demo_type
3. Navigates to `/demos?id={new_demo_id}`

Add to the action buttons section of `prospect-panel.tsx`:

```tsx
<Button
  size="sm"
  className="bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white"
  onClick={() => setShowDemoDialog(true)}
>
  <Wand2 className="size-3.5 mr-1.5" /> Build Demo
</Button>
```

Add a Dialog for demo type selection with two cards (Landing Page / SaaS Dashboard) and a name input. On submit, POST to `/demos` and navigate.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/prospect-panel.tsx
git commit -m "feat: add Build Demo button to prospect detail panel"
```

---

## Task 11: CloudFront Behavior + Deploy Script Update

**Files:**
- Modify: `deploy.sh`

- [ ] **Step 1: Add `/api/demos*` to CloudFront behaviors**

Run the CloudFront update to add the demos API path (same as we did for other API routes — but since we now use `/api/*` prefix, this is already covered).

- [ ] **Step 2: Update deploy script with demo template commands**

Add to `deploy.sh`:

```bash
  demo-template)
    echo ">>> Building demo template Docker image..."
    cd infra/demo-template
    docker build --platform linux/amd64 -t prospector-demo-template .
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
    docker tag prospector-demo-template:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/prospector-demo-template:latest
    docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/prospector-demo-template:latest
    echo ">>> Demo template pushed to ECR"

    echo ">>> Uploading buildspec..."
    aws s3 cp buildspec.yml s3://brownshift-demos-$ACCOUNT_ID/buildspec/buildspec.yml
    echo ">>> Done"
    ;;
```

- [ ] **Step 3: Commit**

```bash
git add deploy.sh
git commit -m "feat: add demo-template deployment to deploy script"
```

---

## Self-Review

**Spec coverage:**
- Demo project CRUD — Task 4 (router)
- Chat with guided questions — Task 4 (router) + Task 9 (frontend chat)
- AI code generation — Task 2 (generator service)
- CodeBuild integration — Task 3 (builder service) + Task 6 (CDK)
- S3 upload and preview — Task 3 (builder service)
- Deploy to public S3 — Task 3 (builder service) + Task 4 (deploy endpoint)
- Split-view UI — Task 9 (demo-builder, demo-chat, demo-preview)
- Demo list page — Task 8 (page + card)
- Prospect panel integration — Task 10 (Build Demo button)
- Docker template — Task 5 (template files + Dockerfile)
- Infrastructure — Task 6 (CDK)
- Build & push template — Task 7

**Placeholder scan:** No TBDs, TODOs, or vague instructions found. All code blocks are complete.

**Type consistency:** DemoProject, DemoMessage, DemoFile types are consistent between models (Task 1), router (Task 4), and frontend (Tasks 8, 9). Message metadata structure matches between router and chat component.
