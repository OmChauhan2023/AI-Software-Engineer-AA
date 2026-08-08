import uuid
import logging
from sqlalchemy import select, update
from backend.db.database import AsyncSessionLocal
from backend.models.repository import Repository, SourceFile, IngestionStatus
from backend.models.chunk import CodeChunk
from backend.services.git_cloner import git_cloner
from backend.parsers.dispatcher import dispatcher
from backend.services.embedding_service import embedding_service
from backend.services.vector_db import qdrant_service
from backend.workers.task_queue import task_queue

logger = logging.getLogger(__name__)


class IngestionPipelineService:
    async def process_repository(self, repo_id: str):
        """
        Full end-to-end ingestion pipeline:
        Clone -> AST Parse -> DB Save -> Gemini Embed -> Qdrant Upsert -> Ready.
        """
        logger.info(f"Starting ingestion pipeline for repository: {repo_id}")
        
        async with AsyncSessionLocal() as session:
            # 1. Fetch repository record
            result = await session.execute(
                select(Repository).where(Repository.id == uuid.UUID(repo_id))
            )
            repo = result.scalars().first()
            if not repo:
                logger.error(f"Repository {repo_id} not found in database")
                return

            try:
                # Step 1: Update status to CLONING (15%)
                repo.status = IngestionStatus.CLONING
                repo.status_message = "Cloning repository from GitHub..."
                repo.progress_percentage = 15
                await session.commit()
                await task_queue.publish_progress(repo_id, "cloning", 15, "Cloning repository...")

                clone_dir, default_branch = git_cloner.clone_repository(repo.github_url, repo_id)
                repo.default_branch = default_branch

                # Step 2: Update status to PARSING (35%)
                repo.status = IngestionStatus.PARSING
                repo.status_message = "Scanning and AST parsing source code..."
                repo.progress_percentage = 35
                await session.commit()
                await task_queue.publish_progress(repo_id, "parsing", 35, "AST parsing code with Tree-sitter...")

                files_data = git_cloner.walk_and_sanitize_files(clone_dir)
                repo.total_files = len(files_data)

                # Initialize Qdrant collection if not yet created
                await qdrant_service.init_collection()

                all_chunks_to_embed = []
                qdrant_points = []

                # Parse files and create DB chunks
                for file_info in files_data:
                    rel_path = file_info["file_path"]
                    content = file_info["content"]
                    lang = dispatcher.get_language_from_path(rel_path)

                    source_file = SourceFile(
                        repo_id=repo.id,
                        file_path=rel_path,
                        language=lang,
                        line_count=file_info["line_count"],
                        size_bytes=file_info["size_bytes"],
                        content=content
                    )
                    session.add(source_file)
                    await session.flush()

                    # AST Chunking via Tree-sitter
                    parsed_chunks = dispatcher.parse(content, rel_path)
                    
                    for pc in parsed_chunks:
                        point_id = str(uuid.uuid4())
                        db_chunk = CodeChunk(
                            repo_id=repo.id,
                            file_id=source_file.id,
                            qdrant_point_id=point_id,
                            file_path=rel_path,
                            chunk_type=pc.chunk_type,
                            symbol_name=pc.symbol_name,
                            start_line=pc.start_line,
                            end_line=pc.end_line,
                            content=pc.content,
                            signature=pc.signature,
                            docstring=pc.docstring,
                            token_count=len(pc.content.split())
                        )
                        session.add(db_chunk)

                        all_chunks_to_embed.append({
                            "id": point_id,
                            "content": pc.content,
                            "payload": {
                                "repo_id": repo_id,
                                "file_path": rel_path,
                                "language": lang,
                                "chunk_type": pc.chunk_type.value,
                                "symbol_name": pc.symbol_name or "",
                                "start_line": pc.start_line,
                                "end_line": pc.end_line,
                                "signature": pc.signature or "",
                                "content": pc.content
                            }
                        })

                repo.total_chunks = len(all_chunks_to_embed)
                await session.commit()

                # Step 3: Update status to EMBEDDING (70%)
                repo.status = IngestionStatus.EMBEDDING
                repo.status_message = f"Generating Gemini embeddings for {repo.total_chunks} code chunks..."
                repo.progress_percentage = 70
                await session.commit()
                await task_queue.publish_progress(repo_id, "embedding", 70, f"Embedding {repo.total_chunks} chunks with Gemini...")

                # Generate embeddings in batches
                texts_to_embed = [c["content"] for c in all_chunks_to_embed]
                embeddings = await embedding_service.get_batch_embeddings(texts_to_embed)

                for chunk_item, emb_vector in zip(all_chunks_to_embed, embeddings):
                    qdrant_points.append({
                        "id": chunk_item["id"],
                        "vector": emb_vector,
                        "payload": chunk_item["payload"]
                    })

                # Step 4: Upsert to Qdrant
                if qdrant_points:
                    await qdrant_service.upsert_chunks(qdrant_points)

                # Step 5: Mark READY (100%)
                repo.status = IngestionStatus.READY
                repo.status_message = "Repository successfully ingested and ready for grounded chat."
                repo.progress_percentage = 100
                await session.commit()
                await task_queue.publish_progress(
                    repo_id, "ready", 100, "Repository ready for chat",
                    extra={"total_files": repo.total_files, "total_chunks": repo.total_chunks}
                )

                logger.info(f"Repository {repo_id} successfully ingested: {repo.total_files} files, {repo.total_chunks} chunks.")

            except Exception as e:
                logger.error(f"Ingestion failed for repository {repo_id}: {e}", exc_info=True)
                repo.status = IngestionStatus.FAILED
                repo.status_message = f"Ingestion error: {str(e)}"
                repo.error_log = str(e)
                await session.commit()
                await task_queue.publish_progress(repo_id, "failed", 0, str(e))

            finally:
                # Cleanup local shallow clone directory to save disk space
                git_cloner.cleanup_clone(repo_id)


ingestion_pipeline = IngestionPipelineService()
