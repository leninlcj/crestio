# Files (Session 14B) — manual test walkthrough

Walks through every code path before shipping. Run on a Solo and a Team org;
the cross-tier matrix is what the per-tier code is gated on.

## Pre-reqs
1. Migration `20260426_files.sql` applied (or run via Supabase SQL editor).
2. `files` Storage bucket created (private, 50 MB cap, no policies).
3. Two test orgs:
   - **Solo**: `plan_tier='solo'`, an active subscription (or trial).
   - **Team**: `plan_tier='team'`, an active subscription (or trial).
4. Sign-ins ready for: tutor (each org), org owner (each org), at least one
   parent linked to a Solo student and one linked to a Team student.

---

## Tutor uploads (Solo)

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | Open `/app/students/<student_id>` and click the **Files** tab. | Empty state copy: "No files yet…" | |
| 2 | Click **Upload files**, pick a 2 MB PDF. | Progress bar runs to 100%, then row appears with name, size, date. | |
| 3 | Pick a 30 MB PDF. | Local guard rejects with "File too large. Max 25 MB per file on this plan." | |
| 4 | Edit the local file picker accept attribute via DevTools and try a 1 MB `.docx`. | Server returns 415 + "Word, Excel, and PowerPoint uploads aren't available yet." | |
| 5 | Try uploading a 1 MB `.exe` (rename to `.pdf` first). | Server rejects: filename ends in `.exe` blocked by `isExecutableFilename`. | |
| 6 | Confirm the storage indicator at the top updates after step 2. | "X.X MB of 5 GB used" with a green progress bar. | |
| 7 | Click the **Files** nav link in the sidebar. | Hidden on Solo. Visiting `/app/files` directly shows the upgrade card. | |

---

## Tutor uploads (Team)

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | Open `/app/files`. | Two tabs: **All files**, **Org library**. Per-student filter dropdown. Search box visible. | |
| 2 | On the **Org library** tab, upload a 1 MB PDF. | Row appears in the library section. `is_org_library=true` server-side. | |
| 3 | Search for a substring of the filename. | List filters via ilike — only matching rows show. | |
| 4 | Pick a 60 MB PDF. | Local guard rejects: 50 MB max. | |
| 5 | Pick a 49 MB PDF. | Upload succeeds, but bucket-level rejection at 50 MB if you try to push beyond that. | |

---

## Tutor moves and renames (Solo or Team)

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | Click **Rename**, change the display name, blur. | Row updates inline, no modal. | |
| 2 | (Owner) click **Move**, pick a different student. | Row disappears from current student; appears under new student's Files tab. | |
| 3 | (Tutor, not owner) try to move. | Server returns 403 "Only owners can move files between students." | |
| 4 | Click **Delete** on a file. Confirm. | Row vanishes; storage indicator drops by that file's bytes. | |
| 5 | Refresh the page. | Deleted row stays gone (soft-delete). The bucket object is also removed. | |

---

## Parent view (linked to a student)

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | Sign in as the parent. Open `/parent/student/<student_id>`. | Student detail loads with the existing tabs **plus a Files tab**. | |
| 2 | Click **Files**. | Files grouped under "Session files" (any with `session_id`) and "Resources" (the rest). | |
| 3 | Click a PDF row. | New page at `/files/<id>`. Iframe with PDF, no toolbar download icons. | |
| 4 | (Solo) Confirm no watermark appears. | No diagonal repeating text overlay. | |
| 5 | (Team) Confirm watermark appears. | Faint diagonal text "{your-email} • {ISO timestamp}" repeated across the viewport. | |
| 6 | Right-click on the page. | Context menu suppressed. | |
| 7 | Press Cmd/Ctrl+S. | Toast: "Saving and printing aren't allowed." Save sheet does NOT open. | |
| 8 | Press Cmd/Ctrl+P. | Same toast. Print preview blocked. | |
| 9 | Press Cmd/Ctrl+A. | Same toast. | |
| 10 | Open DevTools (Cmd+Opt+I). | Iframe blurs, overlay says "Viewer not available with developer tools open." | |
| 11 | Close DevTools. | Blur clears, file is viewable again. | |
| 12 | Wait 65s on the same view. | Background fetch refreshes the signed URL silently — no expiry error. | |
| 13 | Click an image file. | `<img>` renders. Drag is disabled. Right-click suppressed. | |
| 14 | Try to navigate to a file from a *different* student you're not linked to. | 403 "Not authorized to view this file." | |

---

## Tutor view analytics

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | After steps above, the tutor visits the student's Files tab. | Each file's row shows "viewed N times" with the parent's view counted. | |
| 2 | Click "viewed N times". | Expanded list of viewers (email, role, timestamp). | |
| 3 | A non-uploader tutor in the same org visits the file detail. | API returns just the count, not the per-viewer breakdown. | |

---

## Tier enforcement (server-authoritative)

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | Solo client posts `is_org_library=true` to `/api/files/upload` via curl. | 403 `org_library_requires_team`. | |
| 2 | Solo client GETs `/api/files?search=foo`. | 403 "Search is a Team feature." | |
| 3 | Team client GETs `/api/files?search=foo` with no real match. | 200 with empty list. | |
| 4 | Cancel a Team subscription in Stripe (or set `subscription_status='canceled'` directly). | Existing files remain viewable. New uploads are blocked by the `org_billing_ok` RLS. | |
| 5 | Owner deletes a tutor's auth user. | Their uploaded files survive. `uploaded_by_user_id` becomes NULL. | |

---

## Storage cap

| # | Action | Expected | OK? |
|---|---|---|---|
| 1 | Push the org's `storage_used_bytes` to 80% of cap (upload several files). | Warn copy "You're nearing your storage limit…" appears below the progress bar. | |
| 2 | Push to 100%. | Upload button disabled with tooltip "Storage full. Delete files or upgrade plan." | |
| 3 | Delete a file. | Storage indicator drops; upload button re-enables. | |

---

## Audit log

```sql
SELECT
  fv.viewed_at,
  fv.viewer_role,
  au.email AS viewer_email,
  f.display_name,
  fv.ip_address
FROM public.file_views fv
JOIN auth.users au ON au.id = fv.viewer_user_id
JOIN public.files f ON f.id = fv.file_id
ORDER BY fv.viewed_at DESC
LIMIT 20;
```

Confirm the 20 most recent file views match the actions you just performed
(timestamps, viewer roles, IPs).

---

## Known limitations (carried into followups)

- Office (Word/Excel/PowerPoint) uploads return 415 with "Coming soon".
- Watermark is a CSS overlay, strippable via DevTools — see followups for
  baking it into the PDF bytes server-side.
- DevTools detection is a best-effort heuristic (window dimension delta).
- No virus scanning at upload.
- Stale `'uploading'` rows linger if a client crashes between init and
  finalize. A nightly cron will clean these up (followup).
