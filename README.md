# AI Document Q&A Assistant

A full-stack, local **Retrieval-Augmented Generation (RAG)** web application that allows users to upload **PDF**, **DOCX**, and **TXT** documents and ask natural-language questions answered strictly from their document contents using **Ollama**, **Qdrant**, **MongoDB**, **Express**, and **React**.

- **No OpenAI API**
- **No Gemini API**
- **No paid cloud AI APIs**
- **100% Local AI Pipeline with Ollama + Qdrant**

---

## What is RAG?

**RAG** stands for **Retrieval-Augmented Generation**.

Instead of relying on an AI model's general training memory (which can hallucinate or lack access to your private files), the system first **retrieves** relevant sections from your uploaded documents using vector similarity search, and then **augments** the prompt sent to the local Large Language Model (LLM) so it generates an accurate, source-backed answer.

### Complete RAG Pipeline Flow

```text
Document (PDF / DOCX / TXT)
  ↓
Text Extraction & Cleaning
  ↓
Overlapping Text Chunks (with filename, page, chunkIndex metadata)
  ↓
Ollama Embedding Model (nomic-embed-text)
  ↓
Qdrant Vector Database (Cosine Similarity Collection)
  ↓
User Question
  ↓
Question Embedding via Ollama (nomic-embed-text)
  ↓
Qdrant Semantic Similarity Search (filtered by userId & documentId)
  ↓
Top Relevant Chunks (filtered by similarity threshold & deduplicated)
  ↓
Ollama Local Chat LLM (llama3.2:3b)
  ↓
Grounded Answer + Source References (Filename, Page, Chunk Index, Relevance Score)
```

If no relevant chunks meet the similarity threshold, or if the answer is not present in the retrieved context, the assistant responds with:

> `"I couldn't find this information in the uploaded documents."`

---

## Project Structure

```text
ai-document-qa/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── env.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── chatController.js
│   │   │   ├── documentController.js
│   │   │   └── healthController.js
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js
│   │   │   ├── errorMiddleware.js
│   │   │   ├── uploadMiddleware.js
│   │   │   └── validateMiddleware.js
│   │   ├── models/
│   │   │   ├── Conversation.js
│   │   │   ├── Document.js
│   │   │   ├── Message.js
│   │   │   └── User.js
│   │   ├── prompts/
│   │   │   └── ragPrompt.js
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── chatRoutes.js
│   │   │   ├── documentRoutes.js
│   │   │   └── healthRoutes.js
│   │   ├── services/
│   │   │   ├── chunkingService.js
│   │   │   ├── documentParserService.js
│   │   │   ├── embeddingService.js
│   │   │   ├── ollamaService.js
│   │   │   ├── qdrantService.js
│   │   │   ├── ragService.js
│   │   │   └── retrievalService.js
│   │   ├── utils/
│   │   │   ├── AppError.js
│   │   │   ├── asyncHandler.js
│   │   │   ├── fileCleanup.js
│   │   │   └── uuid.js
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   │   └── rag.test.js
│   ├── uploads/
│   ├── .env.example
│   ├── package.json
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button.jsx
│   │   │   ├── ChatMessage.jsx
│   │   │   ├── DocumentCard.jsx
│   │   │   ├── DocumentList.jsx
│   │   │   ├── EmptyState.jsx
│   │   │   ├── ErrorMessage.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   ├── Modal.jsx
│   │   │   └── SourceReference.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useTheme.js
│   │   ├── layouts/
│   │   │   ├── AppLayout.jsx
│   │   │   └── AuthLayout.jsx
│   │   ├── pages/
│   │   │   ├── ChatPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── DocumentDetailPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── RegisterPage.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── utils/
│   │   │   └── formatters.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── postman/
│   └── AI_Document_QA_Assistant.postman_collection.json
├── .gitignore
└── README.md
```

---

## Technology Stack

- **Frontend**: React, Vite, JavaScript (ES Modules), Tailwind CSS, React Router, Axios, Lucide React
- **Backend**: Node.js, Express.js, JavaScript (ES Modules), MongoDB, Mongoose, JWT (`jsonwebtoken`), `bcrypt`, `multer`, `helmet`, `cors`, `express-rate-limit`
- **Document Processing**: `pdf-parse` (PDF text & page number extraction), `mammoth` (DOCX text extraction), Node `fs/promises` (TXT extraction)
- **RAG & Vector Search**: Custom chunking service with configurable size/overlap, Ollama local embedding API (`nomic-embed-text`), Qdrant vector database (Cosine similarity, automatic collection provisioning & dynamic dimension detection), Ollama local chat API (`llama3.2:3b`)

---

## 1. Ollama Windows Setup

1. Download and install **Ollama for Windows** from the official website:  
   [https://ollama.com/download/windows](https://ollama.com/download/windows)
2. Run the installer (`OllamaSetup.exe`). Once installed, Ollama runs as a background service on `http://localhost:11434`.
3. Open **Windows PowerShell** and verify Ollama is installed:

```powershell
ollama --version
```

4. Download the required local chat model and embedding model:

```powershell
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

5. Verify both models are downloaded and listed:

```powershell
ollama list
```

6. Verify the local Ollama HTTP API is responding:

```powershell
Invoke-RestMethod -Uri http://localhost:11434/api/tags
```

*(Note: If your machine has limited RAM, you can also use `llama3.2:1b` by running `ollama pull llama3.2:1b` and setting `OLLAMA_CHAT_MODEL=llama3.2:1b` in `backend/.env`.)*

---

## 2. Qdrant Setup (Docker on Windows)

### Installing Docker Desktop on Windows
1. Download **Docker Desktop for Windows** from [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/).
2. Run the installer and enable WSL 2 when prompted.
3. Launch **Docker Desktop** from the Start menu and wait until the status indicator in the bottom-left corner shows **Engine running**.

### Verify Docker is Running
Open **Windows PowerShell** and run:

```powershell
docker --version
docker info
```

### Start Qdrant Container (Port 6333)
Run the following command in **Windows PowerShell** to pull the official Qdrant image and start Qdrant with persistent local storage:

```powershell
mkdir -Force "$PWD\qdrant_storage"
docker run -d --name qdrant-rag -p 6333:6333 -p 6334:6334 -v "${PWD}\qdrant_storage:/qdrant/storage" qdrant/qdrant:latest
```

### Check Qdrant is Running
Verify the container is running and the REST API responds:

```powershell
docker ps
Invoke-RestMethod -Uri http://localhost:6333/collections
```

You can also view the Qdrant Web UI in your browser at `http://localhost:6333/dashboard`.

### Stop and Restart Qdrant Later
```powershell
# Stop Qdrant
docker stop qdrant-rag

# Start existing Qdrant container again
docker start qdrant-rag
```

*(Note: If Docker is unavailable on your machine, you can alternatively use a remote Qdrant Cloud cluster by setting `QDRANT_URL` and `QDRANT_API_KEY` in `backend/.env`. By default, the project uses `QDRANT_URL=http://localhost:6333` and automatically creates the collection on first upload.)*

---

## 3. MongoDB Setup

You can use either **Local MongoDB Community Server** or **MongoDB Atlas**.

### Option A: Local MongoDB on Windows
1. Download **MongoDB Community Server** from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community).
2. Install MongoDB as a Windows Service (default port `27017`).
3. Use this connection string in `backend/.env`:
   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017/ai_document_qa
   ```

### Option B: MongoDB Atlas (Cloud Free Tier)
1. Create a free account at [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free M0 cluster, add a database user (username + password), and allow your IP address under **Network Access**.
3. Copy your connection string and set it in `backend/.env`:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/ai_document_qa?retryWrites=true&w=majority
   ```

---

## 4. Environment Configuration

### Backend (`backend/.env`)
Copy `backend/.env.example` to `backend/.env`:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/ai_document_qa
JWT_SECRET=replace_with_a_strong_random_jwt_secret_key_at_least_32_chars
JWT_EXPIRES_IN=7d
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=document_chunks
CHUNK_SIZE=800
CHUNK_OVERLAP=150
SIMILARITY_THRESHOLD=0.35
TOP_K_CHUNKS=5
MAX_FILE_SIZE_MB=20
CLIENT_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)
Copy `frontend/.env.example` to `frontend/.env`:

```powershell
cd frontend
Copy-Item .env.example .env
```

Contents of `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

---

## 5. Running the Project on Windows

### Step 1: Start Backend (Terminal 1)
```powershell
cd backend
npm install
npm run dev
```
The backend API will start at `http://localhost:5000`.

### Step 2: Start Frontend (Terminal 2)
```powershell
cd frontend
npm install
npm run dev
```
The React frontend will start at `http://localhost:5173`.

### Running Automated Tests
```powershell
cd backend
npm test
```

---

## 6. Postman API Testing

A ready-to-import Postman collection is located at:
`postman/AI_Document_QA_Assistant.postman_collection.json`

### How to Import and Use:
1. Open **Postman** and click **Import** -> select `postman/AI_Document_QA_Assistant.postman_collection.json`.
2. Run **1. Register User** (`POST /api/auth/register`) or **2. Login User** (`POST /api/auth/login`).
3. The collection automatically saves the returned `token` into the `{{jwtToken}}` collection variable and passes `Authorization: Bearer {{jwtToken}}` to all protected endpoints:
   - `GET /api/auth/me`
   - `POST /api/documents/upload` (use `Body -> form-data`, key `document` of type `File`)
   - `GET /api/documents`
   - `GET /api/documents/:id`
   - `POST /api/chat`
   - `DELETE /api/documents/:id`

---

## 7. Common Errors & Solutions

### 1. `"Ollama connection refused"`
- **Cause**: The local Ollama service is not running or `OLLAMA_URL` is misconfigured.
- **Check**: Open PowerShell and run `ollama list`. If Ollama is not running, launch the Ollama app from the Windows Start Menu or run `ollama serve`, and confirm `OLLAMA_URL=http://localhost:11434` in `backend/.env`.

### 2. `"model not found"`
- **Cause**: The configured chat or embedding model has not been downloaded into Ollama yet.
- **Check**: Run `ollama pull llama3.2:3b` and `ollama pull nomic-embed-text`, then verify with `ollama list` that both models match `OLLAMA_CHAT_MODEL` and `OLLAMA_EMBED_MODEL` in `backend/.env`.

### 3. `"Qdrant connection refused"`
- **Cause**: The Qdrant Docker container is not running on port `6333`.
- **Check**: Verify Docker Desktop is running (`docker ps`) and start Qdrant (`docker start qdrant-rag` or run the `docker run` command above). Verify `http://localhost:6333/collections` opens in your browser.

### 4. `"MongoDB connection failed"`
- **Cause**: Local MongoDB service is stopped, or the MongoDB Atlas URI/IP whitelist is invalid.
- **Check**: For local MongoDB, check Windows Services (`services.msc`) and ensure `MongoDB Server` is running. For Atlas, verify username/password and ensure your current IP is added under **Network Access**.

### 5. `"Invalid JWT"`
- **Cause**: The token in `Authorization: Bearer <token>` is malformed, expired, or signed with a different `JWT_SECRET`.
- **Check**: Log out and log back in via `/login` (or re-run `/api/auth/login` in Postman) to obtain a fresh JWT token.

### 6. `"PDF text extraction failed"`
- **Cause**: The uploaded PDF is corrupted, password-protected, or contains only scanned images without an embedded text layer.
- **Check**: Verify the PDF opens normally and contains selectable text (not a scanned image-only PDF).

### 7. `"Document processing failed"`
- **Cause**: The uploaded file had no readable text, or Ollama/Qdrant became unreachable during chunk embedding.
- **Check**: Verify the file has readable text and check that both Ollama (`http://localhost:11434`) and Qdrant (`http://localhost:6333`) are running.

### 8. `"Embedding dimension mismatch"`
- **Cause**: `OLLAMA_EMBED_MODEL` was changed to a model with a different vector dimension after the Qdrant collection was already created.
- **Check**: Either switch `OLLAMA_EMBED_MODEL` back to the original model (`nomic-embed-text`, 768 dimensions) or delete the existing collection so it is recreated automatically:
  `Invoke-RestMethod -Method Delete -Uri http://localhost:6333/collections/document_chunks`

### 9. `"Port already in use"`
- **Cause**: Another process is already listening on port `5000` (backend) or `5173` (frontend).
- **Check**: Find and stop the process using `netstat -ano | findstr :5000` and `taskkill /PID <PID> /F`, or change `PORT` in `backend/.env`.

### 10. `"npm install failed"`
- **Cause**: Outdated Node.js version, network interruption, or locked `node_modules`.
- **Check**: Ensure Node.js v20+ is installed (`node -v`), delete `node_modules` and `package-lock.json`, and run `npm install` again.

### 11. `"File upload failed"`
- **Cause**: File exceeds the 20 MB limit, has an unsupported extension/MIME type, or the multipart field name is not `document`.
- **Check**: Upload only `.pdf`, `.docx`, or `.txt` files under 20 MB using the `document` form-data field.

### 12. `"LLM response failed"`
- **Cause**: Ollama ran out of system memory while loading the chat model or timed out.
- **Check**: Ensure sufficient free RAM is available or switch to a smaller model (`ollama pull llama3.2:1b` and set `OLLAMA_CHAT_MODEL=llama3.2:1b` in `backend/.env`).

---

## 8. Git & GitHub Setup

To initialize a Git repository and push this project to GitHub:

```powershell
git init
git add .
git commit -m "Initial commit: Full-stack local RAG AI Document Q&A Assistant"
git branch -M main
git remote add origin https://github.com/<your-username>/ai-document-qa.git
git push -u origin main
```

---

## MANUAL INSTALLATION REQUIRED

To run the complete stack locally on your machine, install the following software:

1. **Node.js (v20 LTS or newer)**: [https://nodejs.org/](https://nodejs.org/)
2. **MongoDB Community Server** (local) OR a free **MongoDB Atlas** cluster: [https://www.mongodb.com/](https://www.mongodb.com/)
3. **Ollama** (local AI runtime for embeddings and chat LLM): [https://ollama.com/](https://ollama.com/)
   - Run `ollama pull llama3.2:3b` and `ollama pull nomic-embed-text`
4. **Docker Desktop** (to run local Qdrant vector database on port 6333): [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
5. **Git** (optional, for version control and pushing to GitHub): [https://git-scm.com/](https://git-scm.com/)

- **No OpenAI API key is required.**
- **No Gemini API key is required.**
- **No paid AI API is required.**
