import logging
from typing import List
import tree_sitter_languages
from backend.parsers.base import BaseLanguageParser, ParsedChunk
from backend.models.chunk import ChunkType

logger = logging.getLogger(__name__)


class PolyglotASTParser(BaseLanguageParser):
    def __init__(self, language: str):
        super().__init__(language=language)
        try:
            self.parser = tree_sitter_languages.get_parser(language)
        except Exception as e:
            logger.warning(f"Could not load tree-sitter for language {language}: {e}")
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

            # Mapping of typical function & class AST node names across Go, Java, C++, Rust
            target_function_types = {
                "function_declaration", "method_declaration", "function_item",
                "method_definition", "function_definition", "method"
            }
            target_class_types = {
                "class_declaration", "struct_specifier", "struct_item",
                "type_declaration", "interface_declaration", "class_specifier"
            }

            def extract_nodes(node):
                if node.type in target_function_types:
                    name_node = node.child_by_field_name("name")
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

                elif node.type in target_class_types:
                    name_node = node.child_by_field_name("name")
                    symbol_name = name_node.text.decode("utf8") if name_node else "anonymous_struct"
                    
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
            logger.error(f"Error parsing {self.language} AST for {file_path}: {e}")
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
