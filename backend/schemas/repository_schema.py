from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from datetime import datetime
import uuid
from backend.models.repository import IngestionStatus


class RepositoryCreateRequest(BaseModel):
    github_url: str


class RepositoryResponse(BaseModel):
    id: uuid.UUID
    github_url: str
    owner: str
    name: str
    default_branch: str
    status: IngestionStatus
    status_message: str
    progress_percentage: int
    total_files: int
    total_chunks: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FileResponse(BaseModel):
    id: uuid.UUID
    file_path: str
    language: str
    line_count: int
    size_bytes: int

    class Config:
        from_attributes = True


class FileContentResponse(BaseModel):
    id: uuid.UUID
    file_path: str
    language: str
    line_count: int
    content: str


class ChunkResponse(BaseModel):
    id: uuid.UUID
    file_path: str
    chunk_type: str
    symbol_name: Optional[str]
    start_line: int
    end_line: int
    signature: Optional[str]
    docstring: Optional[str]
    content: str

    class Config:
        from_attributes = True
