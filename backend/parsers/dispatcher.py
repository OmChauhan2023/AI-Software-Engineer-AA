import os
from typing import List
from backend.parsers.base import ParsedChunk
from backend.parsers.python_parser import PythonASTParser
from backend.parsers.javascript_parser import JavaScriptASTParser
from backend.parsers.polyglot_parser import PolyglotASTParser
from backend.parsers.fallback_chunker import SlidingWindowChunker


class ParserDispatcher:
    def __init__(self):
        self.python_parser = PythonASTParser()
        self.js_parser = JavaScriptASTParser(is_typescript=False)
        self.ts_parser = JavaScriptASTParser(is_typescript=True)
        self.go_parser = PolyglotASTParser("go")
        self.java_parser = PolyglotASTParser("java")
        self.rust_parser = PolyglotASTParser("rust")
        self.cpp_parser = PolyglotASTParser("cpp")
        self.fallback_chunker = SlidingWindowChunker()

    def get_language_from_path(self, file_path: str) -> str:
        ext = os.path.splitext(file_path)[1].lower()
        mapping = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".go": "go",
            ".java": "java",
            ".rs": "rust",
            ".cpp": "cpp",
            ".cc": "cpp",
            ".cxx": "cpp",
            ".c": "c",
            ".h": "c",
            ".hpp": "cpp",
            ".md": "markdown",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".toml": "toml",
            ".sql": "sql",
            ".sh": "bash",
            ".dockerfile": "dockerfile"
        }
        return mapping.get(ext, "text")

    def parse(self, content: str, file_path: str) -> List[ParsedChunk]:
        lang = self.get_language_from_path(file_path)

        if lang == "python":
            return self.python_parser.parse_code(content, file_path)
        elif lang == "javascript":
            return self.js_parser.parse_code(content, file_path)
        elif lang == "typescript":
            return self.ts_parser.parse_code(content, file_path)
        elif lang == "go":
            return self.go_parser.parse_code(content, file_path)
        elif lang == "java":
            return self.java_parser.parse_code(content, file_path)
        elif lang == "rust":
            return self.rust_parser.parse_code(content, file_path)
        elif lang in ("cpp", "c"):
            return self.cpp_parser.parse_code(content, file_path)
        else:
            return self.fallback_chunker.parse_code(content, file_path)


dispatcher = ParserDispatcher()
