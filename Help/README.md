# PencilMaths-Admin — Help guides

Start here. The guides are numbered in reading order.

| # | Guide | Read it for |
|---|---|---|
| 01 | [Project guide](01-project-guide.md) | The main living guide: what the project is, setup on a new computer, everyday workflow, Git, login page, design system, decisions, roadmap, change log |
| 02 | [Database (Supabase)](02-database-supabase.md) | What each database script does and what every table is for |
| 03 | [Core admin screens](03-core-admin-screens.md) | Staff roles, Subjects and curriculum, Teachers, Batches, Students, the analytics dashboard, deploying to Vercel, shared building blocks |
| 04 | [Enquiries](04-enquiries.md) | Leads: stages, history, convert to student |
| 05 | [Google Drive: setup](05-gdrive-setup.md) | Google Cloud steps, secrets (local and Vercel), checklist, connection test |
| 06 | [Google Drive: code](06-gdrive-code.md) | How `lib/google/drive.ts` and the test page work |
| 07 | [Google Drive: student folders](07-gdrive-student-folders.md) | A Drive folder for every student (Phase 3) |
| 08 | [Homework hand-in link](08-homework-handin-link.md) | The WhatsApp link families use to upload homework into Drive (Phase 4) |
| 09 | [Setting and marking homework](09-homework-marking.md) | Set homework, see submissions, enter marks (Phase 5) |

## The homework feature end to end

```
04 Enquiries ──► 07 Drive folder ──► 08 Hand-in link ──► 09 Marking
 (lead → student)  (per student)       (family uploads)    (staff mark, family sees result)
          set up once: 05 Google Drive setup · 06 Drive code
```

## Conventions

- **Names:** `NN-topic.md`, lower case with hyphens, no spaces, so they sort in reading order and link cleanly.
- **New guide:** take the next number, add a row to the table above, and add a change log entry in `01-project-guide.md`.
- **Edit with care:** guides are only changed when asked; commit them with the change they describe.
