import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from backend.db.database import Base


class IngestionStatus(str, Enum):
    PENDING = "pending"
    CLONING = "cloning"
    PARSING = "parsing"
    EMBEDDING = "embedding"
    READY = "ready"
    FAILED = "failed"


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    github_url: Mapped[str] = mapped_column(String(512), unique=True, index=True, nullable=False)
    owner: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    default_branch: Mapped[str] = mapped_column(String(100), default="main")
    status: Mapped[IngestionStatus] = mapped_column(
        SQLEnum(IngestionStatus), default=IngestionStatus.PENDING, index=True
    )
    status_message: Mapped[str] = mapped_column(String(512), default="Repository queued for ingestion")
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0)
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0)
    error_log: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    files = relationship("SourceFile", back_populates="repository", cascade="all, delete-orphan")
    chunks = relationship("CodeChunk", back_populates="repository", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="repository", cascade="all, delete-orphan")


class SourceFile(Base):
    __tablename__ = "source_files"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    repo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    language: Mapped[str] = mapped_column(String(50), default="text")
    line_count: Mapped[int] = mapped_column(Integer, default=0)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    repository = relationship("Repository", back_populates="files")
    chunks = relationship("CodeChunk", back_populates="file", cascade="all, delete-orphan")
