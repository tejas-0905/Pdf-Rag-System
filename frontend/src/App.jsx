import axios from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://pdf-rag-system-x4e0.onrender.com/'

const suggestedQuestions = [
  'Summarize this document',
  'List the key decisions',
  'Extract important dates',
  'What are the main risks?',
]

const initialMessages = [
  {
    role: 'assistant',
    content: 'No document indexed.',
  },
]

function App() {
  const fileInputRef = useRef(null)
  const messagesRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [documentInfo, setDocumentInfo] = useState(null)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [apiStatus, setApiStatus] = useState('checking')
  const [copiedIndex, setCopiedIndex] = useState(null)

  const canAsk = Boolean(documentInfo) && question.trim() && !isAsking

  const fileMeta = useMemo(() => {
    if (!selectedFile) {
      return null
    }

    return {
      name: selectedFile.name,
      size: formatFileSize(selectedFile.size),
    }
  }, [selectedFile])

  const conversationCount = Math.max(0, messages.filter((message) => message.role === 'user').length)

  useEffect(() => {
    let isActive = true

    async function checkApiStatus() {
      try {
        await axios.get(`${API_BASE_URL}/`, { timeout: 4000 })

        if (isActive) {
          setApiStatus('online')
        }
      } catch {
        if (isActive) {
          setApiStatus('offline')
        }
      }
    }

    checkApiStatus()
    const intervalId = window.setInterval(checkApiStatus, 30000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isAsking])

  function handleFile(file) {
    if (!file) {
      return
    }

    setError('')
    setUploadProgress(0)

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setSelectedFile(null)
      setError('Please select a PDF file.')
      return
    }

    setSelectedFile(file)
    setDocumentInfo(null)
    setMessages(initialMessages)
  }

  async function uploadPdf() {
    if (!selectedFile) {
      setError('Choose a PDF first.')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    setIsUploading(true)
    setUploadProgress(2)
    setError('')

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (event) => {
          if (!event.total) {
            return
          }

          setUploadProgress(Math.round((event.loaded * 100) / event.total))
        },
      })

      setUploadProgress(100)
      setDocumentInfo({
        fileName: selectedFile.name,
        chunks: response.data.chunks,
        size: fileMeta?.size,
        indexedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      })
      setMessages([
        {
          role: 'assistant',
          content: `${selectedFile.name} is ready. I indexed ${response.data.chunks} text chunks.`,
        },
      ])
    } catch (uploadError) {
      setError(getApiError(uploadError, 'Could not upload the PDF.'))
    } finally {
      setIsUploading(false)
    }
  }

  async function askQuestion(event) {
    event.preventDefault()

    const cleanQuestion = question.trim()

    if (!cleanQuestion || !documentInfo) {
      return
    }

    setMessages((current) => [
      ...current,
      {
        role: 'user',
        content: cleanQuestion,
      },
    ])
    setQuestion('')
    setIsAsking(true)
    setError('')

    try {
      const response = await axios.post(`${API_BASE_URL}/ask`, {
        question: cleanQuestion,
      })

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: response.data.answer,
        },
      ])
    } catch (askError) {
      const apiMessage = getApiError(askError, 'Could not get an answer.')

      setError(apiMessage)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: apiMessage,
        },
      ])
    } finally {
      setIsAsking(false)
    }
  }

  function clearSession() {
    setQuestion('')
    setMessages(documentInfo ? [
      {
        role: 'assistant',
        content: `${documentInfo.fileName} is still indexed. Ask a new question when ready.`,
      },
    ] : initialMessages)
    setError('')
  }

  async function copyAnswer(content, index) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      window.setTimeout(() => setCopiedIndex(null), 1400)
    } catch {
      setError('Could not copy the answer.')
    }
  }

  function handleQuestionKeyDown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div>
            <p className="eyebrow">PDF RAG System</p>
            <h1>Document Intelligence Workspace</h1>
          </div>
        </div>
        <div className={`api-pill ${apiStatus}`}>
          <span className="status-dot"></span>
          <span>{statusLabel(apiStatus)}</span>
          <strong>{API_BASE_URL.replace(/^https?:\/\//, '')}</strong>
        </div>
      </header>

      <section className="workspace">
        <aside className="upload-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Source</p>
              <h2>PDF Upload</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Choose PDF"
              title="Choose PDF"
            >
              +
            </button>
          </div>

          <button
            className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              handleFile(event.dataTransfer.files?.[0])
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <span className="file-icon" aria-hidden="true">
              PDF
            </span>
            <strong>{fileMeta?.name || 'Select document'}</strong>
            <small>{fileMeta?.size || 'PDF files supported'}</small>
          </button>

          <button
            className="primary-action"
            type="button"
            disabled={!selectedFile || isUploading}
            onClick={uploadPdf}
          >
            {isUploading ? 'Indexing...' : documentInfo ? 'Re-index PDF' : 'Upload and Index'}
          </button>

          {(isUploading || uploadProgress > 0) && (
            <div className="progress-block" aria-label="Upload progress">
              <div>
                <span>Upload</span>
                <strong>{uploadProgress}%</strong>
              </div>
              <progress value={uploadProgress} max="100"></progress>
            </div>
          )}

          <div className="document-card">
            <div className="document-card-top">
              <span className={`readiness ${documentInfo ? 'ready' : ''}`}></span>
              <div>
                <p className="eyebrow">Active Document</p>
                <strong>{documentInfo?.fileName || 'No active PDF'}</strong>
              </div>
            </div>
            <div className="metric-grid">
              <div>
                <span>Chunks</span>
                <strong>{documentInfo?.chunks ?? '-'}</strong>
              </div>
              <div>
                <span>Size</span>
                <strong>{documentInfo?.size || fileMeta?.size || '-'}</strong>
              </div>
              <div>
                <span>Indexed</span>
                <strong>{documentInfo?.indexedAt || '-'}</strong>
              </div>
              <div>
                <span>Questions</span>
                <strong>{conversationCount}</strong>
              </div>
            </div>
          </div>

          <div className="suggestions">
            <div className="suggestions-header">
              <p className="eyebrow">Quick Prompts</p>
            </div>
            <div className="suggestion-list">
              {suggestedQuestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  disabled={!documentInfo || isAsking}
                  onClick={() => setQuestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="qa-panel">
          <div className="panel-header qa-header">
            <div>
              <p className="eyebrow">Answers</p>
              <h2>Ask the PDF</h2>
            </div>
            <div className="header-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={clearSession}
                disabled={messages.length === 1 && !documentInfo}
              >
                Clear
              </button>
              <div className="model-chip">FastAPI + Groq</div>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
                x
              </button>
            </div>
          )}

          <div className="messages" ref={messagesRef} aria-live="polite">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="avatar" aria-hidden="true">
                  {message.role === 'assistant' ? 'AI' : 'You'}
                </div>
                <div className="message-body">
                  <p>{message.content}</p>
                  {message.role === 'assistant' && index > 0 && (
                    <button
                      className="copy-button"
                      type="button"
                      onClick={() => copyAnswer(message.content, index)}
                    >
                      {copiedIndex === index ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {isAsking && (
              <article className="message assistant">
                <div className="avatar" aria-hidden="true">
                  AI
                </div>
                <div className="message-body">
                  <p>Reading the indexed context...</p>
                </div>
              </article>
            )}
          </div>

          <form className="question-form" onSubmit={askQuestion}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              placeholder={documentInfo ? 'Ask a question from this PDF' : 'Upload a PDF to enable questions'}
              disabled={!documentInfo || isAsking}
              rows={3}
            />
            <button type="submit" disabled={!canAsk}>
              {isAsking ? 'Asking...' : 'Ask'}
            </button>
          </form>
        </section>
      </section>
    </main>
  )
}

function formatFileSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getApiError(error, fallback) {
  return error?.response?.data?.detail || error?.message || fallback
}

function statusLabel(status) {
  if (status === 'online') {
    return 'Online'
  }

  if (status === 'offline') {
    return 'Offline'
  }

  return 'Checking'
}

export default App
