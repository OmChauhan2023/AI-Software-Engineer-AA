from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid


class ChatRequest(BaseModel):
    query: str
    session_id: Optional[uuid.UUID] = None


class CitationDTO(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    snippet: str
    symbol_name: Optional[str] = None


class MessageDTO(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    citations: List[CitationDTO] = []

    class Config:
        from_attributes = True


class ChatSessionDTO(BaseModel):
    id: uuid.UUID
    repo_id: uuid.UUID
    title: str
    created_at: datetime
    messages: List[MessageDTO] = []

    class Config:
        from_attributes = True
