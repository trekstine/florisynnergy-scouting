# E-signing the approval sheet

A spray approval says a named person authorised putting a specific chemical, at
a specific dose, on a specific block. On paper that is a signature. Here it is
four things together:

1. a **drawn mark**, made with a finger, stylus or mouse;
2. a **re-entered PIN**, so the act of signing is authenticated and not merely
   the session;
3. **who, when, from where** — name, role, timestamp, device and IP;
4. a **SHA-256 fingerprint** of the programme content exactly as it stood.

The fourth is what makes the other three worth anything. A signature over a
document that can still change afterwards proves nothing.

> This is a business control, not a legal opinion. Whether an electronic
> signature satisfies a particular regulator or contract is a question for your
> own counsel.

## The three rules

**Signing re-authenticates.** A session left open on a shared office machine
must not be able to approve a spray, so the PIN is asked for again at the
moment of signing.

**Signing freezes.** Once a programme carries a live signature it cannot be
edited or deleted — the API refuses, not just the button. Otherwise a named
person would end up having approved something they never saw.

**Nothing is deleted.** A withdrawn approval is *voided* with a reason and
stays on the record, because somebody signing and then thinking better of it is
itself a fact worth keeping.

## What the fingerprint covers

Everything that changes what goes on the crop, what it costs, or when the block
can be re-entered and cut: the block and bed, the dates, coverage, water volume,
and per product the name, active ingredients, WHO class, RAC group, rate,
quantity, unit price, cost, PHI, REI and safe-harvest date — plus the total.

Deliberately **not** covered: comments typed after approval, and the
planned/applied/reviewed status. Neither changes what was authorised onto the
crop, and flagging them as tampering would train people to ignore the warning.

Products are sorted before hashing, so the same programme hashes the same
however the database returns the rows. Numbers are normalised — `1`, `1.0` and
`1.00` are the same dose and must not hash differently. Both properties are
pinned by tests, because a false tamper alarm is worse than no alarm.

## Signature lines

Configured per farm under **Settings → Approval signatures**. Each line has a
label, an optional hint printed beneath it, an optional role restriction, and
whether it is required. Retiring a line hides it from new sheets; sheets
already signed against it keep their signatures and still say what that person
was signing as.

A farm that has never configured anything gets three lines on first use:
Prepared by, Approved by (supervisors only), Received by.

## Once every required line is signed

The portal renders the sheet to PDF — the content, the marks as drawn, and the
fingerprint — and files it against the programme as a `signed_approval`
attachment. The e-filing copy is produced rather than remembered.

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/approvals/slots` | any signed-in user |
| `POST`/`PATCH`/`DELETE` | `/approvals/slots[/{id}]` | admin |
| `GET` | `/approvals/{type}/{id}` | any signed-in user |
| `POST` | `/approvals/{type}/{id}/sign` | the role the line requires |
| `POST` | `/approvals/{type}/{id}/void/{signature_id}` | admin, supervisor |
| `GET` | `/approvals/{type}/{id}/history` | any signed-in user — voided included |

`document_type` is `spray_program` today. The tables are not spray-specific, so
a scouting report or a recommendation can be signed the same way later.

## Deploying

`reportlab` is a new dependency, and `approval_slots` and `signatures` are new
tables — `create_all` makes them on boot, so no migration step. Rebuild the API
image rather than restarting the container:

```bash
docker compose -f docker-compose.prod.yml up -d --build api
```
