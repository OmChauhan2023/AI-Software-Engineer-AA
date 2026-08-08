import pytest
from backend.parsers.python_parser import PythonASTParser
from backend.parsers.javascript_parser import JavaScriptASTParser
from backend.parsers.fallback_chunker import SlidingWindowChunker
from backend.models.chunk import ChunkType


def test_python_ast_parser_functions():
    code = '''
def calculate_tax(income: float, rate: float = 0.2) -> float:
    """Calculates total tax based on income rate."""
    return income * rate

class AccountManager:
    def __init__(self, name: str):
        self.name = name

    def get_balance(self) -> float:
        return 1000.0
'''
    parser = PythonASTParser()
    chunks = parser.parse_code(code, "accounting.py")
    
    assert len(chunks) >= 2
    symbols = [c.symbol_name for c in chunks]
    assert "calculate_tax" in symbols
    assert "AccountManager" in symbols
    
    tax_chunk = next(c for c in chunks if c.symbol_name == "calculate_tax")
    assert tax_chunk.start_line == 2
    assert tax_chunk.chunk_type == ChunkType.FUNCTION
    assert "Calculates total tax" in (tax_chunk.docstring or "")


def test_javascript_ast_parser():
    code = '''
export function authenticateUser(token) {
    if (!token) throw new Error("No token");
    return { user: "verified" };
}

const verifySession = async (sessionId) => {
    return true;
};
'''
    parser = JavaScriptASTParser(is_typescript=False)
    chunks = parser.parse_code(code, "auth.js")
    
    assert len(chunks) >= 1
    symbols = [c.symbol_name for c in chunks]
    assert "authenticateUser" in symbols or "verifySession" in symbols


def test_sliding_window_fallback():
    lines = [f"config_line_{i} = value_{i}" for i in range(1, 120)]
    content = "\n".join(lines)
    
    chunker = SlidingWindowChunker(window_size=50, overlap=10)
    chunks = chunker.parse_code(content, "settings.env")
    
    assert len(chunks) >= 2
    assert chunks[0].start_line == 1
    assert chunks[0].end_line == 50
    assert chunks[1].start_line == 41  # 50 - 10 + 1 = 41
