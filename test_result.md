## RepoChat — AI Repository Assistant (V1)

Full-stack Next.js + MongoDB app. Import a public GitHub repo → clone → chunk → embed (local MiniLM, 384-dim) → store vectors in MongoDB → RAG chat via Emergent LLM (gpt-4o-mini, streaming) with citations to real file:line.

### Key integrations
- Emergent Universal LLM key (`emergentintegrations` npm) for chat + streaming.
- Local embeddings via `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2).
- Vector search: in-memory cosine over MongoDB-stored embeddings (local Mongo, no Atlas $vectorSearch).

---

## Backend endpoints (all under /api)
- POST /api/auth/login {username}
- GET  /api/repos?userId=
- POST /api/repos {github_url, userId}  (fire-and-forget ingestion)
- GET  /api/repos/:id/status
- GET  /api/repos/:id  |  DELETE /api/repos/:id
- POST /api/repos/:id/reindex
- GET  /api/repos/:id/tree
- GET  /api/repos/:id/file?path=
- POST /api/repos/:id/chat {message, sessionId?}  -> SSE stream (session, text, citations, done)
- GET  /api/repos/:id/chat/:sessionId  (history)
- GET  /api/repos/:id/sessions

---

## Testing Protocol
- MUST test BACKEND first via `deep_testing_backend_nextjs`.
- After backend testing, STOP and ask the user before testing frontend.
- NEVER invoke frontend testing without explicit user permission.
- Do NOT edit this Testing Protocol section.
- Read this file before every testing invocation; update the results sections below.

---

## backend:
  - task: "Repo ingestion pipeline (clone -> parse -> embed -> ready)"
    implemented: true
    working: true
    file: "/app/lib/ingest.js, /app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke-tested manually with sindresorhus/slugify -> reached ready (8 files, 28 chunks)."
      - working: true
        agent: "testing"
        comment: "✅ PASSED - Tested full ingestion pipeline with sindresorhus/slugify. Status transitions: cloning -> ready. Final state: 8 files, 28 chunks. Also tested error case: nonexistent repo correctly fails with error message 'Could not clone repository. Make sure it is a valid, public GitHub repo.' Status fields verified: status, filesProcessed, totalFiles, chunksEmbedded, chunksTotal, fileCount, chunkCount."

  - task: "RAG chat SSE with citations"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js, /app/lib/retrieve.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Smoke-tested manually: streamed grounded answer with citations."
      - working: true
        agent: "testing"
        comment: "✅ PASSED - Tested SSE chat streaming. New session: returned session event with sessionId, 69 text events (296 chars total), citations event with 6 citations (each with id, path, startLine, endLine, symbolName, language, score), and done event. Existing session: reused same sessionId, streamed 212 text events (745 chars), 6 citations, done event. Chat history verified: 4 messages (2 user + 2 assistant). Content-Type: text/event-stream. Error case: chat on non-ready repo returns 400 'Repository is not ready yet.'"

  - task: "Auth login + repos CRUD + tree/file endpoints"
    implemented: true
    working: true
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented; needs formal testing."
      - working: true
        agent: "testing"
        comment: "✅ PASSED - Auth: Login is idempotent (same username returns same user ID). Repos: POST /api/repos creates repo with id, name, status. GET /api/repos?userId lists repos correctly. DELETE /api/repos/:id deletes repo and returns 404 on subsequent GET. Tree: GET /api/repos/:id/tree returns 8 files with path, language, size. File: GET /api/repos/:id/file?path returns file content (179 chars). Error cases: invalid GitHub URL returns 400 with error message, nonexistent repo ID returns 404."

## frontend:
  - task: "Login, repo list, import+progress, chat workspace with Monaco, citations, search, demo repos"
    implemented: true
    working: true
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Built full UI. Fixed a client-side crash (lucide-react removed the Github brand icon -> aliased to GitBranch). Added inline clickable [n] citations, repo search filter, and one-click demo repos. Needs UI testing."
      - working: true
        agent: "testing"
        comment: "✅ PASSED - Comprehensive E2E testing completed successfully. NO client-side exception detected (Github icon fix working). All flows tested: (1) Login: renders correctly with 'repochat' heading, username input placeholder 'your-username', 'Continue with GitHub' button. (2) Repo list: demo chips visible (slugify, requests, gorilla/mux). (3) Import: progress stepper works (Cloning → Parsing → Embedding → Ready in 4s), 'Open chat' button appears. (4) Chat workspace: two-pane layout with repo name 'sindresorhus/slugify', Ready badge, starter questions, file tree visible. (5) Ask question: assistant responds with streaming, 6 citation chips found (e.g., [1]package.json:1-55, [2].github/security.md:1-4). (6) Click citation: Monaco editor opens with package.json, lines 1-55 highlighted in blue. (7) New chat: resets to starter questions. (8) Back navigation: returns to repo list. (9) Repo search: filter works correctly ('slug' shows repos, 'zzz' hides them). Minor: 3 React console warnings about nested buttons (non-critical, app functions correctly)."

## metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: true

## test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

## agent_communication:
  - agent: "main"
    message: "Please test the backend end-to-end. Use a SMALL public repo for ingestion, e.g. https://github.com/sindresorhus/slugify (fast) or https://github.com/sindresorhus/is-plain-obj. Flow: (1) POST /api/auth/login {username}; (2) POST /api/repos {github_url, userId}; (3) poll GET /api/repos/:id/status until status=ready (allow up to ~120s; statuses go cloning->parsing->embedding->ready); (4) GET /api/repos/:id/tree returns files; (5) GET /api/repos/:id/file?path=<a path from tree>; (6) POST /api/repos/:id/chat {message} returns an SSE stream — verify events of type 'session','text','citations','done' and that citations contain path/startLine/endLine. Also test error cases: invalid github url (expect 400), private/nonexistent repo (should end in status=failed with a readable error, NOT hang), and chat on a non-ready repo (expect 400). Note: ingestion is a fire-and-forget background job in the Next dev server."
  - agent: "testing"
    message: "✅ ALL BACKEND TESTS PASSED (15/15). Comprehensive end-to-end testing completed successfully. Happy path: Auth (idempotent login), Repo creation (sindresorhus/slugify), Ingestion pipeline (cloning -> ready, 8 files, 28 chunks), List repos, Get tree (8 files), Get file content, Chat SSE (new session: 296 chars, 6 citations), Chat SSE (existing session: 745 chars, same sessionId), Chat history (4 messages). Error cases: Invalid URL (400), Nonexistent repo (failed status with error), Chat on non-ready repo (400), GET nonexistent repo (404), DELETE repo (200 + verified 404). All endpoints working correctly with proper status codes, response structures, and error handling. Backend is production-ready."
  - agent: "testing"
    message: "✅ ALL FRONTEND TESTS PASSED (13/13). Comprehensive E2E UI testing completed successfully. NO client-side exception detected - the lucide-react Github icon fix (aliased to GitBranch) is working perfectly. All flows verified: Login screen (repochat heading, username input, Continue with GitHub button), Repo list (demo chips: slugify/requests/gorilla/mux visible), Import flow (progress stepper: Cloning → Parsing → Embedding → Ready in 4s), Chat workspace (two-pane layout, repo name, Ready badge, starter questions, file tree), Ask question (streaming response, 6 citation chips like [1]package.json:1-55), Click citation (Monaco editor opens with highlighted lines 1-55 in blue), New chat (resets to starters), Back navigation (returns to repo list), Repo search filter (works correctly). Minor: 3 React console warnings about nested buttons (non-critical, app functions correctly). Frontend is production-ready."
