from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from openai import OpenAI, OpenAIError
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import os
from dotenv import load_dotenv
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = FastAPI()

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global vectorstore
vectorstore = None

UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class VectorStore:
    def __init__(self, chunks):
        self.chunks = chunks
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.matrix = self.vectorizer.fit_transform(chunks)

    def similarity_search(self, question, k=3):
        question_vector = self.vectorizer.transform([question])
        scores = cosine_similarity(question_vector, self.matrix).flatten()
        ranked_indices = scores.argsort()[::-1]
        relevant_chunks = [
            self.chunks[index]
            for index in ranked_indices[:k]
            if scores[index] > 0
        ]

        if relevant_chunks:
            return relevant_chunks

        return self.chunks[:k]

# Extract text from PDF
def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""

    for page in reader.pages:
        text += page.extract_text() or ""

    return text

# Split text
def split_text(text):
    chunk_size = 500
    chunk_overlap = 100
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start = end - chunk_overlap

    return chunks

# Create embeddings
def create_vector_store(chunks):
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Could not extract readable text from this PDF.",
        )

    return VectorStore(chunks)

def get_openai_client():
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")

    if not api_key and base_url and "localhost:11434" in base_url:
        api_key = "ollama"

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="LLM_API_KEY or OPENAI_API_KEY is missing. Add it to backend/.env.",
        )

    return OpenAI(api_key=api_key, base_url=base_url)

# Upload PDF
@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global vectorstore

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    text = extract_text_from_pdf(file_path)

    chunks = split_text(text)

    vectorstore = create_vector_store(chunks)

    return {
        "message": "PDF uploaded successfully",
        "chunks": len(chunks)
    }

# Ask Question
@app.post("/ask")
async def ask_question(data: dict):
    global vectorstore

    if vectorstore is None:
        raise HTTPException(
            status_code=400,
            detail="Upload a PDF before asking a question.",
        )

    question = data.get("question")

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Request body must include a non-empty 'question'.",
        )

    docs = vectorstore.similarity_search(question, k=3)

    context = "\n".join(docs)

    prompt = f"""
    Answer the question using the context below.
    If the context is incomplete, give the best possible answer from the available document text and say what is missing.

    Context:
    {context}

    Question:
    {question}
    """

    try:
        response = get_openai_client().chat.completions.create(
            model=os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
    except OpenAIError as error:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI API error: {error}",
        ) from error

    answer = response.choices[0].message.content

    return {
        "answer": answer
    }

# Root
@app.get("/")
def home():
    return {"message": "PDF RAG API Running"}

@app.get("/health")
def health():
    return {"status": "ok"}
