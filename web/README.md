# FloriSynergy Scouting — Admin Portal (Next.js)

Manager-facing web portal for the FloriSynergy Scouting platform: farm mapping,
pest/disease **pressure maps**, the scouting feed, the **recommendations (Action)
board**, spray cost control, analytics, reference data, and workforce.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · TanStack Query ·
react-leaflet + Esri World Imagery · lucide-react. Auth = httpOnly cookie holding
the FastAPI JWT, proxied server-side via `/api/proxy/[...path]` — the token is
never exposed to the browser.

## Pages

| Route              | What it does                                                        |
|--------------------|---------------------------------------------------------------------|
| `/dashboard`       | KPIs, pressure breakdown, latest recommendations                    |
| `/map`             | Live satellite **pressure heatmap**; click a greenhouse for detail  |
| `/mapping`         | Draw greenhouse geofences (rectangle + freeform), manage list       |
| `/scouting`        | Scouting feed with greenhouse/type filters                          |
| `/recommendations` | **Action board** (open→planned→actioned→resolved) + assign chemical |
| `/spray`           | Spray applications + cost-by-greenhouse                             |
| `/analytics`       | Pest × greenhouse heat matrix + scout accountability                |
| `/reference`       | Varieties, pests, diseases (with ETL thresholds), chemicals         |
| `/workforce`       | Scouts/supervisors/admins; add & activate                           |

## Getting started

Requires the [backend](../backend) running (default `http://localhost:8000`).

```bash
cd web
cp .env.example .env.local      # set FLORI_API_URL if not localhost:8000
npm install
npm run dev                     # http://localhost:3000
```

Sign in with a seeded manager (scouts are blocked — they use the mobile app):

| Role       | device_identifier | PIN  |
|------------|-------------------|------|
| Admin      | `web-admin`       | 0000 |
| Supervisor | `sup-device-01`   | 1234 |

## Config

| Env var         | Default                 | Notes                                  |
|-----------------|-------------------------|----------------------------------------|
| `FLORI_API_URL` | `http://localhost:8000` | Server-only; never exposed to browser. |

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm run lint` · `npm run typecheck`
