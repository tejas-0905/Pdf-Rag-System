from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from openai import OpenAI, OpenAIError
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

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Extract text from PDF
def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""

    for page in reader.pages:
        text += page.extract_text() or ""

    return text

# Split text
def split_text(text):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100
    )

    return splitter.split_text(text)

# Create embeddings
def create_vector_store(chunks):
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )

    vector_db = FAISS.from_texts(chunks, embeddings)

    return vector_db

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

    context = "\n".join([doc.page_content for doc in docs])

    prompt = f"""
    Answer the question based on the context below.

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
