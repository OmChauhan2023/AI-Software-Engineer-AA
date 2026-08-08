from typing import List
from backend.parsers.base import BaseLanguageParser, ParsedChunk
from backend.models.chunk import ChunkType


class SlidingWindowChunker(BaseLanguageParser):
    def __init__(self, window_size: int = 60, overlap: int = 15):
        super().__init__(language="text")
        self.window_size = window_size
        self.overlap = overlap

    def parse_code(self, content: str, file_path: str) -> List[ParsedChunk]:
        if not content.strip():
            return []

        lines = self.get_lines(content)
        total_lines = len(lines)
        
        if total_lines <= self.window_size:
            return [
                ParsedChunk(
                    symbol_name=file_path.split("/")[-1],
                    chunk_type=ChunkType.WINDOW,
                    start_line=1,
                    end_line=total_lines,
                    content=content,
                    language="text"
                )
            ]

        chunks: List[ParsedChunk] = []
        step = max(1, self.window_size - self.overlap)
        
        for start_idx in range(0, total_lines, step):
            end_idx = min(start_idx + self.window_size, total_lines)
            start_line = start_idx + 1
            end_line = end_idx
            chunk_content = "\n".join(lines[start_idx:end_idx])

            chunks.append(
                ParsedChunk(
                    symbol_name=f"{file_path.split('/')[-1]}:{start_line}-{end_line}",
                    chunk_type=ChunkType.WINDOW,
                    start_line=start_line,
                    end_line=end_line,
                    content=chunk_content,
                    language="text"
                )
            )

            if end_idx >= total_lines:
                break

        return chunks
