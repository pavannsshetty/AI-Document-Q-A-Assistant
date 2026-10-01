# AI Document Q&A Assistant — Backend

Node.js + Express REST API for authentication, document text extraction (PDF, DOCX, TXT), overlapping text chunking, local Ollama embedding generation, Qdrant vector storage/retrieval, and RAG question answering.

## Setup & Run (Windows PowerShell)

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

## Run Unit & Pipeline Tests

```powershell
cd backend
npm test
```

## API Endpoints

- `POST /api/auth/register` — Register a new user account
- `POST /api/auth/login` — Authenticate and receive a JWT
- `GET /api/auth/me` — Get current authenticated user profile
- `POST /api/documents/upload` — Upload and index a PDF, DOCX, or TXT document (max 20 MB)
- `GET /api/documents` — List authenticated user's documents
- `GET /api/documents/:id` — Get document metadata and conversations
- `DELETE /api/documents/:id` — Delete document, Qdrant vectors, and conversations
- `POST /api/chat` — Ask a question against a document using RAG
- `GET /api/chat/conversations` — List user's conversations
- `POST /api/chat/conversations` — Create a new conversation for a document
- `GET /api/chat/conversations/:conversationId` — Get conversation messages and document info
- `DELETE /api/chat/conversations/:conversationId` — Delete a conversation and its messages
- `GET /api/health` — Check connectivity status for MongoDB, Qdrant, and Ollama
