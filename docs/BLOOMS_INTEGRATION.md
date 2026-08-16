# Credible Blooms → Florisynergy IPM

The Credible Blooms app's scouting module now writes to, and reads from, the
IPM portal. The legacy PHP endpoints (`save_scouting.php`, `getdwmrecords.php`)
are no longer used for scouting; varieties, chemicals and spray still go
through them.

## Why it is shaped this way

The app already knew how to capture a scouting walk. Rewriting it around the
portal's schema — foreign keys, batches, GPS verification — would have been a
large change to a working app for no field-visible benefit. So the portal
speaks the app's dialect instead:

| Concern | Decision |
| --- | --- |
| Two logins | Avoided. The scout signs into Blooms once; the app presents a service key and names the scout. The portal provisions that person as an employee on first sight, so records are attributed properly. |
| Names vs ids | The portal resolves free text (`"Greenhouse 01"`, `"Thrips"`) to its references, tolerating case, spacing, punctuation and zero-padding. Nothing is dropped for want of a match. |
| Reads | `GET /records` returns portal rows in the app's own JSON shape, so `ScoutingData.fromJson` and every screen built on it are untouched. |

## Endpoints

All under `/api/v1/integrations/blooms`, guarded by an `X-App-Key` header.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/session` | One scouting walk in, stored as one round. Returns the batch id, records accepted, recommendations raised, and any name that could not be placed. |
| `GET` | `/records` | Scouting records in the Blooms JSON shape. `days`, `limit`, `greenhouse_id`. |
| `GET` | `/health` | Cheap check that the URL and key are both good. |

Admin-only, behind a normal portal token (not the app key):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/unmatched` | Names seen on the wire that did not resolve, most frequent first. |
| `GET`/`POST`/`DELETE` | `/aliases` | Map a name onto the reference row it means, once and for all. |

## Setting it up

**1. Generate a key on the server** — not in a chat window, not in a commit:

```bash
openssl rand -hex 32
```

**2. Portal.** Put it in the server's `.env` next to `docker-compose.prod.yml`:

```
INTEGRATION_API_KEY=<the key>
```

Then `docker compose -f docker-compose.prod.yml up -d --build`. With the key
unset the integration stays closed and returns 503 — the right default for a
write path that carries no user token.

**3. App.** In `credible_blooms/.env` (git-ignored):

```
PORTAL_URL=https://your-portal-host
PORTAL_APP_KEY=<the same key>
```

**4. Check the link:**

```bash
curl -s -H "X-App-Key: <the key>" https://your-portal-host/api/v1/integrations/blooms/health
# {"ok":true,"scouting_records":1234}
```

## Name matching, in order

1. An alias an admin has recorded for this exact text.
2. An exact match on the normalised name — or code, for greenhouses.
   `"Greenhouse 01"`, `"greenhouse 1"`, `"GH01"` and `"gh-1"` are all the same block.
3. An unambiguous containment match, e.g. `"Thrips (western flower)"` → `Thrips`.
   If the text could mean two references, it deliberately matches neither.

A name that still does not resolve does **not** lose the record. It is saved
with the original text kept in the notes, the miss is returned to the app so
the scout sees it, and the name is logged with a hit counter under
`/unmatched`. Mapping it once via `/aliases` fixes every future submission.

## What ingest does with a round

One `POST /session` becomes one `batch_id` — a scouting round, the unit the
portal calls a scouting report. Every item becomes a record, and each record
runs the same threshold checks a natively captured one does, so an ingested
observation can raise a recommendation and a later round can close it.

Records arrive with `verification_method = "manual"`. Blooms captures no GPS
fix or QR scan, and claiming otherwise would corrupt the verification stats the
portal reports on.
