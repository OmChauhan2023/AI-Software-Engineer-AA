import re
import json
import logging
from typing import List, Dict, Any, AsyncGenerator
from google import genai
from google.genai import types
from backend.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert AI Repository Assistant.
You have access to relevant code chunks retrieved from the repository codebase.
Your goal is to answer developer questions accurately, grounding your explanations directly in the provided code snippets.

CRITICAL CITATION RULES:
1. Whenever referencing a specific function, class, variable, or logic, you MUST cite the exact file and line numbers using this markdown citation format:
   `[filepath:start_line-end_line]` (e.g. `[lib/auth.py:45-82]`).
2. Never hallucinate line numbers or filenames. Only cite the files and line numbers present in the retrieved context.
3. Keep your answers clear, concise, well-structured, and provide code examples where helpful.
"""


class GeminiChatService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = settings.GEMINI_CHAT_MODEL
        self._client = None

    @property
    def client(self):
        if self._client is None and self.api_key:
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def format_context(self, chunks: List[Dict[str, Any]]) -> str:
        if not chunks:
            return "No relevant code chunks found."

        formatted = []
        for i, c in enumerate(chunks):
            payload = c.get("payload", {})
            file_path = payload.get("file_path", "unknown")
            start_line = payload.get("start_line", 1)
            end_line = payload.get("end_line", 1)
            symbol = payload.get("symbol_name", "")
            code = payload.get("content", "")
            signature = payload.get("signature", "")

            header = f"--- [File: {file_path} | Lines: {start_line}-{end_line}"
            if symbol:
                header += f" | Symbol: {symbol}"
            if signature:
                header += f" | Signature: {signature}"
            header += " ---"

            formatted.append(f"{header}\n{code}\n")

        return "\n".join(formatted)

    def extract_citations_from_text(
        self,
        text: str,
        retrieved_chunks: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        # Regex matches [filepath:start_line-end_line]
        pattern = r"\[([a-zA-Z0-9_\-\./]+):(\d+)-(\d+)\]"
        matches = re.findall(pattern, text)
        citations = []

        chunk_lookup = {
            f"{c.get('payload', {}).get('file_path')}:{c.get('payload', {}).get('start_line')}-{c.get('payload', {}).get('end_line')}": c
            for c in retrieved_chunks
        }

        for file_path, start_line, end_line in matches:
            key = f"{file_path}:{start_line}-{end_line}"
            chunk_data = chunk_lookup.get(key)
            snippet = ""
            if chunk_data:
                snippet = chunk_data.get("payload", {}).get("content", "")[:200]

            citations.append({
                "file_path": file_path,
                "start_line": int(start_line),
                "end_line": int(end_line),
                "snippet": snippet
            })

        return citations

    async def stream_chat_response(
        self,
        query: str,
        retrieved_chunks: List[Dict[str, Any]],
        chat_history: List[Dict[str, str]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        context_str = self.format_context(retrieved_chunks)
        user_prompt = f"""Context from repository codebase:
{context_str}

User Question: {query}
"""

        # Yield initial citation metadata so UI can render citation badges immediately
        initial_citations = [
            {
                "file_path": c.get("payload", {}).get("file_path"),
                "start_line": c.get("payload", {}).get("start_line"),
                "end_line": c.get("payload", {}).get("end_line"),
                "symbol_name": c.get("payload", {}).get("symbol_name"),
                "snippet": c.get("payload", {}).get("content", "")[:200]
            }
            for c in retrieved_chunks
        ]
        yield {
            "type": "citations_ready",
            "citations": initial_citations
        }

        if not self.client:
            mock_resp = f"Gemini API key not configured. Retrieved {len(retrieved_chunks)} relevant code chunks from repository context."
            for word in mock_resp.split(" "):
                yield {"type": "token", "text": word + " "}
            return

        try:
            response = self.client.models.generate_content_stream(
                model=self.model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.2,
                )
            )

            full_text = ""
            for chunk in response:
                if chunk.text:
                    full_text += chunk.text
                    yield {
                        "type": "token",
                        "text": chunk.text
                    }

            # Final payload with extracted citations
            extracted = self.extract_citations_from_text(full_text, retrieved_chunks)
            yield {
                "type": "done",
                "extracted_citations": extracted
            }

        except Exception as e:
            logger.error(f"Error in Gemini chat stream: {e}")
            yield {
                "type": "error",
                "message": str(e)
            }


chat_service = GeminiChatService()
