# Changelog — activity log of updates

A running record of changes made to the system. Most recent first.
(All dates 2026-06-04, the build day.)

## 8. Constructor ⇄ project manager conversation (re: photos)
- Added a second conversation **channel** per project. The `messages` model now has a
  `channel` field: `minister` (existing minister⇄constructor feedback) and `pm`
  (new constructor⇄project-manager chat).
- The PM channel shows the project's **photo thumbnails** above the conversation so both
  parties discuss the uploaded photos in context.
- New tabs: **Site Messages** (constructor), **Constructor Chat** (project manager).
  Endpoints reuse `/feedback?channel=` and `/projects/:id/messages?channel=`.
- Verified: two-way messaging; channels isolated; access control (wrong PM, minister, and
  cross-channel all 403).
- Files: `server.js`, `seed.js`, `public/js/app.js`, `public/css/style.css`.

## 7. Geotagged photo evidence
- The PM's device **GPS coordinates + timestamp** are captured at photo upload and stored
  (`lat`, `lng`, `accuracy`, `capturedAt` on pictures; null if denied/unavailable).
- Every photo card shows coordinates + a **View on map** button (OpenStreetMap, no API
  key); the minister view adds a **📍 Location verified** badge — anti-fraud evidence that
  a photo was taken on-site.
- Verified: upload with/without GPS, flows to minister with coordinates.
- Files: `server.js`, `public/js/app.js`, `public/css/style.css`.

## 6. Admin scope reduced — oversight + user management only
- Removed from the **administrator** UI: the **Feedback** tab, the **Laborers &
  Suppliers** tab, **project creation** ("New project") and **Assign PM** — the Projects
  page is now read-only for admin.
- Trimmed the admin **dashboard** to project-oversight stats only (removed Photos to
  review, Pending approvals, Laborers/Suppliers assigned).
- Admin sidebar is now: **Dashboard · Projects (read-only) · Users**.
- Files: `public/js/app.js`. Docs: `01-OVERVIEW.md`, `02-USERS-AND-WORKFLOW.md`, `README.md`.

## 5. Two-way feedback (minister ⇄ constructor)
- Per-project conversation threads: a minister leaves feedback on their ministry's
  projects, the constructor replies; admin (then) / minister / constructor only.
- New `messages` collection; endpoints `GET /api/feedback`,
  `GET|POST /api/projects/:id/messages`; live `message` WebSocket event.
- New **Feedback** tab with chat-bubble thread modal.
- Verified: post/reply both directions; ministry isolation (403); PM blocked (403);
  empty message rejected (400).
- Files: `server.js`, `store.js`, `seed.js`, `public/js/app.js`, `public/css/style.css`.

## 4. Constructor expansion — projects, project managers, laborers & suppliers
- Constructor can **register projects** (choosing the owning ministry; auto-set as
  contractor), **create project managers** and **assign** them, and **approve/reject &
  assign laborers and suppliers** that arrive from an external sign-up app.
- New `participants` collection + verification status (verified/unverified/flagged);
  endpoints `/ministries`, `/projects/:id/team`, `/participants`,
  `/participants/:id/review`, `/participants/simulate`.
- New tabs: **Project Managers**, **Laborers & Suppliers**.
- Verified end-to-end (project create, PM create + assign, approve/reject, role guards).
- Files: `server.js`, `store.js`, `seed.js`, `public/js/app.js`.

## 3. Government / official redesign
- Full visual redesign: navy + gold theme, serif headings, ministry-building seal,
  left **sidebar** layout, restyled cards/tables/badges/feed, themed login.
- Files: `public/index.html`, `public/css/style.css`, `public/js/app.js`.

## 2. Moved to Desktop
- Project relocated to `C:\Users\hp\Desktop\construction-monitoring` as the single
  canonical copy; all future changes happen there.

## 1. Initial build — core system
- Real-time monitoring system for construction projects with 4 roles (admin, minister,
  constructor, project manager).
- Core **photo workflow**: PM uploads → constructor assesses → submitted to the relevant
  minister; ministry isolation enforced.
- Stack: Node + Express + JWT + multer + `ws`, JSON-file datastore, vanilla SPA.
- Verified end-to-end; documented in `docs/`.
