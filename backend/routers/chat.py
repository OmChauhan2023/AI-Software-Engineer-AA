import json
import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.db.database import get_db
from backend.models.repository import Repository, IngestionStatus
from backend.models.chat import ChatSession, Message, MessageRole, Citation
from backend.schemas.chat_schema import ChatRequest, ChatSessionDTO, MessageDTO
from backend.services.embedding_service import embedding_service
from backend.services.vector_db import qdrant_service
from backend.services.chat_service import chat_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Chat"])


@router.post("/api/repositories/{repo_id}/chat")
async def stream_chat(
    repo_id: uuid.UUID,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    # Verify repo exists and is ready
    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = result.scalars().first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo.status != IngestionStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Repository is still in {repo.status.value} status. Please wait until ready."
        )

    # 1. Manage session
    session_id = payload.session_id
    if not session_id:
        new_session = ChatSession(
            repo_id=repo_id,
            title=payload.query[:40] + ("..." if len(payload.query) > 40 else "")
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        session_id = new_session.id

    # 2. Record User message in DB
    user_msg = Message(
        session_id=session_id,
        role=MessageRole.USER,
        content=payload.query
    )
    db.add(user_msg)
    await db.commit()

    # 3. Embed user query with Gemini text-embedding-004
    query_vector = await embedding_service.get_embedding(payload.query)

    # 4. Qdrant vector retrieval filtered by repo_id
    retrieved_chunks = await qdrant_service.search(
        repo_id=str(repo_id),
        query_vector=query_vector,
        limit=8,
        score_threshold=0.30
    )

    async def sse_generator():
        # First send session metadata
        yield f"data: {json.dumps({'type': 'session_init', 'session_id': str(session_id)})}\n\n"

        assistant_full_text = ""
        final_citations = []

        async for event in chat_service.stream_chat_response(payload.query, retrieved_chunks):
            if event["type"] == "token":
                assistant_full_text += event["text"]
            elif event["type"] == "done":
                final_citations = event.get("extracted_citations", [])

            yield f"data: {json.dumps(event)}\n\n"

        # Record Assistant message in DB after stream finishes
        async with AsyncSessionLocal() if 'AsyncSessionLocal' in globals() else db:
            asst_msg = Message(
                session_id=session_id,
                role=MessageRole.ASSISTANT,
                content=assistant_full_text
            )
            db.add(asst_msg)
            await db.flush()

            for cit in final_citations:
                db_cit = Citation(
                    message_id=asst_msg.id,
                    file_path=cit["file_path"],
                    start_line=cit["start_line"],
                    end_line=cit["end_line"],
                    snippet=cit["snippet"]
                )
                db.add(db_cit)
            await db.commit()

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.get("/api/repositories/{repo_id}/sessions", response_model=List[ChatSessionDTO])
async def list_repo_sessions(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.repo_id == repo_id)
        .order_by(ChatSession.created_at.desc())
    )
    return result.scalars().all()


@router.get("/api/sessions/{session_id}/messages", response_model=List[MessageDTO])
async def get_session_messages(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .options(selectinload(Message.citations))
        .order_by(Message.created_at.asc())
    )
    return result.scalars().all()
