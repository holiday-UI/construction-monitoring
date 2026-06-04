# Running & Deploying

## Run locally (Windows / PowerShell)
```powershell
cd C:\Users\hp\construction-monitoring
npm install      # first time only
npm run seed     # load demo users + projects (resets data/db.json)
npm start        # serves http://localhost:3000
```
Open http://localhost:3000

> **Install note (this machine):** if `npm install` fails with
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (HTTPS is intercepted by a proxy/AV), run:
> ```powershell
> $env:NODE_OPTIONS="--use-system-ca"; npm install
> ```

## Demo accounts (email / password)
| Role | Login |
|------|-------|
| Admin | `admin@cms.gov` / `admin123` |
| Minister of Health | `minister.health@cms.gov` / `minister123` |
| Minister of Education | `minister.edu@cms.gov` / `minister123` |
| Constructor | `constructor@buildco.com` / `build123` |
| Project Manager | `pm.john@buildco.com` / `pm123` |

## Configuration (environment variables)
| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `dev-secret-change-me` | **Change in production** |

## Resetting data
`npm run seed` rewrites `data/db.json` with the demo set. To wipe uploaded photos,
empty the `uploads/` folder.

## Path to production
This is a self-contained MVP. To productionise:
1. **Database** — replace the JSON store (`store.js`) with PostgreSQL (the user's
   other apps use Node + Postgres).
2. **File storage** — move `uploads/` to object storage (e.g. S3 / Cloud storage)
   so photos survive redeploys.
3. **HTTPS & secrets** — serve behind TLS, set a strong `JWT_SECRET`.
4. **Hosting** — deploy to a Node host (e.g. Render, like the shop-inventory app);
   add a `render.yaml` / start command `node server.js`.
5. **Upgrade `multer`** to 2.x (1.x has known advisories).
6. **Link the external laborer/supplier app** — replace the `/participants/simulate`
   stand-in with a real intake (e.g. an authenticated `POST /api/external/participants`
   secured by an API key) so sign-ups flow in automatically.
7. Optional: email/SMS notifications when a photo is rejected (back to PM) or
   submitted (to the minister), and when an applicant is approved.
