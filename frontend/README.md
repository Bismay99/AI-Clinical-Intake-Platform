# PS47 Frontend

Next.js 16 frontend for the AI-Powered Pre-Consultation Clinical Intake Platform.

## Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Zustand** — client / UI state
- **TanStack Query** — server state
- **lucide-react** — icons

## Getting Started

### 1. Environment

```bash
cp .env.local.example .env.local
# Edit .env.local — set NEXT_PUBLIC_API_URL to your backend URL
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start backend

From the project root:
```bash
# Ensure the PS47 FastAPI backend is running on port 8000
uvicorn backend.main:app --reload
```

### 4. Start frontend

```bash
npm run dev
```

Visit http://localhost:3000.

## Architecture

```
PATIENT BROWSER
  └─► Next.js frontend (localhost:3000)
        └─► FastAPI backend (localhost:8000)
              └─► PostgreSQL / SQLite
              └─► ai_orchestration/brain.py (in-process)
```

The frontend NEVER calls Gemini or any LLM directly.
All AI processing happens inside the FastAPI backend.

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/login` | Role-selection login |
| `/patient/dashboard` | Patient dashboard |
| `/patient/intake` | Voice / text intake session |
| `/patient/documents` | Document upload |
| `/patient/profile` | Patient profile |
| `/doctor/dashboard` | Doctor patient queue |

## Security

- Auth tokens are stored in `localStorage` under key `ps47_token`.
- `Authorization: Bearer <token>` is attached to every API call in `lib/api.ts`.
- 401 responses automatically clear the token and redirect to `/login`.
- No AI secrets in any `NEXT_PUBLIC_*` variable.