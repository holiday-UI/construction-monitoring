# Documentation — Real-Time Monitoring System for Construction Projects

All information about this project, in one place.

| Doc | What's inside |
|-----|---------------|
| [01-OVERVIEW.md](01-OVERVIEW.md) | What the system is, the 4 user roles, the photo workflow, real-time behaviour |
| [02-USERS-AND-WORKFLOW.md](02-USERS-AND-WORKFLOW.md) | Permissions matrix, visibility rules, photo status lifecycle, worked example |
| [03-ARCHITECTURE.md](03-ARCHITECTURE.md) | Tech stack, request flow, file map, data models, security notes |
| [04-API-REFERENCE.md](04-API-REFERENCE.md) | Every API endpoint + WebSocket events + curl examples |
| [05-TESTING.md](05-TESTING.md) | Verification results and how to re-test |
| [06-RUN-AND-DEPLOY.md](06-RUN-AND-DEPLOY.md) | How to run locally, demo logins, config, path to production |
| [CHANGELOG.md](CHANGELOG.md) | Activity log of all updates made to the system |

## One-line summary
Government construction-monitoring web app. A **Constructor** registers projects under a
ministry, adds project managers, and approves/assigns laborers & suppliers from an
external sign-up app. A **Project Manager** captures site photos → the **Constructor**
assesses and approves them → the responsible **Minister** (e.g. Minister of Health) sees
only their ministry's vetted photos. Photos are **geotagged** for on-site verification, and
each project has two live conversation channels (**minister ⇄ constructor** feedback and
**constructor ⇄ project manager** site messages). Official navy-and-gold theme, all in real time.

## Quick start
```powershell
cd C:\Users\hp\Desktop\construction-monitoring
npm start
```
Then open http://localhost:3000 — see [06-RUN-AND-DEPLOY.md](06-RUN-AND-DEPLOY.md) for logins.
