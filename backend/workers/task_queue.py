import json
import logging
from typing import Optional, Dict, Any
import redis.asyncio as aioredis
from backend.config import settings

logger = logging.getLogger(__name__)


class TaskQueueService:
    def __init__(self):
        self.redis_url = settings.REDIS_URL
        self._redis: Optional[aioredis.Redis] = None

    async def get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
        return self._redis

    async def publish_progress(
        self,
        repo_id: str,
        status: str,
        percentage: int,
        message: str,
        extra: Dict[str, Any] = None
    ):
        """
        Publishes real-time ingestion status over Redis pub/sub channel for frontend SSE.
        """
        try:
            r = await self.get_redis()
            payload = {
                "repo_id": repo_id,
                "status": status,
                "percentage": percentage,
                "message": message,
                "extra": extra or {}
            }
            channel = f"repo_progress:{repo_id}"
            await r.publish(channel, json.dumps(payload))
            await r.set(f"repo_status:{repo_id}", json.dumps(payload), ex=3600)
        except Exception as e:
            logger.warning(f"Redis publish error: {e}")

    async def get_cached_status(self, repo_id: str) -> Optional[Dict[str, Any]]:
        try:
            r = await self.get_redis()
            data = await r.get(f"repo_status:{repo_id}")
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Redis get status error: {e}")
        return None


task_queue = TaskQueueService()
