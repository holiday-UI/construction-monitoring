# Real-Time Monitoring System for Construction Projects

A web system for monitoring government construction projects in real time, with a
photo workflow that flows from the field all the way up to a government minister.

## Roles (users)

| Role | What they do |
|------|--------------|
| **Administrator** | Oversight + user management only: views the dashboard and all projects (read-only) and manages user accounts. Does not register projects, handle laborers/suppliers, or use feedback. |
| **Minister** (e.g. Minister of Health) | Logs in and sees **only their own ministry's** projects (e.g. hospitals) and the photos that have been submitted to them. |
| **Constructor / Contractor** | The central operator: **registers projects** (choosing the owning ministry), **adds project managers** and assigns them, **approves & assigns laborers and suppliers** from the external sign-up app, and **assesses photos** then submits approved ones to the minister. |
| **Project Manager** | On site. Takes/uploads photos and progress updates and **sends them to the constructor**. |

## The picture workflow

```
Project Manager            Constructor                 Minister
   takes photo  ──────►  assesses the photo  ──────►  views the photo
 (Pending review)        (approve / reject)          (Submitted to minister)
```

1. **Project Manager** uploads photos for a project → status `Pending constructor review`.
2. **Constructor** opens *Review Photos*, assesses each one and either:
   - **Approves** → status becomes `Submitted to minister` and it appears in that ministry's minister account, or
   - **Rejects** (with a reason).
3. **Minister** opens *Submitted Photos* and sees only the photos approved & submitted for their ministry.

Each photo is **geotagged**: the PM's device GPS + timestamp are captured at upload, shown
as coordinates + a **View on map** button (OpenStreetMap), and the minister sees a
**📍 Location verified** badge — proof the photo was taken on-site.

Everything updates **live** via WebSockets — a new upload or an approval appears on
other logged-in users' screens without refreshing.

## The laborer & supplier workflow

Laborers and suppliers register in a **separate external app** (to be linked). They
arrive as `pending` with a verification status (verified / unverified / flagged). The
**constructor** checks legitimacy, then **approves & assigns** each one to a project, or
rejects them. Until the external app is wired in, use the **"Simulate incoming sign-up"**
button on the *Laborers & Suppliers* page to generate applicants.

## Conversations (two channels per project)

Every project has two separate, live conversation threads:
- **Feedback** — minister ⇄ constructor (oversight). Ministry isolation applies.
- **Site Messages / Constructor Chat** — constructor ⇄ project manager, for discussing the
  **uploaded photos** (the PM channel shows the project's photo thumbnails above the chat).

Channels are isolated and access-controlled (only the relevant parties of each project can
read or post).

## Run it

```powershell
cd C:\Users\hp\Desktop\construction-monitoring
npm install        # one time
npm run seed       # loads demo users, projects + pending applicants
npm start          # http://localhost:3000
```

Then open http://localhost:3000

## Demo accounts (email / password)

| Role | Login |
|------|-------|
| Admin | `admin@cms.gov` / `admin123` |
| Minister of Health | `minister.health@cms.gov` / `minister123` |
| Minister of Education | `minister.edu@cms.gov` / `minister123` |
| Constructor | `constructor@buildco.com` / `build123` |
| Project Manager | `pm.john@buildco.com` / `pm123` |

### Try the full flow
1. Sign in as the **Constructor** — register a project (pick a ministry), add a project
   manager and assign them, and approve a laborer/supplier to the project.
2. Sign in as the **Project Manager**, open *Capture & Send Photos*, pick the
   project, attach an image and send.
3. Back as the **Constructor**, open *Review Photos*, approve it.
4. Sign in as the **Minister of Health**, open *Submitted Photos* — it's there.
   (The Minister of Education will **not** see it — ministry isolation.)

## Tech

- **Backend:** Node.js + Express, JWT auth, `multer` file uploads, `ws` for real-time.
- **Storage:** a JSON file (`data/db.json`) — pure JS, no database to install.
- **Frontend:** vanilla HTML/CSS/JS single-page app (official navy/gold theme), no build step.

## Documentation
Full docs are in the [`docs/`](docs/) folder — overview, roles & workflow, architecture,
API reference, testing, and deployment.

> Note: this is a self-contained demo/MVP. For production you'd move storage to a real
> database (e.g. Postgres), put uploads on object storage, serve over HTTPS, and link the
> external laborer/supplier sign-up app.
