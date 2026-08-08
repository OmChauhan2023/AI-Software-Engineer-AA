import os
import shutil
import logging
from typing import List, Dict, Any, Tuple
import git
from backend.config import settings

logger = logging.getLogger(__name__)

EXCLUDED_DIRS = {
    ".git", "node_modules", "venv", ".venv", "__pycache__", ".next",
    "dist", "build", ".idea", ".vscode", "target", "vendor"
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".pdf", ".zip",
    ".tar", ".gz", ".7z", ".rar", ".exe", ".dll", ".so", ".dylib",
    ".bin", ".pyc", ".pyd", ".db", ".sqlite", ".sqlite3", ".parquet",
    ".pkl", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".wav"
}


class GitClonerService:
    def __init__(self):
        self.storage_dir = settings.CLONE_STORAGE_DIR
        os.makedirs(self.storage_dir, exist_ok=True)

    def clone_repository(self, github_url: str, repo_id: str) -> Tuple[str, str]:
        """
        Performs shallow clone (--depth 1) into isolated storage directory.
        Returns: (clone_path, default_branch)
        """
        dest_dir = os.path.join(self.storage_dir, repo_id)
        if os.path.exists(dest_dir):
            shutil.rmtree(dest_dir, ignore_errors=True)

        logger.info(f"Cloning {github_url} into {dest_dir} (shallow clone)")
        repo = git.Repo.clone_from(
            url=github_url,
            to_path=dest_dir,
            depth=1,
            single_branch=True
        )

        default_branch = repo.active_branch.name if repo.active_branch else "main"
        return dest_dir, default_branch

    def walk_and_sanitize_files(self, repo_dir: str) -> List[Dict[str, Any]]:
        """
        Recursively scans repository files, excluding binaries and heavy folders.
        Returns metadata and contents.
        """
        collected_files = []

        for root, dirs, files in os.walk(repo_dir):
            # Prune excluded directories in-place
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]

            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in BINARY_EXTENSIONS:
                    continue

                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, repo_dir).replace("\\", "/")

                try:
                    file_size = os.path.getsize(abs_path)
                    if file_size > settings.MAX_FILE_SIZE_BYTES:
                        continue

                    with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()

                    # Ignore empty files
                    if not content.strip():
                        continue

                    lines = content.splitlines()
                    collected_files.append({
                        "file_path": rel_path,
                        "size_bytes": file_size,
                        "line_count": len(lines),
                        "content": content
                    })

                    if len(collected_files) >= settings.MAX_REPO_FILES:
                        logger.warning(f"Reached maximum file limit ({settings.MAX_REPO_FILES})")
                        break

                except Exception as e:
                    logger.warning(f"Skipping unreadable file {rel_path}: {e}")

        return collected_files

    def cleanup_clone(self, repo_id: str):
        dest_dir = os.path.join(self.storage_dir, repo_id)
        if os.path.exists(dest_dir):
            shutil.rmtree(dest_dir, ignore_errors=True)


git_cloner = GitClonerService()
