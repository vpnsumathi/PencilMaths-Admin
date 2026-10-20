# PencilMaths-Admin — Help: Enquiries (leads)

> Built 11 October 2026 as Phase 1 of the WhatsApp homework feature (every student starts as a lead).
> See `03-core-admin-screens.md` for the shared building blocks it reuses, and `02-database-supabase.md` for the tables.

---

## Contents

1. [What it does](#1-what-it-does)
2. [How a lead moves through the system](#2-how-a-lead-moves-through-the-system)
3. [Why each part exists](#3-why-each-part-exists)
4. [Folder structure and why](#4-folder-structure-and-why)
5. [Code overview, file by file](#5-code-overview-file-by-file)
6. [EnquiryForm vs [id]/page.tsx](#6-enquiryform-vs-idpagetsx)
7. [Database tables used](#7-database-tables-used)
8. [How to test](#8-how-to-test)
9. [Troubleshooting](#9-troubleshooting)
10. [What comes next](#10-what-comes-next)

---

## 1. What it does

Manages **leads**: families who have asked about tutoring but aren't students yet. Staff can add a lead, move it through the sales stages, see a history of every change, and with one click **convert** a confirmed lead into a student.

---

## 2. How a lead moves through the system

```
Add enquiry ──► New ──► Assessment sent ──► Assessment returned ──► Results shared ──► Confirmed
                  │                                                                     │
                  └──────────────► Not proceeding (any time)                             ▼
                                                                         Convert to student ──► Enrolled
                                                                                 │
                                                                     Student created (family, parent,
                                                                     subjects) ──► choose batches
```

**Rules:**
- **Enrolled** can only be reached by converting, so every enrolled lead has a real student.
- A converted lead is **locked**: its stage can't be changed back.
- Leads are never deleted; lost ones are marked **Not proceeding**, which keeps conversion figures honest.

---

## 3. Why each part exists

| Part | Why it's needed |
|---|---|
| **List page with stage tabs** | See at a glance who is waiting. "Open" is the working list; other tabs answer "who did we lose?" |
| **"In stage" column** | Leads go cold; days in the current stage show who needs a follow-up. The dashboard flags leads waiting 7+ days. |
| **Add / edit form** | Captures the child, parent contact, subjects wanted, and assessment score and comments. |
| **Stage card** | **Move to next →** is the common action; the dropdown handles exceptions (skip a stage, Not proceeding). |
| **Convert to student** | No re-typing: child, parent and subjects become a student in one step. Phase 3 will also create the Drive folder here. |
| **History** | Who moved the lead and when: for follow-ups, accountability and future conversion reports. |
| **Shared stage list** (`lib/options.ts`) | Stage names and colours defined once, so the list, lead page and dashboard always agree. |

---

## 4. Folder structure and why

```
web/src/
├── app/
│   └── (portal)/                ← staff-only area: one layout checks sign-in + staff and adds the sidebar
│       └── enquiries/           ← the address /enquiries
│           ├── page.tsx         ← /enquiries: the list
│           ├── new/page.tsx     ← /enquiries/new: add a lead
│           ├── [id]/page.tsx    ← /enquiries/<id>: one lead
│           ├── EnquiryForm.tsx  ← form shared by "new" and "[id]"
│           └── actions.ts       ← server code that changes data
├── components/                  ← UI pieces used by many sections (Alerts, Field, StatusBadge, ui.module.css)
└── lib/                         ← non-UI helpers (options, form, format, supabase)
```

| Choice | Reason |
|---|---|
| **Inside `(portal)`** | Brackets group pages without changing the address. Everything inside gets the staff-only check and sidebar from one layout. |
| **One folder per address** | In Next.js, folders are web addresses: `enquiries/new/page.tsx` → `/enquiries/new`. |
| **`[id]` folder** | Square brackets mean "any value here": one page serves every lead and reads which one from the address. |
| **Form and actions next to the pages** | Everything for one feature lives in one folder; change or remove it without touching anything else. |
| **Shared pieces in `components/` and `lib/`** | Enquiries reuses alerts, fields, badges, styles and form helpers, so the section is only 6 files. |
| **Same layout as Students, Teachers, Batches** | Learn one section, know them all: `page`, `new`, `[id]`, `Form`, `actions`. |

---

## 5. Code overview, file by file

### `lib/options.ts` (additions)
- `ENQUIRY_STAGES`: the 7 stages in order with labels; keys match the database's `enquiry_stage` list.
- `OPEN_STAGES`: stages that count as open. Drives the default tab, the next-step button and Convert.
- `stageTone()`: badge colour: green = Enrolled, red = Not proceeding, blue = open.

### `enquiries/actions.ts` (server only)
| Action | What it does |
|---|---|
| **`saveEnquiry`** | Checks fields (names, year, parent, email, score 0–100, at least one subject) → inserts (no `id`) or updates (has `id`) → replaces subjects → for a new lead writes the first "New" history row → opens the lead with a green message |
| **`setStage`** | Updates `stage` and `stage_changed_at` only if not converted (`.is('student_id', null)`) → writes a history row with `by_staff` → refuses "Enrolled" |
| **`convertToStudent`** | Loads the lead and subjects → if already converted, opens that student → calls the **`save_student`** database function (student, family, parent and subjects together, all or nothing) → marks the lead Enrolled with its `student_id` and adds history → opens the student so you can choose batches |

### `enquiries/EnquiryForm.tsx`
Server-rendered form in four cards: Child, Parent, Subjects wanted (tick boxes), Assessment. Sends to `saveEnquiry`.

### `enquiries/page.tsx` (list)
- Reads `?stage=` from the address; default "open" = every stage except Enrolled and Not proceeding.
- `enquiry_subjects(subjects(name))` fetches subject names in the same query.
- Days in stage are worked out from `stage_changed_at`.
- Tabs are plain links, so each view has its own bookmarkable address.

### `enquiries/new/page.tsx`
Loads active subjects and shows an empty `EnquiryForm`.

### `enquiries/[id]/page.tsx` (one lead)
- Loads the lead, its history (with staff names via `staff(full_name)`) and subjects at once.
- **Stage card:** converted → link to the student; otherwise **Move to next →**, **Convert to student**, and the stage dropdown.
- Then the pre-filled `EnquiryForm`, then the history, newest first.

### Changes elsewhere
- `components/AppShell.tsx`: Enquiries link set to `ready: true`.
- `(portal)/_dashboard/data.ts`: "waiting 7+ days" items link to the lead.

---

## 6. EnquiryForm vs [id]/page.tsx

`EnquiryForm.tsx` is a **reusable building block** (just the form). `[id]/page.tsx` is a **whole page** at an address that *uses* the form as one of its parts.

| | `EnquiryForm.tsx` | `[id]/page.tsx` |
|---|---|---|
| What it is | A component | A page at `/enquiries/<id>` |
| Has a web address? | No | Yes (a `page.tsx` inside `[id]`) |
| Loads data? | No: shows what it's given | Yes: lead, history, subjects |
| Shows | The four form cards + Save | Back link, title, badge, messages, stage card, **the form**, history |
| Used by | `new/page.tsx` (empty) and `[id]/page.tsx` (filled in) | Next.js, when someone visits the address |

```
[id]/page.tsx                                   new/page.tsx
 ├─ loads lead, history, subjects                ├─ loads subjects
 ├─ title · badge · messages                     ├─ "Add enquiry"
 ├─ Stage card                                   └─ <EnquiryForm subjects={…} />   (empty)
 ├─ <EnquiryForm enquiry={…} subjects={…} />  (filled in)
 └─ History
```

**Why separate:** the form is written once and used twice. With an `enquiry` it fills in the fields and adds a hidden `id` → `saveEnquiry` **updates**; with none it starts empty → `saveEnquiry` **inserts**. Students, Teachers and Batches follow the same pattern.

---

## 7. Database tables used

All existed already (file 1 of the migrations); no new database script was needed.

| Table / function | Role |
|---|---|
| `enquiries` | One row per lead: details, stage, `stage_changed_at`, and `student_id` once converted. Code auto-generated (`E-201`, …). |
| `enquiry_subjects` | Subjects each lead wants |
| `enquiry_events` | History of stage changes (`stage`, `at`, `by_staff`) |
| `save_student()` | Creates the student during conversion |

---

## 8. How to test

| Do this | Expected |
|---|---|
| **Enquiries → Add enquiry**, Year 7, Maths ticked, save | Lead page opens; history shows "New" |
| **Move to Assessment sent →** | Green message, new history row, badge changes |
| Enter score 75 → **Save changes** | Saved |
| **Convert to student** | Student page opens with Maths and the parent filled in; the lead shows "Converted to a student" |
| **Enrolled** tab | The lead is listed |
| Dashboard | Open enquiries and pipeline update; enquiry items in "Needs attention" open the lead |

---

## 9. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Sidebar still shows Enquiries "Soon" | `ready: false` in `AppShell.tsx` | Set `ready: true` |
| `/enquiries` gives 404 | `enquiries/page.tsx` missing | Create the list page |
| "The default export is not a React Component in /enquiries/page" | The page was loaded while the new file was still empty | Paste the code, save, then Ctrl+Shift+R; if needed restart (`Ctrl+C`, `npm run dev`) |
| Convert says "Add at least one subject" | The lead has no subjects | Tick a subject, save, convert again |

---

## 10. What comes next

| Phase | Connects to Enquiries |
|---|---|
| 2. Connect Google Drive | Setup only |
| 3. Drive folder on convert | `convertToStudent` also creates the student's Drive folder |
| 4. WhatsApp hand-in link | The new student gets their link straight after conversion |
| Later | Conversion reports from `enquiry_events` (average days to enrol, conversion by `source`) |
