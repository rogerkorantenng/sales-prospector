import re
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db import get_db, async_session
from app.config import settings
from app.models.tables import DemoProject, DemoMessage, DemoFile, Company, AIAnalysis
from app.services.demo_generator import DemoGeneratorService, SYSTEM_PROMPT
from app.services.demo_builder import DemoBuilderService

router = APIRouter(prefix="/demos", tags=["demos"])
# Preview proxy lives on a separate router: it is loaded in an <iframe>,
# which cannot send an Authorization header.
preview_router = APIRouter(prefix="/demos", tags=["demos"])
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
        "metadata": m.msg_metadata,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ─── CRUD ────────────────────────────────────────────

@router.post("")
@router.post("/")
async def create_demo(body: CreateDemoRequest, db: AsyncSession = Depends(get_db)):
    # Verify prospect exists — eagerly load all columns we'll need
    result = await db.execute(select(Company).where(Company.id == body.prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    # Capture prospect data now before session expires
    prospect_name = prospect.name
    prospect_industry = prospect.industry
    prospect_region = prospect.region
    prospect_city = prospect.city
    prospect_about = prospect.about_text

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
    intro = f"I'm setting up a {body.demo_type.replace('_', ' ')} demo for **{prospect_name}** ({prospect_industry}, {prospect_region})."

    system_msg = DemoMessage(
        project_id=project.id,
        role="assistant",
        content=intro,
        msg_metadata=None,
    )
    db.add(system_msg)

    # Add first question — generate smart summary from AI analysis
    if questions:
        q = questions[0]
        options = q.get("options", [])

        if q.get("derive_from") == "ai_summary":
            # Build a smart summary from prospect data
            analysis = await db.execute(
                select(AIAnalysis).where(AIAnalysis.company_id == body.prospect_id)
                .order_by(AIAnalysis.analyzed_at.desc()).limit(1)
            )
            ai = analysis.scalar_one_or_none()

            services_text = ""
            if ai and ai.recommended_services:
                service_names = [s["service_name"] if isinstance(s, dict) else s for s in ai.recommended_services[:3]]
                services_text = f" focusing on {', '.join(service_names)}"

            pain_text = ""
            if ai and ai.pain_points:
                pains = ai.pain_points[:2] if isinstance(ai.pain_points, list) else []
                if pains:
                    pain_text = f" Their main pain points: {', '.join(pains)}."

            about_text = ""
            if prospect_about:
                about_text = f" From their website: {prospect_about[:150]}."

            summary = (
                f"Based on our research on **{prospect_name}** ({prospect_industry}, {prospect_city or prospect_region}), "
                f"I'll build a full management dashboard{services_text}.{pain_text}{about_text}\n\n"
                f"The app will include all relevant pages (dashboard, orders/records, analytics, staff, settings), "
                f"working search, filters, sorting, modals, and realistic {prospect_industry} data with Ghanaian names and GHS currency.\n\n"
                f"Does this sound right, or would you change anything?"
            )

            q_msg = DemoMessage(
                project_id=project.id,
                role="assistant",
                content=summary,
                msg_metadata={
                    "type": "question",
                    "question_index": 0,
                    "quick_replies": options,
                    "select_type": q.get("type", "open"),
                },
            )
        else:
            q_msg = DemoMessage(
                project_id=project.id,
                role="assistant",
                content=q["question"],
                msg_metadata={
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

    # Stop Fargate task if one is running
    if project.codebuild_id:
        try:
            task_status = builder.get_task_status(project.codebuild_id)
            if task_status["status"] in ("starting", "running"):
                builder.stop_task(project.codebuild_id)
        except Exception:
            pass

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
                msg_metadata={
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
            msg_metadata={"type": "generating", "status": "started"},
        )
        db.add(generating_msg)
        project.status = "generating"
        await db.commit()

        background_tasks.add_task(_generate_and_build, project_id)
        return _serialize_message(generating_msg)

    else:
        # Post-generation phase: detect if it's a question or a change request
        is_question = await _is_question_not_change(body.content)

        if is_question:
            # Answer the question without modifying code
            background_tasks.add_task(_answer_question, project_id, body.content)
            thinking_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content="Let me think about that...",
                msg_metadata={"type": "thinking"},
            )
            db.add(thinking_msg)
            await db.commit()
            return _serialize_message(thinking_msg)
        else:
            # Actual modification request
            modifying_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content="On it — updating the code now...",
                msg_metadata={"type": "modifying", "status": "started"},
            )
            db.add(modifying_msg)
            project.status = "generating"
            await db.commit()

            background_tasks.add_task(_modify_and_build, project_id, body.content)
            return _serialize_message(modifying_msg)


async def _generate_and_build(project_id: str):
    """Background task: generate code with AI, launch Fargate task, push files, start dev server."""
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
            # 1. Generate files with AI
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

            # Also upload to S3 as backup
            builder.upload_source_files(project_id, files)

            # 2. Launch Fargate task
            task_arn = builder.launch_task(project_id)
            project.codebuild_id = task_arn  # reuse column for task ARN
            project.status = "building"
            await db.commit()

            # 3. Wait for task to get a public IP
            ip = await builder.wait_for_task_ip(task_arn, max_wait=120)

            # 4. Wait for management API to be reachable
            await builder.wait_for_task_ready(ip, max_wait=60)

            # 5. Call POST /setup (install deps — takes a few minutes)
            await builder.setup_task(ip)

            # 6. Call POST /files with generated code
            await builder.write_files(ip, files)

            # 7. Call POST /start (launch next dev)
            await builder.start_dev(ip)

            # 8. Save preview URL
            preview_url = builder.get_preview_url(ip)
            project.preview_url = preview_url
            project.status = "preview"

            # Add completion message
            file_list = "\n".join(f"- `{p}`" for p in sorted(files.keys()))
            done_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=(
                    f"Your demo is ready! {len(files)} files created.\n\n"
                    f"**Files:**\n{file_list}\n\n"
                    f"Check the preview on the right. Let me know if you'd like any changes."
                ),
                msg_metadata={
                    "type": "preview_ready",
                    "files_count": len(files),
                    "task_arn": task_arn,
                    "preview_url": preview_url,
                },
            )
            db.add(done_msg)
            await db.commit()

        except Exception as e:
            import traceback, logging
            logging.getLogger(__name__).error(f"[generate] Failed: {type(e).__name__}: {e}")
            logging.getLogger(__name__).error(traceback.format_exc())
            project.status = "failed"
            error_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Sorry, generation failed: {type(e).__name__}: {str(e)[:200]}. Please try again.",
                msg_metadata={"type": "error"},
            )
            db.add(error_msg)
            await db.commit()


async def _is_question_not_change(message: str) -> bool:
    """Detect if the user is asking a question vs requesting a code change."""
    msg = message.strip().lower()
    question_signals = [
        msg.endswith("?"),
        msg.startswith(("why", "what", "how", "can you", "could you explain", "is it", "are there", "do you", "what's", "where", "when")),
        "explain" in msg and "change" not in msg,
        "tell me" in msg,
        "what happened" in msg,
        "what's going on" in msg,
        "why is" in msg,
        "how does" in msg,
        "can you confirm" in msg,
        "is this" in msg and "fix" not in msg,
    ]
    change_signals = [
        any(w in msg for w in ["fix", "change", "update", "add", "remove", "replace", "make", "build", "create", "move", "delete", "rebuild", "redo"]),
        "let's" in msg,
        "should be" in msg,
        "instead of" in msg,
        "i want" in msg,
        "i need" in msg,
    ]
    if any(change_signals):
        return False
    if any(question_signals):
        return True
    return False


async def _answer_question(project_id: str, question: str):
    """Background task: answer a user question without modifying code."""
    async with async_session() as db:
        msgs_result = await db.execute(
            select(DemoMessage).where(DemoMessage.project_id == project_id)
            .order_by(DemoMessage.created_at.asc())
        )
        all_msgs = msgs_result.scalars().all()
        conversation = [{"role": m.role if m.role != "system" else "user", "content": m.content} for m in all_msgs if m.role in ("user", "assistant")]

        files_result = await db.execute(
            select(DemoFile).where(DemoFile.project_id == project_id)
        )
        current_files = {f.file_path: f.content for f in files_result.scalars().all()}

        try:
            answer_prompt = f"""The user is asking a question about the demo project — they are NOT requesting code changes.

Current files in the project: {', '.join(current_files.keys())}

User's question: {question}

Answer their question helpfully and concisely. Do NOT output any <file> tags. Just explain/answer in plain text. If they're reporting a bug, acknowledge it and ask if they'd like you to fix it."""

            messages = conversation[-6:]
            messages.append({"role": "user", "content": answer_prompt})
            response = await generator._ainvoke_raw(SYSTEM_PROMPT, messages)

            # Remove the placeholder "Let me think about that..." message
            placeholder = await db.execute(
                select(DemoMessage).where(
                    DemoMessage.project_id == project_id,
                    DemoMessage.content == "Let me think about that...",
                ).order_by(DemoMessage.created_at.desc()).limit(1)
            )
            placeholder_msg = placeholder.scalar_one_or_none()
            if placeholder_msg:
                placeholder_msg.content = response
                placeholder_msg.msg_metadata = {"type": "answer"}
            else:
                answer_msg = DemoMessage(
                    project_id=project_id,
                    role="assistant",
                    content=response,
                    msg_metadata={"type": "answer"},
                )
                db.add(answer_msg)

            await db.commit()

        except Exception as e:
            error_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Sorry, I couldn't process that: {str(e)[:150]}",
                msg_metadata={"type": "error"},
            )
            db.add(error_msg)
            await db.commit()


async def _modify_and_build(project_id: str, user_request: str):
    """Background task: modify existing files with AI, push to running Fargate task."""
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

        # Get the project to find the task ARN
        project_result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
        project = project_result.scalar_one()

        try:
            # Get modified files and explanation from AI
            modified_files, ai_explanation = await generator.modify_demo(current_files, conversation[-10:], user_request)

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

            # Push modified files to the running Fargate task
            task_arn = project.codebuild_id
            if task_arn:
                task_status = builder.get_task_status(task_arn)
                if task_status["status"] == "running" and task_status["ip"]:
                    ip = task_status["ip"]
                    # Send all files (current + modified) so the task has the full set
                    all_files = dict(current_files)
                    all_files.update(modified_files)
                    await builder.write_files(ip, all_files)
                    # Dev server auto-reloads — no rebuild needed!
                    project.status = "preview"
                else:
                    # Task not running — fall back to launching a new one
                    await _relaunch_task(project, {**current_files, **modified_files}, db)
            else:
                # No task yet — launch one
                await _relaunch_task(project, {**current_files, **modified_files}, db)

            # Also backup to S3
            all_files = dict(current_files)
            all_files.update(modified_files)
            builder.upload_source_files(project_id, all_files)

            changed_list = ", ".join(f"`{p}`" for p in modified_files.keys())
            explanation_text = f"{ai_explanation}\n\n" if ai_explanation else ""
            done_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"{explanation_text}Changes applied to {len(modified_files)} file(s): {changed_list}",
                msg_metadata={
                    "type": "preview_ready",
                    "files_changed": list(modified_files.keys()),
                    "preview_url": project.preview_url,
                },
            )
            db.add(done_msg)
            await db.commit()

        except Exception as e:
            project.status = "preview"

            error_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Modification failed: {str(e)[:200]}. The previous version is still available.",
                msg_metadata={"type": "error"},
            )
            db.add(error_msg)
            await db.commit()


async def _relaunch_task(project: DemoProject, files: dict[str, str], db: AsyncSession):
    """Launch a new Fargate task, set it up, push files, and start the dev server."""
    import asyncio

    task_arn = builder.launch_task(project.id)
    project.codebuild_id = task_arn
    await db.commit()

    # Wait for task to get public IP (up to 2 min)
    ip = await builder.wait_for_task_ip(task_arn, max_wait=180)

    # Wait for management API to be reachable (up to 1 min)
    await builder.wait_for_task_ready(ip, max_wait=90)

    # Trigger setup (npm install + shadcn — takes 2-3 min)
    await builder.setup_task(ip)

    # Poll for setup completion (up to 5 min)
    for _ in range(60):
        await asyncio.sleep(5)
        try:
            status = await builder.call_task(ip, "/status", method="GET")
            if status.get("status") == "ready":
                break
            if status.get("status") == "error":
                raise Exception(f"Setup failed: {status.get('error', 'unknown')}")
        except Exception:
            continue
    else:
        raise TimeoutError("Setup did not complete within 5 minutes")

    # Write AI-generated files
    await builder.write_files(ip, files)

    # Start Next.js dev server
    await builder.start_dev(ip)

    # Wait for dev server to be ready (up to 1 min)
    for _ in range(12):
        await asyncio.sleep(5)
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"http://{ip}:3000/")
                if resp.status_code == 200:
                    break
        except Exception:
            continue

    project.preview_url = f"http://{ip}:3000"
    project.status = "preview"


# ─── Retry ───────────────────────────────────────────

@router.post("/{project_id}/retry")
async def retry_demo(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Retry a failed demo — relaunches Fargate task with existing generated files."""
    result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")

    # Check we have files to retry with
    files_result = await db.execute(select(DemoFile).where(DemoFile.project_id == project_id))
    files = {f.file_path: f.content for f in files_result.scalars().all()}

    if not files:
        raise HTTPException(status_code=400, detail="No generated files found. Create a new demo instead.")

    # Reset status
    project.status = "generating"
    retry_msg = DemoMessage(
        project_id=project_id,
        role="assistant",
        content=f"Retrying with {len(files)} existing files. Launching build server...",
        msg_metadata={"type": "retrying"},
    )
    db.add(retry_msg)
    await db.commit()

    background_tasks.add_task(_retry_build, project_id, files)
    return {"status": "retrying", "files": len(files)}


async def _retry_build(project_id: str, files: dict[str, str]):
    """Background task: launch Fargate task with existing files."""
    async with async_session() as db:
        result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
        project = result.scalar_one()

        try:
            await _relaunch_task(project, files, db)

            done_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content="Demo is ready! Check the preview on the right.",
                msg_metadata={"type": "preview_ready", "preview_url": project.preview_url},
            )
            db.add(done_msg)
            await db.commit()
        except Exception as e:
            import traceback, logging
            logging.getLogger(__name__).error(f"[retry] Failed: {type(e).__name__}: {e}")
            logging.getLogger(__name__).error(traceback.format_exc())
            project.status = "failed"
            error_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content=f"Retry failed: {type(e).__name__}: {str(e)[:200]}",
                msg_metadata={"type": "error"},
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

    # codebuild_id now stores the Fargate task ARN
    task_status = builder.get_task_status(project.codebuild_id)

    # Update project status based on task state
    if task_status["status"] == "running" and project.status == "building":
        # Task is running — check if preview URL is set (meaning setup completed)
        if project.preview_url:
            project.status = "preview"
            preview_msg = DemoMessage(
                project_id=project_id,
                role="assistant",
                content="Your demo is ready! Check the preview on the right. Let me know if you'd like any changes.",
                msg_metadata={"type": "preview_ready", "preview_url": project.preview_url},
            )
            db.add(preview_msg)
            await db.commit()
    elif task_status["status"] == "stopped" and project.status == "building":
        project.status = "failed"
        fail_msg = DemoMessage(
            project_id=project_id,
            role="assistant",
            content="The build task stopped unexpectedly. Please try regenerating the demo.",
            msg_metadata={"type": "build_failed"},
        )
        db.add(fail_msg)
        await db.commit()

    return {
        "status": project.status,
        "build": {
            "task_status": task_status["status"],
            "task_ip": task_status.get("ip"),
        },
        "preview_url": project.preview_url if project.status in ("preview", "deployed") else None,
    }


# ─── Deploy ──────────────────────────────────────────

@router.post("/{project_id}/deploy")
async def deploy_demo(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DemoProject).options(selectinload(DemoProject.prospect))
        .where(DemoProject.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")
    if project.status not in ("preview", "deployed"):
        raise HTTPException(status_code=400, detail=f"Cannot deploy demo with status '{project.status}'")

    project.status = "building"
    deploy_msg = DemoMessage(
        project_id=project_id,
        role="assistant",
        content="Deploying... Building static site and uploading to S3.",
        msg_metadata={"type": "deploying"},
    )
    db.add(deploy_msg)
    await db.commit()

    background_tasks.add_task(_deploy_demo, project_id)
    return {"status": "deploying"}


async def _deploy_demo(project_id: str):
    """Background: launch fresh task, build static export, upload to S3, create public bucket."""
    import asyncio
    import traceback
    import logging
    logger = logging.getLogger(__name__)

    async with async_session() as db:
        result = await db.execute(
            select(DemoProject).options(selectinload(DemoProject.prospect))
            .where(DemoProject.id == project_id)
        )
        project = result.scalar_one()

        # Get files from DB
        files_result = await db.execute(select(DemoFile).where(DemoFile.project_id == project_id))
        files = {f.file_path: f.content for f in files_result.scalars().all()}

        if not files:
            project.status = "preview"
            db.add(DemoMessage(project_id=project_id, role="assistant",
                content="Deploy failed: no files found.", msg_metadata={"type": "error"}))
            await db.commit()
            return

        try:
            logger.info(f"[deploy] Launching build task for {project_id}")
            task_arn = builder.launch_task(project_id)
            logger.info(f"[deploy] Task launched: {task_arn}")

            logger.info("[deploy] Waiting for task IP...")
            ip = await builder.wait_for_task_ip(task_arn, max_wait=300)
            logger.info(f"[deploy] Got IP: {ip}")

            logger.info("[deploy] Waiting for management API...")
            await builder.wait_for_task_ready(ip, max_wait=120)
            logger.info("[deploy] Management API reachable")

            logger.info("[deploy] Starting setup (npm install + shadcn)...")
            await builder.setup_task(ip)

            # Poll for setup completion — up to 10 minutes
            for attempt in range(120):
                await asyncio.sleep(5)
                try:
                    status = await builder.call_task(ip, "/status", method="GET")
                    if status.get("status") == "ready":
                        logger.info(f"[deploy] Setup complete after {attempt * 5}s")
                        break
                    if status.get("status") == "error":
                        raise Exception(f"Setup failed: {status.get('error', 'unknown')}")
                except Exception as poll_err:
                    if "Setup failed" in str(poll_err):
                        raise
                    continue
            else:
                raise TimeoutError("Setup did not complete within 10 minutes")

            logger.info(f"[deploy] Writing {len(files)} files...")
            await builder.write_files(ip, files)
            logger.info("[deploy] Files written")

            prospect_slug = _slugify(project.prospect.name)
            logger.info(f"[deploy] Triggering build + S3 upload (slug: {prospect_slug})...")
            await builder.deploy_to_s3(ip, project_id, slug=prospect_slug)

            # Poll for build completion — up to 5 minutes
            for attempt in range(60):
                await asyncio.sleep(5)
                try:
                    status = await builder.call_task(ip, "/status", method="GET")
                    if status.get("status") == "deployed":
                        logger.info(f"[deploy] Build complete after {attempt * 5}s")
                        break
                    if status.get("status") == "error":
                        raise Exception(f"Build failed: {status.get('error', 'unknown')}")
                except Exception as poll_err:
                    if "Build failed" in str(poll_err):
                        raise
                    continue
            else:
                raise TimeoutError("Build did not complete within 5 minutes")

            logger.info("[deploy] Copying to public bucket...")
            prospect_slug = _slugify(project.prospect.name)
            live_url = builder.deploy(project_id, prospect_slug)
            logger.info(f"[deploy] Live URL: {live_url}")

            builder.stop_task(task_arn)

            # Also stop the preview dev server task if it's different
            if project.codebuild_id and project.codebuild_id != task_arn:
                try:
                    builder.stop_task(project.codebuild_id)
                    logger.info(f"[deploy] Stopped preview task: {project.codebuild_id}")
                except Exception:
                    pass

            project.live_url = live_url
            project.status = "deployed"
            db.add(DemoMessage(project_id=project_id, role="assistant",
                content=f"Demo deployed! Share this link:\n\n{live_url}",
                msg_metadata={"type": "deployed", "live_url": live_url}))
            await db.commit()

        except Exception as e:
            error_detail = f"{type(e).__name__}: {str(e)}"
            logger.error(f"[deploy] Failed: {error_detail}")
            logger.error(traceback.format_exc())
            project.status = "preview"
            db.add(DemoMessage(project_id=project_id, role="assistant",
                content=f"Deploy failed: {error_detail[:300]}",
                msg_metadata={"type": "error"}))
            await db.commit()


# ─── Edit (re-enter dev mode after deploy) ──────────

@router.post("/{project_id}/edit")
async def edit_demo(project_id: str, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Re-launch a dev server for an already deployed demo."""
    result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Demo not found")

    files_result = await db.execute(select(DemoFile).where(DemoFile.project_id == project_id))
    files = {f.file_path: f.content for f in files_result.scalars().all()}

    if not files:
        raise HTTPException(status_code=400, detail="No files found")

    project.status = "generating"
    edit_msg = DemoMessage(
        project_id=project_id,
        role="assistant",
        content="Re-launching dev server for editing...",
        msg_metadata={"type": "relaunching"},
    )
    db.add(edit_msg)
    await db.commit()

    background_tasks.add_task(_retry_build, project_id, files)
    return {"status": "relaunching"}


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


# ─── Preview Proxy ──────────────────────────────────

from fastapi import Request
from fastapi.responses import Response
import httpx as httpx_module

@preview_router.get("/{project_id}/preview/{path:path}")
@preview_router.get("/{project_id}/preview")
async def proxy_preview(project_id: str, request: Request, path: str = "", db: AsyncSession = Depends(get_db)):
    """Proxy requests to the demo Fargate task's Next.js dev server.
    This avoids mixed content issues (HTTPS dashboard → HTTP task).
    """
    result = await db.execute(select(DemoProject).where(DemoProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project or not project.preview_url:
        raise HTTPException(status_code=404, detail="Demo preview not available")

    # Extract the task IP from preview_url (http://IP:3000)
    target_base = project.preview_url.rstrip("/")

    # Build the target URL
    target_url = f"{target_base}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    try:
        proxy_base = f"/api/demos/{project_id}/preview"
        async with httpx_module.AsyncClient(timeout=30, follow_redirects=False) as client:
            resp = await client.get(target_url, headers={
                "Accept": request.headers.get("accept", "*/*"),
                "Accept-Encoding": request.headers.get("accept-encoding", ""),
            })

            # Handle redirects — rewrite location to go through proxy
            if resp.status_code in (301, 302, 307, 308):
                location = resp.headers.get("location", "")
                if location.startswith("/"):
                    location = f"{proxy_base}{location}"
                return Response(
                    content=b"",
                    status_code=resp.status_code,
                    headers={"Location": location},
                )

            # Determine content type
            content_type = resp.headers.get("content-type", "text/html")

            # Rewrite paths to go through the proxy
            body = resp.content
            if "text/html" in content_type:
                html = body.decode("utf-8", errors="replace")
                # Rewrite all absolute paths: /_next/, /favicon, etc
                html = html.replace('src="/', f'src="{proxy_base}/')
                html = html.replace("src='/", f"src='{proxy_base}/")
                html = html.replace('href="/', f'href="{proxy_base}/')
                html = html.replace("href='/", f"href='{proxy_base}/")
                # Fix double-rewrite of external URLs (https://... got broken)
                html = html.replace(f'href="{proxy_base}/', f'href="{proxy_base}/').replace(f'{proxy_base}//', '/')
                html = html.replace(f'href="{proxy_base}/https:', 'href="https:')
                html = html.replace(f'href="{proxy_base}/http:', 'href="http:')
                html = html.replace(f'src="{proxy_base}/https:', 'src="https:')
                html = html.replace(f'src="{proxy_base}/http:', 'src="http:')
                body = html.encode("utf-8")
            elif "javascript" in content_type:
                js = body.decode("utf-8", errors="replace")
                js = js.replace('"/_next/', f'"{proxy_base}/_next/')
                body = js.encode("utf-8")

            return Response(
                content=body,
                status_code=resp.status_code,
                media_type=content_type,
            )
    except httpx_module.ConnectError:
        raise HTTPException(status_code=502, detail="Demo server not reachable") from None
    except httpx_module.TimeoutException:
        raise HTTPException(status_code=504, detail="Demo server timeout") from None
