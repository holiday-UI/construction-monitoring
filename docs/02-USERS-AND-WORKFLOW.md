# Users & Workflow (detail)

## Roles and permissions

| Capability | Admin | Minister | Constructor | Project Manager |
|------------|:-----:|:--------:|:-----------:|:---------------:|
| See all projects (read-only) | ✅ | — | — | — |
| See own ministry's projects | — | ✅ | — | — |
| See assigned projects | — | — | ✅ (as contractor) | ✅ (as PM) |
| Register projects (+ pick ministry) | — | — | ✅ | — |
| Create / manage user accounts | ✅ (any role) | — | ✅ (project managers only) | — |
| Assign a project manager to a project | — | — | ✅ (own projects) | — |
| Approve / reject & assign laborers & suppliers | — | — | ✅ | — |
| Update project progress / status | — | — | — | ✅ |
| Upload (capture) photos | — | — | — | ✅ |
| Assess photos (approve/reject) | — | — | ✅ | — |
| Receive submitted photos | — | ✅ | — | — |
| Feedback channel (minister ⇄ constructor) | — | ✅ | ✅ | — |
| Site Messages channel (constructor ⇄ PM, re: photos) | — | — | ✅ | ✅ |

> **The administrator is intentionally limited to oversight + user management.** In the
> app they see only **Dashboard**, **Projects** (read-only) and **Users**. Registering
> projects, managing laborers/suppliers and feedback are the **constructor's** job.
>
> When a **constructor** registers a project they are automatically set as its
> contractor. They choose the **ministry** that owns the project, which is what gives
> that ministry's minister visibility of it.

**Visibility rules** (enforced server-side in `server.js → visibleProjects()`):
- **Admin** → every project.
- **Minister** → projects where `project.ministry === minister.ministry`.
- **Constructor** → projects where `project.contractorId === user.id`.
- **Project Manager** → projects where `project.projectManagerId === user.id`.

A minister only ever receives photos with status `submitted_to_minister` for their own
ministry — enforced in the `/api/pictures` and `/api/pictures/:id/view` routes.

## Photo status lifecycle

| Status | Meaning | Set by |
|--------|---------|--------|
| `pending_constructor` | Uploaded by PM, waiting for constructor | PM upload |
| `submitted_to_minister` | Constructor approved & forwarded | Constructor (approve) |
| `rejected` | Constructor rejected (with note) | Constructor (reject) |

## Laborer / supplier (participant) lifecycle

Laborers and suppliers come from an **external sign-up app**. Each carries a
`verification` value the constructor reviews before approving:
`verified` · `unverified` · `flagged`.

| Status | Meaning | Set by |
|--------|---------|--------|
| `pending` | Arrived from the external app, awaiting review | external app / simulate |
| `approved` | Constructor verified them and **assigned them to a project** | Constructor (approve) |
| `rejected` | Constructor rejected (with reason) | Constructor (reject) |

Approving **requires** choosing a project; a constructor can only assign to their own
projects. Ministers and project managers cannot access participant data.

## Conversations (two channels per project)

Every project has **two separate conversation threads**, each anchored to the project:

| Channel | Between | Sidebar tab(s) | Purpose |
|---------|---------|----------------|---------|
| `minister` | Minister ⇄ Constructor | **Feedback** (minister, constructor) | Oversight feedback from the minister; constructor replies |
| `pm` | Constructor ⇄ Project Manager | **Site Messages** (constructor), **Constructor Chat** (PM) | Discuss the **uploaded photos** — the PM channel shows the project's photo thumbnails above the conversation |

- The two channels are **fully isolated** — a message in one never appears in the other.
- **minister channel** visibility: minister → projects in their ministry; constructor → own projects.
- **pm channel** visibility: constructor → own projects; project manager → projects they are assigned to.
- Cross-access is blocked (all verified 403): Education minister → Health project; the
  wrong PM → another PM's project; minister → pm channel; PM → minister channel.
- Threads update live over WebSockets (`message` event).

## End-to-end example (hospital project)

1. **BuildCo (constructor)** opens *Projects → New project*, registers
   *"Nairobi General Hospital – New Wing"* and selects **Ministry of Health** as the owner.
   They are auto-set as the contractor.
2. **Constructor** opens *Project Managers*, adds **John Mwangi**, then uses *Assign PM*
   on the project to put John in charge.
3. **Constructor** opens *Laborers & Suppliers*, reviews incoming applicants, approves a
   verified mason and assigns them to the project (rejects a flagged one).
4. **John (PM)** opens *Capture & Send Photos*, selects the project, snaps a photo of the
   2nd-floor slab, adds a caption, sends. → `pending_constructor`.
5. **Constructor** opens *Review Photos*, adds an assessment note ("on schedule"), clicks
   **Approve & submit**. → `submitted_to_minister`.
6. **Minister of Health** opens *Submitted Photos* and sees the vetted photo with the PM's
   caption and the constructor's note. The **Minister of Education does not see it.**

## Per-role screens (sidebar tabs)

- **Admin:** Dashboard · Projects (read-only) · Users
- **Minister:** Dashboard · Submitted Photos · Projects · Feedback
- **Constructor:** Dashboard · Review Photos · Projects · Project Managers · Laborers & Suppliers · Feedback · Site Messages
- **Project Manager:** Dashboard · Capture & Send Photos · Constructor Chat · Projects
