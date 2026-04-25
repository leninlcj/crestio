# Files (Session 14B) — followups for 14B-b and beyond

These items were deliberately deferred from 14B. Listed in priority order so
the next session can pick them off without re-reading the original brief.

## Office (Word/Excel/PowerPoint) conversion — 14B-b
The schema already supports it: `files.status` includes `'processing'`, and
`files.converted_pdf_path` is reserved. What's missing:
- Server-side converter. Options:
  - **CloudConvert / ConvertAPI** (third-party, fastest to ship, ~$0.01 per
    convert). Add a single env var, swap the upload flow to mark Office docs
    as `'processing'` then queue an async convert job.
  - **Vercel Sandbox + libreoffice** in a microVM (no per-convert vendor cost,
    bigger ops surface).
- Re-add Office MIME types to `lib/files.ts` PLAN_FILE_LIMITS for `team` and
  `growth`, set `officeConversion: true`.
- Re-enable the `accept=""` Office MIME types on the file picker for Team
  users in `components/files/FilesPanel.tsx`.
- Update upgrade copy on Solo: "Word, Excel, and PowerPoint uploads are
  available on Team. Upgrade to share editable documents." (currently the
  copy reads "Coming soon" for everyone.)

## 60-day cancellation retention sweep — cron
On cancel, files stay intact for 60 days then a cron deletes them.
- Add `pages/api/cron/files-purge-canceled-orgs.ts` (vercel cron schedule
  `0 4 * * *`).
- Logic: for each `organizations` row with `subscription_status='canceled'`
  and `subscription_updated_at < now() - 60 days`, soft-delete all files
  (sets `deleted_at`), then a follow-up sweep hard-deletes rows with
  `deleted_at < now() - 14 days` and removes the storage objects.
- Send a single warning email at day 53 ("your files will be deleted in 7
  days").

## Stale `'uploading'` row cleanup — cron
The signed-upload-URL handshake creates a `files` row with
`status='uploading'` before the bytes land. If the client crashes between
init and finalize, the row hangs around with `storage_used_bytes` charged
against the org.
- Cron: nightly delete `files` where `status='uploading' AND created_at <
  now() - 1 hour`. The AFTER DELETE trigger rolls back `storage_used_bytes`.

## Virus scanning — v2
v1 has no virus scan. The risk is low (parents only view, not download), but:
- Wire ClamAV via Vercel Sandbox or a third-party (e.g. VirusTotal API) at
  upload finalize. Mark scanned files with a `clean | suspicious` column;
  block view URL issuance for `suspicious`.

## Watermark in the rendered PDF (vs CSS overlay)
v1 watermarks via a CSS overlay on top of an iframe. A determined user can
strip this with browser devtools. To watermark the actual PDF bytes:
- On view-url issuance for Team plans, run pdf-lib server-side to overlay
  the watermark text on each page, then sign a URL to the watermarked copy
  (cached for 60s in Runtime Cache, regenerated on each new view).

## storage_used_bytes drift reconciliation — monthly
The `files_storage_used_bump` trigger keeps `organizations.storage_used_bytes`
in sync, but a weekly truth-check is cheap insurance:
- Cron: `UPDATE organizations o SET storage_used_bytes = (SELECT
  COALESCE(SUM(file_size_bytes), 0) FROM files WHERE organization_id = o.id
  AND deleted_at IS NULL);`

## Multipart upload at the API
We deviated to client→Storage signed-URL upload (see Session 14B brief).
If you ever want a single-endpoint multipart contract for tooling reasons,
add `formidable` and parse `req` with `bodyParser: false`. Keep the existing
client signed-URL flow as the default.

## Files in invoice-style emails
Today, files surface only in-app (parent portal Files tab + session detail).
A nice-to-have: when polished session notes are auto-shared with parents,
include "X files attached" in the email body with a link to the parent
portal session view.
