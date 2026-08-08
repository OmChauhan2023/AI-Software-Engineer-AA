from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel
from backend.models.chunk import ChunkType


class ParsedChunk(BaseModel):
    symbol_name: Optional[str] = None
    chunk_type: ChunkType
    start_line: int
    end_line: int
    content: str
    signature: Optional[str] = None
    docstring: Optional[str] = None
    language: str


class BaseLanguageParser(ABC):
    def __init__(self, language: str):
        self.language = language

    @abstractmethod
    def parse_code(self, content: str, file_path: str) -> List[ParsedChunk]:
        """
        Parses source code into meaningful AST-level chunks (functions, classes, methods).
        """
        pass

    def get_lines(self, content: str) -> List[str]:
        return content.splitlines()

    def extract_line_range(
        self,
        lines: List[str],
        start_line: int,
        end_line: int
    ) -> str:
        return "\n".join(lines[start_line - 1:end_line])
