import logging
from typing import List, Optional
import tree_sitter_languages
from backend.parsers.base import BaseLanguageParser, ParsedChunk
from backend.models.chunk import ChunkType

logger = logging.getLogger(__name__)


class PythonASTParser(BaseLanguageParser):
    def __init__(self):
        super().__init__(language="python")
        try:
            self.parser = tree_sitter_languages.get_parser("python")
        except Exception as e:
            logger.warning(f"Failed to load tree-sitter python parser: {e}")
            self.parser = None

    def parse_code(self, content: str, file_path: str) -> List[ParsedChunk]:
        if not content.strip():
            return []

        lines = self.get_lines(content)
        total_lines = len(lines)

        if not self.parser:
            # Fallback to single block if tree-sitter grammar isn't compiled
            return [
                ParsedChunk(
                    symbol_name=file_path.split("/")[-1],
                    chunk_type=ChunkType.BLOCK,
                    start_line=1,
                    end_line=total_lines,
                    content=content,
                    language="python"
                )
            ]

        try:
            tree = self.parser.parse(bytes(content, "utf8"))
            chunks: List[ParsedChunk] = []
            
            def extract_nodes(node):
                if node.type in ("function_definition", "async_function_definition"):
                    name_node = node.child_by_field_name("name")
                    symbol_name = name_node.text.decode("utf8") if name_node else "anonymous"
                    
                    start_line = node.start_point[0] + 1
                    end_line = node.end_point[0] + 1
                    node_content = self.extract_line_range(lines, start_line, end_line)
                    
                    # Extract signature (first line of definition)
                    signature = lines[start_line - 1].strip() if start_line <= len(lines) else None
                    
                    # Extract docstring if present
                    docstring = self._extract_docstring(node)

                    chunks.append(
                        ParsedChunk(
                            symbol_name=symbol_name,
                            chunk_type=ChunkType.FUNCTION,
                            start_line=start_line,
                            end_line=end_line,
                            content=node_content,
                            signature=signature,
                            docstring=docstring,
                            language="python"
                        )
                    )
                    return  # Don't recurse into nested functions immediately to preserve outer unit
                
                elif node.type == "class_definition":
                    name_node = node.child_by_field_name("name")
                    symbol_name = name_node.text.decode("utf8") if name_node else "anonymous_class"
                    
                    start_line = node.start_point[0] + 1
                    end_line = node.end_point[0] + 1
                    node_content = self.extract_line_range(lines, start_line, end_line)
                    signature = lines[start_line - 1].strip() if start_line <= len(lines) else None
                    docstring = self._extract_docstring(node)

                    chunks.append(
                        ParsedChunk(
                            symbol_name=symbol_name,
                            chunk_type=ChunkType.CLASS,
                            start_line=start_line,
                            end_line=end_line,
                            content=node_content,
                            signature=signature,
                            docstring=docstring,
                            language="python"
                        )
                    )
                    # We can also parse individual methods inside the class for high-precision retrieval
                    for child in node.children:
                        extract_nodes(child)
                    return

                for child in node.children:
                    extract_nodes(child)

            extract_nodes(tree.root_node)

            # If no functions or classes were found (e.g., flat script), treat as single chunk
            if not chunks and total_lines > 0:
                chunks.append(
                    ParsedChunk(
                        symbol_name=file_path.split("/")[-1],
                        chunk_type=ChunkType.BLOCK,
                        start_line=1,
                        end_line=total_lines,
                        content=content,
                        language="python"
                    )
                )

            return chunks

        except Exception as e:
            logger.error(f"Error parsing python AST for {file_path}: {e}")
            return [
                ParsedChunk(
                    symbol_name=file_path.split("/")[-1],
                    chunk_type=ChunkType.BLOCK,
                    start_line=1,
                    end_line=total_lines,
                    content=content,
                    language="python"
                )
            ]

    def _extract_docstring(self, node) -> Optional[str]:
        body_node = node.child_by_field_name("body")
        if body_node and body_node.children:
            first_expr = body_node.children[0]
            if first_expr.type == "expression_statement":
                string_node = first_expr.children[0] if first_expr.children else None
                if string_node and string_node.type == "string":
                    return string_node.text.decode("utf8").strip("\"' \n")
        return None
