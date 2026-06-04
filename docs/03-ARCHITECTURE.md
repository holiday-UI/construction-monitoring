# Architecture & File Map

## Tech stack
- **Backend:** Node.js + Express
- **Auth:** JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- **File uploads:** `multer` (photos saved to `/uploads`)
- **Real-time:** `ws` WebSocket server on `/ws`, broadcasts on every change
- **Storage:** plain JSON file `data/db.json` via a tiny custom store (`store.js`) —
  pure JS, **no database to install**
- **Frontend:** vanilla HTML + CSS + JavaScript single-page app (no build step)

## How a request flows
```
Browser (public/js/app.js)
   │  fetch  /api/...  with  Authorization: Bearer <JWT>
   ▼
Express (server.js)
   ├─ auth middleware  → verifies JWT, loads user
   ├─ requireRole(...) → role gate
   ├─ visibleProjects()→ row-level visibility per role
   ├─ store.js         → read/write data/db.json
   └─ broadcast()      → push change to all WebSocket clients
                          ▼
                  Browser refreshes the on-screen view (live)
```

## File map
```
construction-monitoring/
├─ server.js              # Express app, REST API, auth, uploads, WebSocket
├─ store.js               # JSON-file datastore (insert/update/find/save)
├─ seed.js                # demo users + projects + pending applicants -> data/db.json
├─ package.json           # dependencies & npm scripts
├─ README.md              # quick start
├─ data/
│  └─ db.json             # all data (users, projects, pictures, participants, messages, activity)
├─ uploads/               # uploaded photo files (served at /uploads/*)
├─ public/                # frontend (served statically)
│  ├─ index.html          # login screen + app shell (sidebar + official seal)
│  ├─ css/style.css       # government/official theme (navy + gold, serif)
│  └─ js/app.js           # SPA: sidebar nav, role views, API calls, WebSocket
└─ docs/                  # ← this documentation
   ├─ 01-OVERVIEW.md
   ├─ 02-USERS-AND-WORKFLOW.md
   ├─ 03-ARCHITECTURE.md
   ├─ 04-API-REFERENCE.md
   ├─ 05-TESTING.md
   └─ 06-RUN-AND-DEPLOY.md
```

## Data models (collections in `data/db.json`)

**users:** `id, name, email, password(hash), role, ministry, createdAt`
- `role` ∈ `admin | minister | constructor | project_manager`
- `ministry` set only for ministers (e.g. `"Health"`)

**projects:** `id, name, type, ministry, location, contractorId, projectManagerId,
status, progress, budget, startDate, expectedEnd, description, createdAt`
- A constructor who creates a project is auto-set as `contractorId`.

**pictures:** `id, projectId, url, caption, lat, lng, accuracy, capturedAt,
takenById, takenByName, status, constructorNote, assessedById, assessedByName,
assessedAt, ministerViewedAt, createdAt`
- `lat`/`lng`/`accuracy`/`capturedAt` are the **geotag** captured on the PM's device at
  upload time (null if location was unavailable or denied). Shown as coordinates + a map
  on every photo card.

**participants** (laborers & suppliers from the external sign-up app):
`id, kind (laborer|supplier), name, specialty, idNumber, contact, source, externalId,
verification (verified|unverified|flagged), status (pending|approved|rejected),
assignedProjectId, reviewNote, reviewedById, reviewedByName, reviewedAt, createdAt`

**messages** (per-project conversations, two channels):
`id, projectId, channel (minister|pm), fromId, fromName, fromRole, body, createdAt`
- `minister` channel = minister ⇄ constructor; `pm` channel = constructor ⇄ project
  manager. Channels are isolated by the `channel` field.

**activity:** `id, type, message, projectId, at` — the live activity feed.

## Security notes (MVP)
- Passwords hashed with bcrypt; auth via signed JWT (12h expiry).
- Role checks and per-row visibility enforced on the **server**, not just the UI.
- Upload size capped at 10 MB; filenames sanitised.
- For production, change `JWT_SECRET` (env var) and serve over HTTPS — see
  [06-RUN-AND-DEPLOY.md](06-RUN-AND-DEPLOY.md).
