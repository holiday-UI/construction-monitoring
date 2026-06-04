# Testing & Verification

The full picture workflow and ministry isolation were verified end-to-end on
2026-06-04 against a running server.

## What was tested

| Step | Expected | Result |
|------|----------|--------|
| PM uploads photo to a hospital project | status `pending_constructor` | ✅ |
| Minister of Health checks photos *before* approval | sees 0 | ✅ |
| Constructor lists pending photos | sees 1 | ✅ |
| Constructor approves photo | status → `submitted_to_minister` | ✅ |
| Minister of Health checks *after* approval | sees 1 (with caption + constructor note) | ✅ |
| Minister of Education checks | sees 0 (ministry isolation) | ✅ |
| Minister of Education project list | only the school, **no hospitals** | ✅ |

### Constructor capabilities (verified 2026-06-04)

| Step | Expected | Result |
|------|----------|--------|
| `GET /ministries` as constructor | `["Education","Health"]` | ✅ |
| Constructor registers a project under Health | created, contractor auto-set to BuildCo | ✅ |
| Constructor creates a project manager | created | ✅ |
| Constructor tries to create a minister | 403 (PMs only) | ✅ |
| Constructor assigns PM to the project | PM attached | ✅ |
| Constructor lists pending applicants | sees 7 | ✅ |
| Approve applicant + assign to project | status `approved`, assigned | ✅ |
| Approve **without** a project | 400 (project required) | ✅ |
| Reject a flagged applicant | status `rejected` | ✅ |
| Minister tries to access participants | 403 (not permitted) | ✅ |

### Feedback: minister ⇄ constructor (verified 2026-06-04)

| Step | Expected | Result |
|------|----------|--------|
| Minister reads seeded thread on a Health project | 2 messages | ✅ |
| Minister posts feedback | created (role `minister`) | ✅ |
| Constructor replies | created (role `constructor`) | ✅ |
| Thread reflects both sides | 4 messages | ✅ |
| Education minister opens a Health project thread | 403 | ✅ |
| Project manager opens a feedback thread | 403 | ✅ |
| Empty message | 400 | ✅ |

### Constructor ⇄ PM conversation (pm channel — verified 2026-06-04)

| Step | Expected | Result |
|------|----------|--------|
| PM reads pm-channel thread on their project | 2 seeded messages | ✅ |
| Constructor posts a site message; PM replies | thread grows to 4 | ✅ |
| Minister channel on same project | stays at 2 (channels isolated) | ✅ |
| Wrong PM (not assigned) opens pm channel | 403 | ✅ |
| Minister opens pm channel | 403 | ✅ |
| PM opens minister channel | 403 | ✅ |
| Constructor pm-channel summary | lists each project + its PM + count | ✅ |

### Geotagged photo evidence (verified 2026-06-04)

| Step | Expected | Result |
|------|----------|--------|
| PM uploads photo with `lat/lng/accuracy/capturedAt` | stored & returned on the picture | ✅ |
| PM uploads photo without location | `lat` = null (uploads anyway) | ✅ |
| Constructor approves the geotagged photo | flows through normally | ✅ |
| Minister sees it with coordinates | location present, map available | ✅ |

> UI: the PM *Capture & Send* page requests device location (works on `localhost`/HTTPS);
> photo cards show coordinates + a **View on map** (OpenStreetMap) button; the minister
> view shows a **📍 Location verified** badge.

### Admin scope (UI — verify after sign-in as `admin@cms.gov`)

| Check | Expected |
|-------|----------|
| Admin sidebar | only **Dashboard · Projects · Users** |
| Projects page | no "New project" / "Assign PM" buttons (read-only) |
| Feedback / Laborers & Suppliers | not present |
| Dashboard | project-oversight stats only |

## How to re-run the smoke test
Start the server (`npm start`), then in another terminal log in as each role and
repeat the steps above, or use the curl recipe in
[04-API-REFERENCE.md](04-API-REFERENCE.md).

## Manual UI test (recommended)
1. Sign in as the **Constructor** (`constructor@buildco.com / build123`):
   - *Projects → New project* — register one and pick a ministry.
   - *Project Managers* — add a PM, then *Assign PM* on the project.
   - *Laborers & Suppliers* — approve a verified applicant to the project, reject a
     flagged one. Try **Simulate incoming sign-up** to see a new applicant arrive live.
2. Sign in as the **Project Manager**, *Capture & Send Photos*, send a photo.
3. Back as the **Constructor** — the photo appears live in *Review Photos*. Approve it.
4. Sign in as the **Minister of Health** — it appears in *Submitted Photos*. The
   **Minister of Education** does not see it.

The green "Live" indicator in the top bar confirms the real-time WebSocket connection.
