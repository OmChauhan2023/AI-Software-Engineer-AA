# AI Repository Assistant

An AI-powered RAG code assistant built with **FastAPI, PostgreSQL, Qdrant, Google Gemini API, Tree-sitter, Redis, Docker, and Next.js 15 (Monaco Editor)**.

---

## Highlights & Features

- **Tree-sitter AST Parsing**: Extracts functions, classes, and methods with accurate line-offset mappings across Python, JavaScript, TypeScript, Go, Java, Rust, and C++.
- **Grounded Gemini Flash RAG**: Streams responses using Server-Sent Events (SSE) grounded directly in codebase chunks with verified citations `[filepath:start_line-end_line]`.
- **Monaco Code Viewer**: Split-pane workspace with two-way citation linking — clicking any citation in chat immediately loads the file and highlights the exact cited lines.
- **Dedicated Vector DB (Qdrant)**: High-speed cosine vector similarity search filtered by repository and language.
- **Asynchronous Ingestion Pipeline**: Git shallow cloner, AST chunker, and batch Gemini `text-embedding-004` generator backed by Redis and PostgreSQL.

---

## Quick Start (Docker)

1. Clone the repository and configure your Gemini API Key:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY
   ```

2. Run the entire multi-service stack:
   ```bash
   docker compose up --build
   ```

3. Open the web interface:
   - Frontend: `http://localhost:3000`
   - FastAPI Backend Swagger Docs: `http://localhost:8000/docs`
   - Qdrant Vector Console: `http://localhost:6333/dashboard`

---

## Architecture

```
AI Repository Assistant
├── frontend/ (Next.js 15, Monaco Editor, Tailwind CSS, shadcn/ui)
├── backend/
│   ├── parsers/ (Tree-sitter AST parsers for Python, JS/TS, Go, Java, Rust)
│   ├── services/ (Gemini Flash Chat, Gemini Embeddings, Ingestion, Qdrant)
│   ├── models/ (SQLAlchemy models: Repositories, Files, Chunks, Messages, Citations)
│   ├── routers/ (REST & SSE endpoints for repos, files, and chat)
│   └── workers/ (Redis task queue & progress pub/sub)
└── docker-compose.yml (PostgreSQL, Qdrant, Redis, FastAPI, Next.js)
```
