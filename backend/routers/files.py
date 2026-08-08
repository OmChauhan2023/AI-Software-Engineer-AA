import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.database import get_db
from backend.models.repository import SourceFile
from backend.models.chunk import CodeChunk
from backend.schemas.repository_schema import FileResponse, FileContentResponse, ChunkResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/repositories", tags=["Files"])


@router.get("/{repo_id}/files", response_model=List[FileResponse])
async def list_repository_files(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SourceFile)
        .where(SourceFile.repo_id == repo_id)
        .order_by(SourceFile.file_path.asc())
    )
    return result.scalars().all()


@router.get("/{repo_id}/files/{file_id}", response_model=FileContentResponse)
async def get_file_content(
    repo_id: uuid.UUID,
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(SourceFile)
        .where(SourceFile.repo_id == repo_id, SourceFile.id == file_id)
    )
    file_record = result.scalars().first()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found in repository")
    return file_record


@router.get("/{repo_id}/chunks", response_model=List[ChunkResponse])
async def get_file_chunks(
    repo_id: uuid.UUID,
    file_path: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CodeChunk)
        .where(CodeChunk.repo_id == repo_id, CodeChunk.file_path == file_path)
        .order_by(CodeChunk.start_line.asc())
    )
    return result.scalars().all()
