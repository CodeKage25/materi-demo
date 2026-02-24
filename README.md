# Materi

A real-time collaborative document platform with an AI agent that edits alongside you.

Built with Next.js 16, Supabase, TipTap v2, Yjs CRDT, and OpenAI gpt-4o.

---

## Screenshots

### AI Agent Sidebar

The shared AI chat lets collaborators instruct the agent to write, rewrite, expand, or edit — all visible live.

![AI sidebar with chat history](public/screenshots/screenshot-1.png)

![AI sidebar with tool actions](public/screenshots/screenshot-2.png)

### Real-time Collaborative Editing

Multiple users edit simultaneously with live cursors, name labels, and conflict-free merging via Yjs CRDT.

![Collaborative editing with live cursors](public/screenshots/screenshot-3.png)

![Collaborative editing scrolled view](public/screenshots/screenshot-4.png)

---

## Features

| Feature | Detail |
|---------|--------|
| **Real-time collaboration** | Multiple users edit the same document simultaneously via Yjs CRDT over Supabase Realtime |
| **AI inline suggestions** | Ghost text completions as you type — Tab ↵ to accept, Escape to dismiss, 1800ms debounce |
| **AI word-by-word streaming** | AI edits stream word-by-word into the shared document, visible to all collaborators live |
| **Floating AI bubble menu** | Select any text → Improve / Shorten / Expand / Fix — AI rewrites the selection in place |
| **Shared AI chat** | All collaborators see the AI's actions live; chat persisted per-document with markdown rendering |
| **Context-aware agent** | AI knows who is editing, who the other collaborators are, and the full document content |
| **AI tools** | Agent can rewrite the document, append content, or apply surgical edits via `suggest_edit` |
| **AI editing indicator** | Toolbar shows a live "AI editing…" pulse whenever the agent is streaming into the document |
| **⌘J keyboard shortcut** | Toggle the AI panel from anywhere in the editor |
| **Live word count** | Word count and estimated reading time update as you type |
| **Share link auto-join** | Any authenticated user with the link is automatically added to the workspace |
| **Multi-tenant workspaces** | Full workspace/member model from day one — all data isolated by membership |
| **Row-Level Security** | Every table has RLS. `auth.uid()` enforced on every policy. No `select=*` anywhere |
| **SECURITY DEFINER RPCs** | Atomic mutations (`create_workspace`, `create_document`, `auto_join_workspace`) run with reliable auth context |
| **Mobile responsive** | Full responsive layout — sidebar drawer on mobile, bottom-sheet AI panel, scrollable toolbar |
| **Dark mode** | System-aware dark/light theme via Tailwind CSS v4 |

---

## Architecture

```mermaid
graph TB
    subgraph Client["Browser (Next.js Client Components)"]
        Auth["Auth Pages\n/login · /signup"]
        Onboard["Onboarding\nCreate workspace"]
        Dashboard["Workspace Dashboard\nDocument list"]
        Editor["Document Editor\nTipTap + Yjs CRDT"]
        Inline["AIInlineSuggestion\nGhost text extension"]
        AISidebar["AI Sidebar\nStreaming chat"]
    end

    subgraph Server["Next.js Server (App Router)"]
        RSC["React Server Components\nData fetching + auth guard"]
        AIChat["/api/ai/chat\nOpenAI agent (tools, streaming)"]
        AIComplete["/api/ai/complete\nInline completion endpoint"]
        AITransform["/api/ai/transform\nSelection rewrite endpoint"]
        Proxy["proxy.ts\nSession refresh middleware"]
    end

    subgraph Supabase["Supabase (Backend)"]
        SupaAuth["GoTrue\nAuth service"]
        PostgREST["PostgREST\nAuto REST API + RLS"]
        Realtime["Realtime\nBroadcast + postgres_changes"]
        DB[("PostgreSQL\n+ RLS on every table")]
    end

    OpenAI["OpenAI\ngpt-4o"]

    Auth -->|"signUp / signInWithPassword"| SupaAuth
    SupaAuth -->|"JWT session"| Auth

    RSC -->|"getUser() · explicit column select"| PostgREST
    PostgREST -->|"RLS enforced"| DB
    Proxy -->|"Refresh session cookies"| SupaAuth

    Editor -->|"Yjs ops via SupabaseProvider"| Realtime
    Realtime -->|"Broadcast CRDT updates"| Editor
    Editor -->|"Awareness: cursors + collaborators"| Realtime

    Inline -->|"POST context + docText"| AIComplete
    AIComplete -->|"getUser() auth check"| PostgREST
    AIComplete -->|"1-2 sentence completion"| OpenAI

    AISidebar -->|"POST /api/ai/chat"| AIChat
    AIChat -->|"getUser() + doc access check"| PostgREST
    AIChat -->|"Stream completion + tool_use"| OpenAI
    AIChat -->|"Persist messages"| PostgREST
    AIChat -->|"SSE stream"| AISidebar

    AISidebar <-->|"postgres_changes INSERT\nShared AI chat"| Realtime
    AISidebar <-->|"broadcast: ai-typing-{docId}"| Realtime

    Editor -->|"POST selected text + action"| AITransform
    AITransform -->|"getUser() auth check"| PostgREST
    AITransform -->|"SSE rewrite stream"| OpenAI
    AITransform -->|"SSE delta chunks"| Editor
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

    U->>B: Open document (shared link)
    B->>MW: GET /workspace/doc/123
    MW->>SB: Refresh session cookie
    MW->>RSC: Forward with fresh session
    RSC->>SB: RPC auto_join_workspace (idempotent)
    RSC->>SB: SELECT documents WHERE id=123 (RLS enforced)
    RSC->>SB: SELECT ai_messages WHERE document_id=123
    SB-->>RSC: Document + message history
    RSC-->>B: Rendered page + initial data

    U->>B: Type in editor
    B->>B: AIInlineSuggestion debounce (1800ms)
    B->>API: POST /api/ai/complete {context, documentText}
    API->>OAI: chat.completions (max 80 tokens)
    OAI-->>API: 1-2 sentence completion
    API-->>B: {completion}
    B-->>U: Ghost text shown (Tab to accept)

    U->>B: Send AI message
    B->>API: POST /api/ai/chat {messages, documentId, documentText, collaborators}
    API->>SB: getUser() — verify session
    API->>SB: SELECT documents — verify workspace membership
    API->>OAI: chat.completions (stream, tools: replace/append/suggest_edit)
    OAI-->>API: SSE token stream + tool_use events
    API-->>B: SSE stream
    API->>SB: INSERT document_ai_messages (assistant response)
    B-->>U: Words streamed word-by-word into document via Yjs
    B->>SB: Broadcast Yjs update to all collaborators

    U->>B: Select text → click Improve/Shorten/Expand/Fix
    B->>API: POST /api/ai/transform {action, text, context}
    API->>SB: getUser() — verify session
    API->>OAI: chat.completions (stream, max 1200 tokens)
    OAI-->>API: SSE delta stream
    API-->>B: SSE stream
    B-->>U: Selection replaced word-by-word in editor
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
| Row-Level Security | Every table has RLS enabled. `auth.uid()` enforced on every policy |
| API routes | Server-side `getUser()` before any OpenAI or DB operation |
| Column exposure | Explicit column selection everywhere — zero `select=*` |
| Workspace isolation | All queries scoped through `workspace_members` membership |
| Mutations | `SECURITY DEFINER` RPCs for atomic operations with reliable auth context |
| Share links | `auto_join_workspace` is idempotent — safe to call on every page load |

---

## How real-time AI editing works

```
User sends AI message
  → /api/ai/chat streams SSE events
  → On tool_call (replace_document / append_to_document):
      → Content streamed word-by-word via view.dispatch(tr.insertText(word, endPos))
      → Each insert goes through TipTap's Collaboration extension → Yjs CRDT
      → Supabase Realtime broadcasts the Yjs op to all connected clients
      → All collaborators see words appearing live in the document
      → User's cursor position is unaffected (inserts happen at document end)
```

Bubble menu rewrites run on selections:
```
Select text → click action (Improve / Shorten / Expand / Fix)
  → POST /api/ai/transform {action, text, context}
  → Selection deleted from editor
  → AI response streamed back word-by-word at same position via ProseMirror transactions
  → Goes through Yjs CRDT → visible to all collaborators live
```

Inline suggestions run independently:
```
User types → 1800ms debounce → POST /api/ai/complete → ghost text rendered
Tab         → insertText at cursor position (suggestion accepted)
Escape      → suggestion dismissed
Any key     → suggestion dismissed, normal typing continues
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router + TypeScript |
| Auth + DB | Supabase (GoTrue + PostgreSQL + PostgREST + Realtime) |
| UI | Tailwind CSS v4 + shadcn/ui |
| Editor | TipTap v2 (ProseMirror) |
| CRDT | Yjs + custom SupabaseProvider (no WebSocket server needed) |
| AI agent | OpenAI gpt-4o — streaming SSE, tool_use, inline completions |
| Deployment | Vercel (zero-config Next.js) |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase project

Create a project at [supabase.com](https://supabase.com), then run the migrations in order via the SQL Editor:

```
supabase/migrations/001_initial.sql          — schema, RLS policies, indexes, SECURITY DEFINER RPCs
supabase/migrations/002_realtime.sql         — enable Realtime on document_ai_messages
supabase/migrations/003_auto_join.sql        — auto_join_workspace RPC for share links
supabase/migrations/004_profiles_coworkers.sql — co-member profile visibility for collaborator names
```

In **Authentication → Providers → Email**, disable **"Confirm email"** for demo use.

### 3. Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
OPENAI_API_KEY=sk-...
OPENAI_MODEL_CHAT=gpt-4o
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run

```bash
npm run dev
```

---

## Deploy to Vercel

1. Push to GitHub
2. Import repository at [vercel.com](https://vercel.com/new)
3. Add environment variables matching `.env.local` — update `NEXT_PUBLIC_APP_URL` to your production domain
4. Deploy — Vercel auto-detects Next.js, no additional build config needed

For Supabase Auth redirects in production:
- In Supabase → **Authentication → URL Configuration**, add your Vercel URL to **Redirect URLs**
- Optionally configure [Resend](https://resend.com) as your SMTP provider to avoid shared-infra deliverability issues

---

## Key design decisions

**SupabaseProvider instead of y-websocket** — Running a WebSocket server is an extra infrastructure dependency. `SupabaseProvider` implements the Yjs awareness and update protocol over Supabase Realtime broadcast channels. No separate server, no cold-start latency, same CRDT guarantees.

**SECURITY DEFINER RPCs for mutations** — PostgREST RLS policies run as the calling user. For operations that require creating multiple records atomically (e.g., creating a workspace also inserts into `workspace_members`), a `SECURITY DEFINER` function provides a reliable, auditable auth boundary without client-side race conditions.

**Per-document AI message persistence** — Session-scoped AI context disappears when the tab closes. Per-document persistence means context survives refreshes, is shared with collaborators, and enables the Realtime shared-chat feature where all users see the AI conversation live.

**Word-by-word AI streaming via ProseMirror transactions** — Instead of setting the full document content at once, each word is inserted via `view.dispatch(tr.insertText(word, endPos))`. This goes through the Yjs Collaboration extension, propagating each word as a separate CRDT operation to all connected peers in real time.
