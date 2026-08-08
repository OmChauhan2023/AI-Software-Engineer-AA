import asyncio
import json
import re
import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from backend.db.database import get_db
from backend.models.repository import Repository, IngestionStatus
from backend.schemas.repository_schema import RepositoryCreateRequest, RepositoryResponse
from backend.services.ingestion_pipeline import ingestion_pipeline
from backend.services.vector_db import qdrant_service
from backend.workers.task_queue import task_queue

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/repositories", tags=["Repositories"])


def parse_github_url(url: str):
    pattern = r"github\.com/([^/]+)/([^/]+)"
    match = re.search(pattern, url.strip().rstrip(".git"))
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub repository URL format. Example: https://github.com/owner/repo"
        )
    return match.group(1), match.group(2)


@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_repository(
    payload: RepositoryCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    owner, name = parse_github_url(payload.github_url)
    clean_url = f"https://github.com/{owner}/{name}"

    # Check if repo already exists
    existing = await db.execute(
        select(Repository).where(Repository.github_url == clean_url)
    )
    repo = existing.scalars().first()

    if repo:
        # Re-trigger ingestion if failed or re-submitted
        repo.status = IngestionStatus.PENDING
        repo.progress_percentage = 0
        repo.status_message = "Re-queued for ingestion"
        await db.commit()
        await db.refresh(repo)
    else:
        repo = Repository(
            github_url=clean_url,
            owner=owner,
            name=name,
            status=IngestionStatus.PENDING,
            status_message="Repository queued for ingestion",
            progress_percentage=0
        )
        db.add(repo)
        await db.commit()
        await db.refresh(repo)

    # Trigger background pipeline
    background_tasks.add_task(ingestion_pipeline.process_repository, str(repo.id))

    return repo


@router.get("", response_model=List[RepositoryResponse])
async def list_repositories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repository).order_by(Repository.created_at.desc()))
    return result.scalars().all()


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = result.scalars().first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.get("/{repo_id}/progress")
async def stream_repository_progress(repo_id: uuid.UUID):
    """
    Server-Sent Events (SSE) stream broadcasting real-time ingestion progress.
    """
    async def event_generator():
        redis = await task_queue.get_redis()
        pubsub = redis.pubsub()
        channel = f"repo_progress:{str(repo_id)}"
        await pubsub.subscribe(channel)

        # Send initial cached state
        cached = await task_queue.get_cached_status(str(repo_id))
        if cached:
            yield f"data: {json.dumps(cached)}\n\n"

        try:
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    data = message["data"]
                    yield f"data: {data}\n\n"
                    parsed = json.loads(data)
                    if parsed.get("status") in ("ready", "failed"):
                        break
                await asyncio.sleep(0.5)
        finally:
            await pubsub.unsubscribe(channel)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = result.scalars().first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    await qdrant_service.delete_repo_points(str(repo_id))
    await db.delete(repo)
    await db.commit()
