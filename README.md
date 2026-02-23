# Materi

A production-ready knowledge work platform — real-time collaborative documents with a document-scoped AI assistant that remembers context across sessions.

Built with Next.js 16, Supabase, TipTap, Yjs, and OpenAI gpt-4o.

---

## Architecture

```mermaid
graph TB
    subgraph Client["Browser (Next.js Client Components)"]
        Auth["Auth Pages\n/login · /signup"]
        Onboard["Onboarding\nCreate workspace"]
        Dashboard["Workspace Dashboard\nDocument list"]
        Editor["Document Editor\nTipTap + Yjs CRDT"]
        AISidebar["AI Sidebar\nStreaming chat"]
    end

    subgraph Server["Next.js Server (App Router)"]
        RSC["React Server Components\nData fetching + auth guard"]
        AIRoute["/api/ai/chat\nOpenAI proxy (auth-gated)"]
        Proxy["proxy.ts\nSession refresh middleware"]
    end

    subgraph Supabase["Supabase (Backend)"]
        SupaAuth["GoTrue\nAuth service"]
        PostgREST["PostgREST\nAuto REST API"]
        Realtime["Realtime\nWebSocket broadcast"]
        DB[("PostgreSQL\n+ RLS policies")]
    end

    OpenAI["OpenAI\ngpt-4o"]

    %% Auth flow
    Auth -->|"signUp / signInWithPassword"| SupaAuth
    SupaAuth -->|"JWT session"| Auth

    %% Server components
    RSC -->|"getUser() · select specific columns"| PostgREST
    PostgREST -->|"RLS enforced"| DB
    Proxy -->|"Refresh session cookies"| SupaAuth

    %% Client data
    Editor -->|"RPC: create_document()"| PostgREST
    Editor -->|"UPDATE documents"| PostgREST
    Dashboard -->|"SELECT documents"| PostgREST
    Onboard -->|"RPC: create_workspace()"| PostgREST

    %% AI flow
    AISidebar -->|"POST /api/ai/chat"| AIRoute
    AIRoute -->|"Verify session + doc access"| PostgREST
    AIRoute -->|"Stream completion"| OpenAI
    AIRoute -->|"Persist messages"| PostgREST
    AIRoute -->|"SSE stream"| AISidebar

    %% Real-time
    Editor <-->|"Yjs CRDT sync"| Realtime
    Realtime --- DB
```

### Request lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant MW as proxy.ts
    participant RSC as Server Component
    participant API as /api/ai/chat
    participant SB as Supabase
    participant OAI as OpenAI

    U->>B: Open document
    B->>MW: GET /workspace/doc/123
    MW->>SB: Refresh session cookie
    MW->>RSC: Forward with fresh session
    RSC->>SB: SELECT documents WHERE id=123 (RLS checks membership)
    RSC->>SB: SELECT ai_messages WHERE document_id=123
    SB-->>RSC: Document + message history
    RSC-->>B: Rendered page + initial data

    U->>B: Send AI message
    B->>API: POST /api/ai/chat {messages, documentId, documentText}
    API->>SB: getUser() — verify session
    API->>SB: SELECT documents WHERE id=123 — verify access
    API->>OAI: chat.completions.create (stream=true, gpt-4o)
    OAI-->>API: SSE token stream
    API-->>B: SSE token stream
    API->>SB: INSERT document_ai_messages (assistant response)
    B-->>U: Streamed response rendered
```

### Database schema

```mermaid
erDiagram
    auth_users {
        uuid id PK
        text email
    }

    profiles {
        uuid id PK
        uuid user_id FK
        text full_name
        text avatar_url
    }

    workspaces {
        uuid id PK
        text name
        text slug
        uuid owner_id FK
        timestamptz created_at
    }

    workspace_members {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        text role
        timestamptz joined_at
    }

    documents {
        uuid id PK
        uuid workspace_id FK
        text title
        jsonb content
        uuid created_by FK
        timestamptz updated_at
        timestamptz created_at
    }

    document_ai_messages {
        uuid id PK
        uuid document_id FK
        uuid user_id FK
        text role
        text content
        timestamptz created_at
    }

    auth_users ||--o| profiles : "has"
    auth_users ||--o{ workspace_members : "joins"
    auth_users ||--o{ documents : "creates"
    workspaces ||--o{ workspace_members : "has"
    workspaces ||--o{ documents : "contains"
    documents ||--o{ document_ai_messages : "has"
```

---

## Security model

| Layer | Implementation |
|-------|---------------|
| Auth | Supabase GoTrue — JWT sessions, anti-enumeration errors |
| Row-Level Security | Every table has RLS. `auth.uid()` enforced on all policies |
| API routes | Server-side `getUser()` before any OpenAI or DB call |
| Column exposure | Explicit column selection everywhere — no `select=*` |
| Workspace isolation | All queries scoped to `workspace_members` membership |
| Mutations | `SECURITY DEFINER` RPCs for atomic operations with reliable auth context |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router + TypeScript |
| Auth + DB | Supabase (GoTrue + PostgreSQL + PostgREST + Realtime) |
| UI | Tailwind CSS + shadcn/ui |
| Editor | TipTap v2 |
| CRDT | Yjs (real-time collaboration foundation) |
| AI | OpenAI gpt-4o via streaming SSE |
| Email | Resend (custom SMTP, replaces Supabase shared infra) |
| Deploy | Vercel |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase project

Create a project at [supabase.com](https://supabase.com), then run the full migration in the SQL Editor:

```
supabase/migrations/001_initial.sql
```

In **Authentication → Providers → Email**, disable **"Confirm email"** for demo use.

### 3. Environment

Update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
OPENAI_API_KEY=openai-key
OPENAI_ORG_ID=org-id
OPENAI_MODEL_CHAT=gpt-4o
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run

```bash
npm run dev
```

---

## Deploy

Push to GitHub, import into [Vercel](https://vercel.com), set the environment variables. Update `NEXT_PUBLIC_APP_URL` to your production URL.
