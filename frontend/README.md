# AI Document Q&A Assistant — Frontend

React + Vite + Tailwind CSS frontend for the AI Document Q&A Assistant.

## Setup & Run (Windows PowerShell)

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

The application will open at `http://localhost:5173`.

## Application Routes

- `/login` — Sign in with email and password
- `/register` — Register a new account
- `/dashboard` — Upload documents, search/filter documents, view status, open chat, or delete documents
- `/documents/:id` — View full document metadata and conversation history
- `/chat/:conversationId` — Interactive RAG chat with source references (filename, page number, chunk index, relevance score)
