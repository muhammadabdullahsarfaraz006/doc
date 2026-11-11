# Submission

Status: **in progress — Phase 5 complete**

## Feature completion

| Feature | Status |
|---------|--------|
| Auth | Done |
| Workspace document CRUD | Done |
| Rich-text editor + autosave | Done |
| Sharing + Shared with Me | Done |
| Live collaboration + presence | Done (4B.1) |
| Comments / suggestions | Done (4B.2) |
| Advanced formatting (fonts, colors, layout, links, tables) | Done (Phase 5) |
| File import (TXT / Markdown) | Done |
| Version history | 4B.3 |
| Unregistered email invites | 4B.4 |
| Deployment / walkthrough | Dual-Vercel architecture prepared; CLI login required to finish deploy |

## Known limitations

- Collaboration requires the separate Hocuspocus service (`npm run collab`)
- Registered users only (no email invitations yet)
- Shared with Me uses a neutral owner label (no broad profile reads)
- Direct `document_members` owner mutation policies still exist alongside RPCs (app uses RPCs only)
- Suggestion accept uses sticky `application_id` + Yjs marker (not a single distributed ACID txn)
- Structural table edits may orphan comment/suggestion anchors
- No print layout / headers / footers / pagination
