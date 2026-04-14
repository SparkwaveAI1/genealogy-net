# GRIP Development Plan

**Date:** 2026-04-13
**Author:** Hermes
**Status:** Draft

---

## Goal

Build GRIP (Genealogy Research Intelligence Platform) into a production-ready system where:

1. Chat is routed through **Hermes** (not hardcoded MiniMax calls) so it has full access to the wiki, Gramps tree, memory, and skills
2. **Document intake → wiki filing** pipeline works end-to-end (upload → Hermes analysis → wiki page creation)
3. Researchers can browse people, mysteries, and family relationships from the Gramps tree
4. The wiki compounds over time as documents are ingested

---

## Current State

### What exists

| Component | State | Notes |
|-----------|-------|-------|
| GRIP Next.js frontend | Partial | Dashboard with chat + doc upload, people/mysteries sidebar |
| Hermes server route | Partial | `server/routes/chat.ts` — hardcoded prompt, MiniMax direct call, NOT Hermes |
| Wiki server route | Partial | `server/routes/wiki.ts` — read-only file serving, no wiki write API |
| Gramps server route | Partial | `server/routes/gramps.ts` — read-only Gramps API proxy |
| Genealogy wiki | Partial | `~/genealogy-wiki/` — schema (WIKI.md), index.md, log.md exist; 1 seeded person page |
| Document upload UI | Partial | Dashboard has upload form + AI analysis display; no wiki filing yet |
| Hermes ↔ GRIP connection | Missing | No route from GRIP chat to Hermes agent |

### Key Gaps

1. **Chat bypasses Hermes entirely** — MiniMax is called directly from `chat.ts` with a hardcoded role prompt. No access to wiki, memory, or Gramps context.
2. **Document intake stops at analysis** — Dashboard shows AI analysis results but doesn't file to wiki.
3. **No wiki write API** — The wiki server route only reads files. No endpoint to create/update wiki pages from GRIP.
4. **Hermes has no GRIP integration** — Hermes doesn't know about GRIP's routes or how to respond to chat requests from it.

---

## Architecture

```
Researcher → GRIP (Next.js) → Hermes Server (chat route)
                                 ↓
                          Hermes Agent
                            ↓         ↓         ↓
                      Gramps API   Wiki FS   Memory/Skills
```

GRIP's `POST /api/chat` → calls → Hermes server's `/chat` route → routes to → Hermes agent → returns response.

---

## Priority 1: Route Chat Through Hermes

### Problem
`server/routes/chat.ts` calls MiniMax directly with a hardcoded system prompt. No wiki access, no memory, no tool use.

### Solution
Replace the MiniMax direct call with a call to the **Hermes gateway** (which is already running at port 8080 or similar). GRIP sends the user's message + context to Hermes, Hermes processes with full tool access, returns the response.

### Steps

1. **Find Hermes gateway port**
   - Check what port the gateway listens on (default is 8080 for HTTP, or `--stdio` for stdio mode)
   - Gateway PID 53106 running `hermes_cli.main gateway run`

2. **Create Hermes chat route**
   - New route: `server/routes/hermes.ts`
   - POST endpoint that forwards to Hermes gateway: `POST /hermes/chat` → Hermes gateway
   - OR use stdio mode: spawn hermes as subprocess, send JSON messages, read responses

3. **Update `server/routes/chat.ts`**
   - Replace MiniMax direct call with call to Hermes
   - Keep the context building (personId, mysteryId, documentContext, contextMode) but send to Hermes instead

4. **Test**
   - Send a chat message from GRIP Dashboard
   - Verify response comes from Hermes with wiki/Gramps context

### Files likely to change
- `server/routes/chat.ts` — replace MiniMax call with Hermes call
- `server/routes/hermes.ts` — new file, Hermes gateway bridge
- `server/index.ts` — register new route

### Verification
```
Researcher types: "Who is Robert B. Johnson?"
→ GRIP /api/chat → Hermes → wiki/people/johnson-robert-b.md + Gramps API
→ Response with citations and confidence level
```

---

## Priority 2: Document Intake → Wiki Filing Pipeline

### Problem
Dashboard can upload a document and display AI analysis, but the result is never filed to the wiki.

### Solution
After analysis, user confirms → GRIP calls Hermes with document context → Hermes creates wiki pages (person, family, source, or mystery) → updates index.md and log.md.

### Steps

1. **Add wiki write API to GRIP server**
   - New route: `server/routes/wiki-write.ts`
   - POST `/wiki/file` — accepts document analysis + filing instructions, writes to wiki FS
   - This is a privileged endpoint (internal only, not exposed to public)

2. **Add "File to Wiki" button to Dashboard**
   - After document analysis completes, show "File to Wiki" button
   - User can select: person page, family page, source page, or mystery page
   - Sends confirmation to `/wiki/file` endpoint

3. **Connect to Hermes for page generation**
   - Instead of GRIP generating wiki content directly, send to Hermes
   - Hermes reads raw document, generates YAML frontmatter + body content
   - Writes to `~/genealogy-wiki/wiki/{type}/{slug}.md`
   - Updates `index.md` and appends to `log.md`

4. **Handle duplicates**
   - If person already exists in wiki, prompt to update or skip
   - Use gramps_id or name+dob as unique key

### Files likely to change
- `app/components/Dashboard.tsx` — add "File to Wiki" UI
- `server/routes/wiki-write.ts` — new file, wiki write endpoint
- `server/index.ts` — register new route
- `wiki/WIKI.md` — may need updates if schema changes

### Verification
```
Upload census record for Robert B. Johnson, 1860
→ Analysis shows: name, date, place, family members
→ Click "File to Wiki" → select "person page"
→ wiki/people/johnson-robert-b.md updated or created
→ index.md updated
→ log.md appended
```

---

## Priority 3: People Browsing from Gramps

### Problem
GRIP has no way to browse the Gramps tree.

### Solution
Build person detail page and family view that pull from Gramps API via the existing `gramps.ts` route.

### Steps

1. **Person detail page** (`app/people/[id]/page.tsx`)
   - Fetch person from Gramps API via `/api/gramps/people/:id`
   - Display: name, dates, places, events, relationships, citations
   - Link to chat with this person as context

2. **Family view**
   - Show parents, spouse(s), children
   - Navigate via relationships

3. **People search**
   - Already exists: `app/components/PersonSearch.tsx`
   - Wire it up to `/api/gramps/people` endpoint

### Files likely to change
- `app/people/[id]/page.tsx` — new or update
- `app/api/gramps/people/route.ts` — Gramps API proxy
- `app/components/PersonSearch.tsx` — wire up to API

---

## Priority 4: Mysteries Browsing

### Problem
Mysteries exist in the wiki but aren't linked to the Gramps tree or document intake.

### Solution
Build mysteries page that pulls from wiki API, link mysteries to people and documents.

### Steps

1. **Mysteries list page** (`app/mysteries/page.tsx`)
   - Fetch from `/api/wiki/mysteries`
   - Display title, status, key people, last updated

2. **Mystery detail page** (`app/mysteries/[id]/page.tsx`)
   - Fetch from `/api/wiki/mysteries/:id`
   - Show full content, evidence chain, linked people
   - "Add evidence" button → opens document upload with mystery context

3. **Link mysteries to people**
   - Each mystery lists involved people (from frontmatter)
   - Each person page shows linked mysteries

### Files likely to change
- `app/mysteries/[id]/page.tsx` — update or create
- `app/api/wiki/mysteries/route.ts` — wire up

---

## Open Questions

1. **Hermes gateway port** — Need to confirm what port the gateway listens on. Is it stdio mode or HTTP?
2. **Auth** — Does GRIP need auth for the wiki write endpoint, or is it internal only?
3. **Supabase** — Was Supabase planned for storing mysteries/evidence? The `SUPABASE_MIGRATION.md` suggests this was considered. Is it needed for Priority 1-4?
4. **Deployment** — Is the GRIP app deployed to Vercel? Where does the wiki FS live in production (Vercel has no persistent filesystem)?

---

## Risks & Tradeoffs

- **Wiki FS on Vercel** — Vercel serverless functions have ephemeral filesystem. If GRIP is deployed to Vercel, wiki writes must go to a persistent store (Supabase, S3, or the wiki must live on the Hermes VPS).
- **Hermes availability** — If Hermes gateway goes down, GRIP chat stops working. Consider a fallback.
- **Token limits** — Chat history passed to Hermes could get large. Need to truncate or use compression.

---

## Suggested First Step

Start with **Priority 1** (route chat through Hermes) because:
- It's the most impactful change
- It unlocks Hermes's full capabilities for GRIP
- Everything else (document intake, wiki filing) depends on it

**Immediate action:** Confirm Hermes gateway port and test a simple chat forward from GRIP → Hermes.
