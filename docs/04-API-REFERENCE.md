# API Reference

Base URL: `http://localhost:3000/api`
All routes except `/login` require header: `Authorization: Bearer <token>`.

## Auth
| Method | Path | Body | Who | Description |
|--------|------|------|-----|-------------|
| POST | `/login` | `{ email, password }` | anyone | Returns `{ token, user }` |
| GET | `/me` | — | any logged in | Current user profile |

## Users & ministries
| Method | Path | Body | Who | Description |
|--------|------|------|-----|-------------|
| GET | `/users?role=` | — | admin / constructor | List users. Constructor sees only project managers. |
| POST | `/users` | `{ name, email, password, role, ministry? }` | admin / constructor | Create a user. Constructor may create **project managers only**. |
| GET | `/ministries` | — | admin / constructor | Ministries available to assign a project to (those with a minister) |

## Projects
| Method | Path | Body | Who | Description |
|--------|------|------|-----|-------------|
| GET | `/projects` | — | any | Projects visible to the caller's role |
| GET | `/projects/:id` | — | any (if visible) | One project |
| POST | `/projects` | `{ name, ministry, type?, location?, projectManagerId?, budget?, startDate?, expectedEnd?, description? }` | admin / constructor | Register a project. A constructor is auto-set as the contractor. |
| POST | `/projects/:id/team` | `{ projectManagerId }` | admin / constructor (own project) | Assign / change the project manager |
| POST | `/projects/:id/progress` | `{ progress?, status?, note? }` | PM / admin | Update progress / status |

## Pictures (the workflow)
| Method | Path | Body | Who | Description |
|--------|------|------|-----|-------------|
| POST | `/projects/:id/pictures` | multipart: `photos` (≤8 files), `caption`, optional `lat`, `lng`, `accuracy`, `capturedAt` (geotag) | PM / admin | Upload photos → `pending_constructor`. Geotag fields are stored as photo evidence. |
| GET | `/pictures?projectId=&status=` | — | any | List visible pictures (ministers see only `submitted_to_minister`) |
| POST | `/pictures/:id/assess` | `{ decision: "approve"\|"reject", note? }` | constructor / admin | Approve → submit to minister, or reject |
| POST | `/pictures/:id/view` | — | minister | Mark a submitted photo as viewed |

## Laborers & suppliers (participants)
| Method | Path | Body | Who | Description |
|--------|------|------|-----|-------------|
| GET | `/participants?kind=&status=` | — | admin / constructor | List applicants (constructor sees the pending pool + those on their projects). `kind` = `laborer`\|`supplier`, `status` = `pending`\|`approved`\|`rejected`. |
| POST | `/participants/:id/review` | `{ decision: "approve"\|"reject", projectId?, note? }` | admin / constructor | Approve (requires `projectId`, must be own project) & assign, or reject |
| POST | `/participants/simulate` | — | admin / constructor | Generate a random incoming applicant (stands in for the external app) |

## Conversations (per project, two channels)
`channel` = `minister` (minister ⇄ constructor) or `pm` (constructor ⇄ project manager).
Defaults to `minister` when omitted.

| Method | Path | Body | Who | Description |
|--------|------|------|-----|-------------|
| GET | `/feedback?channel=` | — | minister / constructor / project_manager / admin | Per-project thread summaries (count + last message) for that channel |
| GET | `/projects/:id/messages?channel=` | — | participants of that channel | Full conversation thread |
| POST | `/projects/:id/messages` | `{ body, channel }` | participants of that channel | Post a message to the thread |

Access per channel: `minister` → minister of the project's ministry + the project's
constructor; `pm` → the project's constructor + its assigned project manager (admin any).

## Dashboard
| Method | Path | Who | Description |
|--------|------|-----|-------------|
| GET | `/stats` | any | Counts: projects, in-progress, delayed, avg progress, photos pending/submitted, pending approvals, laborers/suppliers assigned |
| GET | `/activity` | any | Recent activity feed (filtered to visible projects) |

## Real-time
- **WebSocket:** `ws://localhost:3000/ws`
- Server pushes `{ event, data }` where `event` ∈ `picture | project | participant | message | activity | hello`.
- The frontend re-renders the current view whenever one arrives (and refreshes an open conversation thread on `message`).

## Example (curl)
```bash
# login
TOKEN=$(curl -s localhost:3000/api/login -H 'Content-Type: application/json' \
  -d '{"email":"pm.john@buildco.com","password":"pm123"}' | jq -r .token)

# PM uploads a photo to project 1
curl localhost:3000/api/projects/1/pictures -H "Authorization: Bearer $TOKEN" \
  -F "caption=Slab cast" -F "photos=@site.jpg"
```
