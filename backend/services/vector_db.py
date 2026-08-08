import logging
from typing import List, Dict, Any, Optional
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models
from backend.config import settings

logger = logging.getLogger(__name__)


class QdrantService:
    def __init__(self):
        self.client: Optional[AsyncQdrantClient] = None
        self.collection_name = settings.QDRANT_COLLECTION

    async def get_client(self) -> AsyncQdrantClient:
        if self.client is None:
            if settings.QDRANT_API_KEY:
                self.client = AsyncQdrantClient(
                    url=settings.QDRANT_URL,
                    api_key=settings.QDRANT_API_KEY,
                )
            else:
                self.client = AsyncQdrantClient(url=settings.QDRANT_URL)
        return self.client

    async def init_collection(self):
        client = await self.get_client()
        collections_response = await client.get_collections()
        existing_names = [c.name for c in collections_response.collections]

        if self.collection_name not in existing_names:
            logger.info(f"Creating Qdrant collection: {self.collection_name}")
            await client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=settings.EMBEDDING_DIM,
                    distance=models.Distance.COSINE
                )
            )
            # Create payload index for ultra-fast filtering by repo_id
            await client.create_payload_index(
                collection_name=self.collection_name,
                field_name="repo_id",
                field_schema=models.PayloadSchemaType.KEYWORD
            )
            await client.create_payload_index(
                collection_name=self.collection_name,
                field_name="language",
                field_schema=models.PayloadSchemaType.KEYWORD
            )
            logger.info(f"Qdrant collection {self.collection_name} created with indexes.")

    async def upsert_chunks(
        self,
        points: List[Dict[str, Any]]
    ) -> bool:
        client = await self.get_client()
        qdrant_points = [
            models.PointStruct(
                id=p["id"],
                vector=p["vector"],
                payload=p["payload"]
            )
            for p in points
        ]
        
        # Batch in chunks of 100 for network efficiency
        batch_size = 100
        for i in range(0, len(qdrant_points), batch_size):
            batch = qdrant_points[i:i + batch_size]
            await client.upsert(
                collection_name=self.collection_name,
                points=batch
            )
        return True

    async def search(
        self,
        repo_id: str,
        query_vector: List[float],
        limit: int = 8,
        score_threshold: float = 0.35
    ) -> List[Dict[str, Any]]:
        client = await self.get_client()
        
        search_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="repo_id",
                    match=models.MatchValue(value=str(repo_id))
                )
            ]
        )

        results = await client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            query_filter=search_filter,
            limit=limit,
            score_threshold=score_threshold
        )

        return [
            {
                "id": str(r.id),
                "score": r.score,
                "payload": r.payload
            }
            for r in results
        ]

    async def delete_repo_points(self, repo_id: str) -> bool:
        client = await self.get_client()
        await client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="repo_id",
                            match=models.MatchValue(value=str(repo_id))
                        )
                    ]
                )
            )
        )
        return True


qdrant_service = QdrantService()
