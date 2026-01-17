# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Eigent is an open-source multi-agent AI desktop application built on CAMEL-AI. It enables users to build, manage, and deploy AI workforces that automate complex workflows through parallel execution.

## Architecture

The project has three main layers:

### Frontend (React + Electron)
- **Entry:** `src/main.tsx` → `src/App.tsx`
- **State Management:** Zustand stores in `src/store/` (chatStore, projectStore, authStore, installationStore)
- **UI Components:** `src/components/` using Radix UI + Tailwind CSS
- **Electron Main Process:** `electron/main/index.ts` handles app lifecycle, IPC, and spawning the backend
- **Preload Scripts:** `electron/preload/` exposes safe APIs to renderer

### Embedded Backend (`backend/`)
- Python FastAPI server bundled with the Electron app
- Runs as a child process managed by Electron
- Uses CAMEL-AI framework for multi-agent orchestration
- **Entry:** `backend/main.py`
- **Routes:** `backend/app/router.py`
- **Controllers:** `backend/app/controller/`
- **Package Manager:** uv (Python 3.10)

### Local Server (`server/`)
- Optional standalone FastAPI + PostgreSQL backend for local deployment
- Provides user auth, model provider configs, MCP management, chat persistence
- **Entry:** `server/main.py`
- **Database:** PostgreSQL with Alembic migrations in `server/alembic/`
- **Package Manager:** uv (Python 3.12)
- **Docker:** `docker-compose.yml` for full local deployment

## Common Commands

### Frontend Development
```bash
npm install                    # Install dependencies
npm run dev                    # Start development (Vite + Electron)
npm run type-check             # TypeScript type checking
```

### Testing
```bash
npm test                       # Run all tests (Vitest)
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage report
```

### Building
```bash
npm run build                  # Full build (babel + tsc + vite + electron-builder)
npm run build:mac              # macOS only
npm run build:win              # Windows only
```

### Embedded Backend (backend/)
```bash
cd backend
uv run uvicorn main:api --port 5001              # Run backend server
uv run pytest                                     # Run backend tests
uv run pybabel compile -d lang                   # Compile i18n translations
```

### Local Server (server/)
```bash
cd server
docker compose up -d                              # Start PostgreSQL + API via Docker
uv run alembic upgrade head                       # Run database migrations
uv run uvicorn main:api --reload --port 3001      # Run server locally (dev mode)
```

## Key Patterns

### IPC Communication
Electron main process (`electron/main/`) exposes APIs to renderer via preload scripts. The frontend calls `window.electronAPI.*` methods defined in `electron/preload/index.ts`.

### State Flow
User interactions → Zustand store actions → API calls to backend → SSE/WebSocket for streaming responses → Store updates → React re-renders

### Agent Architecture
The backend uses CAMEL-AI's multi-agent framework with specialized workers:
- Developer Agent (code execution, terminal)
- Browser Agent (web search, content extraction)
- Document Agent (file management)
- Multi-Modal Agent (images, audio)

### MCP Integration
Model Context Protocol tools are managed in `backend/app/component/` and `server/app/component/`. MCP servers can be local or remote.

## Environment Configuration

### Development (.env.development)
```
VITE_BASE_URL=/api
VITE_USE_LOCAL_PROXY=true      # Enable local backend
VITE_PROXY_URL=http://localhost:3001
```

### Local Server (server/.env)
Copy `server/.env.example` and configure database connection.

## Code Style

- **Python:** Ruff for linting (line-length 120), Google Python Style Guide for docstrings
- **TypeScript:** Standard React/TypeScript patterns
- **Naming:** Avoid abbreviations (e.g., `message_window_size` not `msg_win_sz`)
- **PR Labels:** feat, fix, docs, style, refactor, test, chore
