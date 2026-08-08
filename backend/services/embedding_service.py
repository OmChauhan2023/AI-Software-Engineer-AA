import logging
from typing import List
from google import genai
from google.genai import types
from backend.config import settings

logger = logging.getLogger(__name__)


class GeminiEmbeddingService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = settings.GEMINI_EMBEDDING_MODEL
        self._client = None

    @property
    def client(self):
        if self._client is None and self.api_key:
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    async def get_embedding(self, text: str) -> List[float]:
        """
        Generates 768-dimensional embedding for a single text using text-embedding-004.
        """
        if not self.client:
            logger.warning("Gemini API key not configured, returning mock vector for testing")
            return [0.0] * settings.EMBEDDING_DIM

        try:
            response = self.client.models.embed_content(
                model=self.model,
                contents=text,
                config=types.EmbedContentConfig(
                    output_dimensionality=settings.EMBEDDING_DIM
                )
            )
            return response.embedding.values
        except Exception as e:
            logger.error(f"Error generating Gemini embedding: {e}")
            return [0.0] * settings.EMBEDDING_DIM

    async def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generates embeddings in batches for efficient network throughput.
        """
        if not texts:
            return []

        if not self.client:
            return [[0.0] * settings.EMBEDDING_DIM for _ in texts]

        results = []
        batch_size = 20
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            try:
                # Use batch embedding
                response = self.client.models.embed_content(
                    model=self.model,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        output_dimensionality=settings.EMBEDDING_DIM
                    )
                )
                if hasattr(response, "embeddings"):
                    for emb in response.embeddings:
                        results.append(emb.values)
                else:
                    results.append(response.embedding.values)
            except Exception as e:
                logger.error(f"Batch embedding error on batch {i}: {e}")
                for _ in batch:
                    results.append([0.0] * settings.EMBEDDING_DIM)

        return results


embedding_service = GeminiEmbeddingService()
