# Aifredo Chat Clone — Backend Setup

## Quick Start (3 steps)

### 1. Add an API Key
Copy `.env.example` → `.env` and add at least one key:

```env
# FREE options (start here):
GROQ_API_KEY=gsk_...        # groq.com  — Llama 3 (instant, free)
GOOGLE_API_KEY=AIza...      # aistudio.google.com — Gemini (free)

# Paid:
OPENAI_API_KEY=sk-...       # platform.openai.com
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Start the Server

**Easy way (Windows):**
```
Double-click start.bat
```

**Manual:**
```bash
cd server
npm install
node server.js
```

### 3. Open the Frontend
Open `index.html` in your browser. The app auto-detects the backend.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status + provider availability |
| GET | `/api/models` | List available AI models |
| POST | `/api/chat` | **Streaming** chat (SSE) |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session history |
| POST | `/api/wallet/verify` | Verify Solana wallet signature |

## Chat Request Format
```json
POST /api/chat
{
  "message": "Hello!",
  "model": "GPT-4o",
  "sessionId": "uuid-optional"
}
```

## SSE Response Events
```
event: session    → { sessionId }
event: chunk      → { text }       (streamed tokens)
event: done       → { sessionId, model, provider }
event: error      → { error }
```
