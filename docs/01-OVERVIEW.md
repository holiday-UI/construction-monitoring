# Project Overview

## Real-Time Monitoring System for Construction Projects

A web system that lets a government track the progress of construction projects
(for example, hospital projects) in real time. Field photos flow from the site all
the way up to the responsible **government minister** through a structured review chain.

### The problem it solves
A minister (e.g. the **Minister of Health**) needs to check the status of multiple
ongoing projects (hospitals) without travelling to every site. Site staff capture
photos, the contractor verifies and assesses them, and only assessed photos are
forwarded to the minister — so the minister sees a vetted, organised view of every
project under their ministry.

### Who uses it (4 roles)

| Role | What they do |
|------|--------------|
| **Administrator** | Oversight + user management only. Views the dashboard and all projects (read-only) and creates/manages user accounts. Does **not** register projects, handle laborers/suppliers, or use feedback — those belong to the constructor. |
| **Minister** | Logs in and sees **only their own ministry's** projects and the photos submitted to them. (Each minister is tied to a ministry, e.g. Health, Education.) |
| **Constructor / Contractor** | The central operator. **Registers projects** (choosing the owning ministry), **creates project managers** and assigns them, **approves & assigns laborers and suppliers** from the external sign-up app, and **assesses photos** and submits approved ones to the minister. |
| **Project Manager** | On site. Captures/uploads photos and progress updates and **sends them to the constructor**. |

> **The constructor is the hub of day-to-day operations.** See
> [02-USERS-AND-WORKFLOW.md](02-USERS-AND-WORKFLOW.md) for the full breakdown of the
> constructor's responsibilities (projects, personnel, laborer/supplier approval).

### The picture workflow (the heart of the system)

```
 PROJECT MANAGER          CONSTRUCTOR                 MINISTER
   takes a photo  ─────►  assesses the photo  ─────►  views the photo
 status: pending          approve  →  submit          status:
 constructor review       reject   →  send back        submitted to minister
```

1. **Project Manager** uploads photos for a project → status `Pending constructor review`.
2. **Constructor** reviews each photo and either:
   - **Approves** it → status becomes `Submitted to minister`; it appears in that
     ministry's minister account, **or**
   - **Rejects** it with a reason.
3. **Minister** sees only the photos approved & submitted for *their* ministry.

### The laborer & supplier approval workflow
Laborers and suppliers register in a **separate external application** (e.g.
"WorkerConnect") that will be linked to this system. Each arrives with a
**verification status** (verified / unverified / flagged). The constructor's job is to:

```
 EXTERNAL APP            CONSTRUCTOR                      PROJECT
   sign-up    ─────►  check legitimacy + approve  ─────►  assigned to a project
 (pending)           (or reject with a reason)          (status: approved)
```

Until the external app is wired in, applicants are seeded and a **"Simulate incoming
sign-up"** button stands in for the live feed.

### Geotagged photo evidence
When a project manager takes a photo, the system captures the device's **GPS
coordinates + timestamp** and stores them with the photo. Every photo card shows the
coordinates and a **"View on map"** button (OpenStreetMap, no API key), and the
minister's view marks each photo **📍 Location verified**. This lets a minister confirm a
photo was genuinely taken on-site rather than reused. If location is denied/unavailable
the photo still uploads, marked "No location captured".

### Conversations (two channels per project)
Every project has two separate, live conversation threads:

- **Feedback** (minister ⇄ constructor) — a minister leaves oversight feedback on a
  project in their ministry and the constructor replies. *Feedback* tab.
- **Site Messages / Constructor Chat** (constructor ⇄ project manager) — the constructor
  and PM discuss the **uploaded photos**; this channel shows the project's photo
  thumbnails above the conversation. *Site Messages* tab (constructor) /
  *Constructor Chat* tab (PM).

The channels are isolated and access-controlled — only the relevant parties of each
project can read or post, and a message in one channel never appears in the other.

### Real-time
All changes (new upload, approval, progress update, new applicant, conversation message)
broadcast over **WebSockets**, so other logged-in users see updates live without
refreshing. A green "Live" indicator in the top bar shows the connection status.

### Look & feel
The interface uses an **official government theme** — navy + gold, serif headings, a
ministry-building seal, and a left sidebar layout.

### Status
Working MVP, tested end to end. See [05-TESTING.md](05-TESTING.md) for the verification runs.
