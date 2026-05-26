# PDF RAG System

A FastAPI + React application for uploading PDFs, indexing them with embeddings, and asking questions over the indexed document using an OpenAI-compatible LLM provider such as Groq.

## Project Structure

```text
backend/   FastAPI API, PDF parsing, vector search, LLM calls
frontend/  Vite React UI
```

## Local Setup

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend/.env`:

```env
LLM_API_KEY=your_groq_api_key
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
```

Run the API:

```powershell
.\venv\Scripts\python.exe -m uvicorn app:app --reload
```

The API runs at:

```text
http://127.0.0.1:8000
```

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

For local development, `frontend/.env` should contain:

```env
VITE_API_URL=http://localhost:8000
```

The UI runs at:

```text
http://127.0.0.1:5173
```

## Deploy Backend To Render

This repo includes `render.yaml`.

1. Push this project to GitHub.
2. Go to Render.
3. Create a new Blueprint or Web Service from the GitHub repo.
4. Add this environment variable in Render:

```env
LLM_API_KEY=your_groq_api_key
```

The other defaults are already in `render.yaml`:

```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
```

Render start command:

```bash
cd backend && uvicorn app:app --host 0.0.0.0 --port $PORT
```

## Deploy Frontend To Vercel

1. Import the GitHub repo in Vercel.
2. Set the root directory to `frontend`.
3. Set the build command:

```bash
npm run build
```

4. Set the output directory:

```bash
dist
```

5. Add this environment variable:

```env
VITE_API_URL=https://your-render-backend-url.onrender.com
```

## GitHub Commands

From the project root:

```powershell
git init
git add .
git commit -m "Initial PDF RAG system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

If the repository already exists locally, use:

```powershell
git add .
git commit -m "Prepare app for deployment"
git push
```

## Important

Never commit real API keys. Keep secrets in `.env` locally and in your hosting provider's environment variables.
