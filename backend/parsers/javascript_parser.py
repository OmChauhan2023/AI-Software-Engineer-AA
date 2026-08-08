import logging
from typing import List
import tree_sitter_languages
from backend.parsers.base import BaseLanguageParser, ParsedChunk
from backend.models.chunk import ChunkType

logger = logging.getLogger(__name__)


class JavaScriptASTParser(BaseLanguageParser):
    def __init__(self, is_typescript: bool = False):
        lang = "typescript" if is_typescript else "javascript"
        super().__init__(language=lang)
        self.is_typescript = is_typescript
        try:
            self.parser = tree_sitter_languages.get_parser(lang)
        except Exception as e:
            logger.warning(f"Failed to load tree-sitter {lang} parser: {e}")
            self.parser = None

    def parse_code(self, content: str, file_path: str) -> List[ParsedChunk]:
        if not content.strip():
            return []

        lines = self.get_lines(content)
        total_lines = len(lines)

        if not self.parser:
            return [
                ParsedChunk(
                    symbol_name=file_path.split("/")[-1],
                    chunk_type=ChunkType.BLOCK,
                    start_line=1,
                    end_line=total_lines,
                    content=content,
                    language=self.language
                )
            ]

        try:
            tree = self.parser.parse(bytes(content, "utf8"))
            chunks: List[ParsedChunk] = []

            def extract_nodes(node):
                if node.type in ("function_declaration", "function_signature", "method_definition"):
                    name_node = node.child_by_field_name("name")
                    symbol_name = name_node.text.decode("utf8") if name_node else "anonymous"
                    
                    start_line = node.start_point[0] + 1
                    end_line = node.end_point[0] + 1
                    node_content = self.extract_line_range(lines, start_line, end_line)
                    signature = lines[start_line - 1].strip() if start_line <= len(lines) else None

                    chunks.append(
                        ParsedChunk(
                            symbol_name=symbol_name,
                            chunk_type=ChunkType.FUNCTION if node.type != "method_definition" else ChunkType.METHOD,
                            start_line=start_line,
                            end_line=end_line,
                            content=node_content,
                            signature=signature,
                            language=self.language
                        )
                    )
                    return

                elif node.type in ("class_declaration", "interface_declaration", "class"):
                    name_node = node.child_by_field_name("name")
                    symbol_name = name_node.text.decode("utf8") if name_node else "anonymous_class"
                    
                    start_line = node.start_point[0] + 1
                    end_line = node.end_point[0] + 1
                    node_content = self.extract_line_range(lines, start_line, end_line)
                    signature = lines[start_line - 1].strip() if start_line <= len(lines) else None

                    chunks.append(
                        ParsedChunk(
                            symbol_name=symbol_name,
                            chunk_type=ChunkType.CLASS,
                            start_line=start_line,
                            end_line=end_line,
                            content=node_content,
                            signature=signature,
                            language=self.language
                        )
                    )
                    for child in node.children:
                        extract_nodes(child)
                    return

                elif node.type == "lexical_declaration":
                    # Catch const myFunc = () => { ... }
                    for declarator in node.children:
                        if declarator.type == "variable_declarator":
                            val = declarator.child_by_field_name("value")
                            if val and val.type in ("arrow_function", "function_expression"):
                                name_node = declarator.child_by_field_name("name")
                                symbol_name = name_node.text.decode("utf8") if name_node else "anonymous"
                                
                                start_line = node.start_point[0] + 1
                                end_line = node.end_point[0] + 1
                                node_content = self.extract_line_range(lines, start_line, end_line)
                                signature = lines[start_line - 1].strip() if start_line <= len(lines) else None

                                chunks.append(
                                    ParsedChunk(
                                        symbol_name=symbol_name,
                                        chunk_type=ChunkType.FUNCTION,
                                        start_line=start_line,
                                        end_line=end_line,
                                        content=node_content,
                                        signature=signature,
                                        language=self.language
                                    )
                                )
                                return

                for child in node.children:
                    extract_nodes(child)

            extract_nodes(tree.root_node)

            if not chunks and total_lines > 0:
                chunks.append(
                    ParsedChunk(
                        symbol_name=file_path.split("/")[-1],
                        chunk_type=ChunkType.BLOCK,
                        start_line=1,
                        end_line=total_lines,
                        content=content,
                        language=self.language
                    )
                )

            return chunks

        except Exception as e:
            logger.error(f"Error parsing JS/TS AST for {file_path}: {e}")
            return [
                ParsedChunk(
                    symbol_name=file_path.split("/")[-1],
                    chunk_type=ChunkType.BLOCK,
                    start_line=1,
                    end_line=total_lines,
                    content=content,
                    language=self.language
                )
            ]
