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
| 10 | [Testing guide](10-testing-guide.md) | How to test the app |
| 12 | [Student login](12-student-login.md) | Student sign-in, dashboard, homework and hand-in for students |
| 13 | [Staging and Production](13-staging-and-production.md) | The two environments, daily routine on `staging`, going live, Vercel settings, admin passwords |
| 14 | [Lesson planner](14-lesson-planner.md) | Lesson library (import the term plan, upload worksheets), the batch page Term/Module lesson plan, sending Hw-1/2/3, corrected sheets |
| 15 | [Teacher login](15-teacher-login.md) | Inviting teachers, what a teacher sees (their own batches and students only), the database rules behind it |
| 16 | [Settings and Bulk import](16-bulk-import.md) | The Settings menu (Staff moved there), importing students, batches, teachers and class times from a spreadsheet, the standalone script |
| 20 | [Automation testing](20-automation-testing.md) | The automated tests in the `Automation Testing` folder: what they check, running them on GitHub before every go-live, reading a failure, adding a test |
| 22 | [Class notes and documents](22-class-notes.md) | Notes, documents and links on a batch (optionally for one lesson plan topic), the students' Class Notes/Documents tab, where the files go in Drive, the database rules |

## Process Improvement / Optimization

Reviews of how fast, safe and simple the app is, with the findings and the fixes to make. Each guide has a status line under every finding saying what has been built since, and the change log in `01-project-guide.md` records when each fix was built.

| # | Guide | Read it for |
|---|---|---|
| 17 | [Architecture review](17-architecture-review.md) | The 3 Nov 2026 review of how the app is built (findings F1–F24), what has been fixed since, and what to do next |
| 18 | [Database performance review](18-database-performance-review.md) | The 5 Nov 2026 check of all migration scripts (findings D1–D8): slow access rules for staff, missing indexes, the batch list view, the batch page's 1,000-row limit, timings before and after, and good practice for new scripts. D1–D4 built on 6 Nov as `20261106000001_faster_database.sql` |
| 19 | [Page speed review](19-page-speed-review.md) | The 3 Nov 2026 check of how fast pages feel (findings P1–P9): loading skeletons, fewer login checks, queries side by side, the dashboard, Vercel and Supabase regions, what not to do, and what has been done since |

## AI

Plans and guides for AI features, kept in `Help/AI/`. AI database scripts are kept in `supabase/migrations/AI/` (run them in date order together with the other scripts).

| # | Guide | Read it for |
|---|---|---|
| AI-01 | [AI plan: marking and revision pack builder](AI/01-ai-plan.md) | The plan agreed on 3 Nov 2026 (saved here 10 Nov): question bank with embeddings (Part 1), revision pack builder with RAG, tool use and an MCP server (Part 3), AI first-pass marking checked by teachers (Part 2). Versioning, run and permission rules, evals, costs and the six build stages |
| AI-02 | [Question bank](AI/02-question-bank.md) | Stage 1 step 1 (10 Nov 2026, written, not yet run on Staging): worksheet versions with questions and answers, approval by admins or teachers of that subject and year, frozen approved versions, keyword search as the retrieval baseline, the functions the app will call, and how to run it |

## The homework feature end to end

```
04 Enquiries ──► 07 Drive folder ──► 08 Hand-in link ──► 09 Marking
 (lead → student)  (per student)       (family uploads)    (staff mark, family sees result)
          set up once: 05 Google Drive setup · 06 Drive code
```

## Conventions

- **Names:** `NN-topic.md`, lower case with hyphens, no spaces, so they sort in reading order and link cleanly.
- **New guide:** take the next number, add a row to the right table above (reviews and optimization work go under **Process Improvement / Optimization**), and add a change log entry in `01-project-guide.md`.
- **Edit with care:** guides are only changed when asked; commit them with the change they describe.
