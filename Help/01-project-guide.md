# PencilMaths-Admin — Project Help Guide

> **Living document.** Update this file every time you change the project (see [How to update this guide](#15-how-to-update-this-guide)).
> Keep it in the repository at `PencilMaths-Admin/Help/01-project-guide.md` and commit it together with the change it describes.

| | |
|---|---|
| **Last updated** | 10 November 2026 |
| **Current stage** | Pieces 1–10 done, plus Students, Teachers, Batches, dashboard, Enquiries and the WhatsApp homework feature (Phases 1–5). Teacher login, Settings menu and Bulk import (Staging). Next: staff invites (Part 9.3) and audit log. |
| **Where this guide lives** | `PencilMaths-Admin/Help/01-project-guide.md` (master copy). A copy is kept in the Claude project's files. |
| **Reference project** | `pencil-maths-portal-phase1/pencil-portal` (the original phase 1 portal, used as a guide; we do not edit it) |

---

## Contents

1. [What this project is](#1-what-this-project-is)
2. [Key business terms](#2-key-business-terms)
3. [Technology used and why](#3-technology-used-and-why)
4. [Project folder layout](#4-project-folder-layout)
5. [Setting up on a new computer](#5-setting-up-on-a-new-computer)
6. [The database (Supabase)](#6-the-database-supabase)
7. [The web app (Next.js)](#7-the-web-app-nextjs)
8. [The login page in detail](#8-the-login-page-in-detail)
9. [Design system: colours and layout rules](#9-design-system-colours-and-layout-rules)
10. [Everyday workflow](#10-everyday-workflow)
11. [Git: saving your work](#11-git-saving-your-work)
12. [Troubleshooting](#12-troubleshooting)
13. [Decisions we made and why](#13-decisions-we-made-and-why)
14. [Roadmap: what comes next](#14-roadmap-what-comes-next)
15. [How to update this guide](#15-how-to-update-this-guide)
16. [Glossary of technical terms](#16-glossary-of-technical-terms)
17. [Change log](#17-change-log)

---

## 1. What this project is

**PencilMaths-Admin** is the internal web portal for the Pencil Maths operations team. Pencil Maths is a tutoring business that teaches children (school years 3–13) in small groups.

**Who uses it:** office staff only, not parents, students or (yet) teachers. Every staff member has one of three roles:

| Role | Who | Purpose |
|---|---|---|
| `admin` | Owners / managers | Everything, including managing staff accounts |
| `operations` | Office team | Day-to-day work: students, enquiries, class updates |
| `head_teacher` | Lead teacher | Assigning teachers, checking lesson plans and marks |

**What the portal will do** (based on the phase 1 reference project):

| Module | What it does | Status in PencilMaths-Admin |
|---|---|---|
| Sign in | Invite-only login, password reset | Login page designed; not yet connected |
| Dashboard | Student counts by status; students waiting for a teacher or batch | Not started |
| Students | List, search, filters, profile (overview, family, notes), add/edit | Not started |
| Teachers | List, profile, add/edit | Not started |
| Batches | Small groups with weekly class times, lesson plan, attendance, homework | Not started |
| Class updates | Logging each class a teacher reports | Not started |
| Enquiries | A parent's journey from first contact to enrolment | Not started |
| Import | Loading students from a spreadsheet (.xlsx or CSV) | ✅ Settings › Bulk import (Staging), guide 16 |
| **Admin module** | Manage staff, subjects, curriculum; audit log | Planned (main goal of this project) |

---

## 2. Key business terms

Understanding these words makes the rest of the project easy to follow.

| Term | Meaning | Example |
|---|---|---|
| **Student** | A child being tutored. Has a year group (3–13) and a status. | Aisha Khan, Year 9 |
| **Student status** | Where the student is in their journey: `active`, `trial`, `paused`, `leaving`, `left` | Trial = first few weeks |
| **Family** | Groups brothers and sisters together. | "Khan family" |
| **Guardian** | A parent or carer's contact details, stored on the family (not the student) so a future teacher login can be blocked from seeing them. | Mother, phone, email |
| **Subject** | `maths`, `science`, `english`, `eleven_plus` (11+ Prep) | Maths |
| **Enrolment** | **One student taking one subject.** A student taking Maths and Science has two enrolments. Each enrolment can have a teacher and a batch. | Aisha → Maths |
| **Teacher** | Teaches one subject to a range of year groups. | Maths, Years 7–11 |
| **Batch** | A small class (up to about 3 students) with one teacher, one subject and fixed weekly times. | B-004: Maths Year 9, Tue & Thu 17:00 |
| **Batch slot** | One weekly class time of a batch (weekday + start time, UK time). | Tuesday 17:00 |
| **Curriculum topic** | A topic in the default lesson plan for a subject. When a batch is created, it gets its own copy. | "Pythagoras' theorem" |
| **Class session** | One class that actually happened, with attendance. | B-004 on 3 Oct 2026 |
| **Enquiry** | A parent asking about lessons, before the child is a student. | E-201 |
| **Staff** | A person who can sign in to the portal. | You |

**The most important idea:** *enrolment* vs *batch*. An enrolment says "this student takes this subject". A batch is "the group they sit in, with a teacher and class times". A student can be enrolled but not yet in a batch: the dashboard highlights these students.

---

## 3. Technology used and why

| Tool | What it is | Why we use it | Installed how |
|---|---|---|---|
| **Node.js (LTS)** | Runs JavaScript on your computer | Needed to run Next.js | Installer from nodejs.org |
| **npm** | Downloads libraries | Comes with Node.js | Automatically with Node |
| **Git** | Tracks every change to the code | Undo mistakes, see history, share code | Installer from git-scm.com |
| **VS Code** | Code editor with a built-in terminal | Edit files and run commands in one window | Installer from code.visualstudio.com |
| **Next.js 15** | Framework for building web apps with React | Pages, routing, server code in one project | Downloaded by `create-next-app` into the project |
| **React 19** | Library for building user interfaces | Comes with Next.js | Downloaded with Next.js |
| **TypeScript** | JavaScript with types | Catches mistakes before the app runs | Chosen during `create-next-app` |
| **ESLint** | Code checker | Warns about mistakes as you type | Chosen during `create-next-app` |
| **Supabase** | Hosted Postgres database + user login service | Database, sign-in and security in one place | **Website, nothing to install** (supabase.com) |
| **Plain CSS / CSS Modules** | Styling | Simple, no extra tools to learn | Built into Next.js |

> **Note:** Next.js and Supabase are *not* installed on the computer like normal programs. Next.js is downloaded into the project's `web\node_modules` folder by npm. Supabase runs in the cloud and you use it through its website.

---

## 4. Project folder layout

```
PencilMaths-Admin/                 ← the project folder (one Git repository)
├── .git/                          ← Git's history (hidden; never edit)
├── Help/                          ← help guides
│   ├── README.md                  ← index of all guides (start here)
│   ├── 01-project-guide.md        ← this guide (setup, workflow, decisions, roadmap, change log)
│   ├── 02-database-supabase.md    ← database scripts and tables
│   ├── 03-core-admin-screens.md   ← Staff, Subjects, Teachers, Batches, Students, dashboard, Vercel
│   ├── 04-enquiries.md            ← Enquiries (leads)
│   ├── 05-gdrive-setup.md         ← Google Drive: Google Cloud setup and secrets
│   ├── 06-gdrive-code.md          ← Google Drive: how the code works
│   ├── 07-gdrive-student-folders.md ← a Drive folder per student
│   ├── 08-homework-handin-link.md ← WhatsApp hand-in link (families upload homework)
│   └── 09-homework-marking.md     ← set and mark homework on the batch page
├── supabase/
│   ├── migrations/                ← database scripts, run in order
│   │   ├── 20260928000001_schema.sql
│   │   ├── 20260928000002_views_and_functions.sql
│   │   ├── 20260928000003_security.sql
│   │   ├── 20260928000004_student_functions.sql
│   │   └── AI/                    ← AI database scripts (question bank, …), run in date order with the others
│   └── seed.sql                   ← subjects + curriculum topics (reference data)
└── web/                           ← the Next.js app
    ├── package.json               ← app's name, commands and libraries
    ├── package-lock.json          ← exact library versions (commit it)
    ├── node_modules/              ← downloaded libraries (NOT committed; recreate with npm install)
    ├── .gitignore                 ← tells Git which files to skip
    ├── next.config.ts             ← Next.js settings
    ├── tsconfig.json              ← TypeScript settings (defines the @/ shortcut)
    ├── public/                    ← images and files served as-is
    └── src/
        ├── app/                   ← every folder here is a web address (route)
        │   ├── layout.tsx         ← frame around every page (font, title)
        │   ├── page.tsx           ← "/" home page; currently redirects to /login
        │   ├── globals.css        ← colours (design tokens) and base styles
        │   ├── favicon.ico        ← browser tab icon
        │   └── login/             ← "/login"
        │       ├── page.tsx       ← page layout + brand panel
        │       ├── LoginForm.tsx  ← the form (runs in the browser)
        │       ├── actions.ts     ← runs on the server when the form is sent
        │       └── login.module.css ← login page styles
        └── components/
            └── icons.tsx          ← shared line icons
```

**Rule of thumb:** a folder inside `src/app` with a `page.tsx` becomes a web page. `src/app/login/page.tsx` → `http://localhost:3000/login`.

**Why the app lives in `web/`:** npm does not allow capital letters in app names, so `PencilMaths-Admin` cannot be the app folder itself. Keeping the app in `web/` also leaves room for `supabase/` and `Help/` beside it.

---

## 5. Setting up on a new computer

Follow these steps in order. Windows is assumed.

### 5.1 Install the tools

1. **Node.js LTS** from https://nodejs.org (accept defaults).
2. **Git** from https://git-scm.com (accept defaults).
3. **Visual Studio Code** from https://code.visualstudio.com.

Check in PowerShell (or the VS Code terminal):

```powershell
node -v          # e.g. v22.x.x
npm -v           # e.g. 10.x.x
git --version    # e.g. git version 2.x
```

If one says *"not recognized"*, close and reopen the terminal; if it still fails, reinstall that tool.

First-time Git setup (once per computer):

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 5.2 Get the project

- **If the project is on GitHub** (later): `git clone <repository-url>`
- **If you have the folder:** copy `PencilMaths-Admin` to your computer.

Open it in VS Code: **File → Open Folder → PencilMaths-Admin**, then click **Yes, I trust the authors**.

### 5.3 Install the app's libraries

Open the terminal (**Ctrl+`**) and run:

```powershell
cd web
npm install
```

This recreates `node_modules` from `package.json` and `package-lock.json`.

### 5.4 Set up the database

See [section 6](#6-the-database-supabase). A new developer normally uses their **own** Supabase project for practice, so they never damage real data.

### 5.5 Connection settings (from Piece 5)

From Piece 5 onwards the app needs a file `web\.env.local` with your Supabase details. This file is **never committed to Git** (it holds keys; `.env*` is already in `web/.gitignore`).

**Step 1. Install the Supabase libraries** (in `PencilMaths-Admin\web`):

```powershell
npm install @supabase/supabase-js @supabase/ssr
```

`supabase-js` talks to the database; `ssr` keeps the signed-in user in browser cookies so server code can see who they are. These are the same libraries the reference project uses.

**Step 2. Copy your project's address and public key**

1. Open https://supabase.com/dashboard and choose the **PencilMaths-Admin** project.
2. Click **Connect** at the top (or **Project Settings → API Keys**).
3. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
4. Copy the **anon / publishable** key (older projects call it `anon` `public`; newer ones show a key starting `sb_publishable_`). Either works.

> ⚠️ Never copy the **service_role** / **secret** key into the app. It ignores all security rules.

**Step 3. Create `web\.env.local`**

In VS Code, right-click the `web` folder → **New File** → `.env.local`, and paste (with your own values):

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-the-anon-or-publishable-key-here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

No quotes and no spaces around `=`. `NEXT_PUBLIC_` means the value may be sent to the browser, which is safe for these three.

**Step 4. Add the server connection helper**

Create `web\src\lib\supabase\server.ts` (same as the reference project):

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieList = { name: string; value: string; options: CookieOptions }[];

// Use this in server code (pages, server actions) to talk to Supabase as the signed-in user.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list: CookieList) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component; the middleware refreshes the session instead */ }
      },
    },
  });
}
```

**Step 5. Restart the app.** `.env.local` is only read when the app starts: press **Ctrl+C** in the app terminal, then `npm run dev` again.

**Step 6. Check the connection** with a temporary page `web\src\app\check\page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';

// Temporary page to prove the app can reach Supabase. Delete after Piece 5.
export default async function Check() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('subjects').select('name');
  if (error) return <p>Not connected: {error.message}</p>;
  return <p>Connected to Supabase. Subjects visible: {data.length}</p>;
}
```

Open http://localhost:3000/check (type the address directly; the home page still goes to `/login`).

| You see | Meaning |
|---|---|
| `Connected … Subjects visible: 0` | ✅ Working. It shows 0 because row-level security (section 6.7) only lets signed-in staff read subjects. You will see 4 after Piece 6 (real sign-in). |
| `Invalid API key` | Wrong key copied, or the app was not restarted after editing `.env.local` |
| `fetch failed` / `ENOTFOUND` | Wrong Project URL, or no internet |
| `supabaseUrl is required` | `.env.local` is missing, misnamed, or not in the `web` folder |

**Step 7. Save your work.** Run `git status` and make sure `.env.local` is **not** listed (it must stay private). Then commit (section 11.2), e.g. `Connect app to Supabase`.

### 5.6 Run the app

```powershell
cd web          # if not already there
npm run dev
```

Open http://localhost:3000. You should be taken to the login page.

---

## 6. The database (Supabase)

### 6.1 Create the Supabase project

1. Sign up at https://supabase.com.
2. **New project**
   - **Name:** `PencilMaths-Admin` (our development project)
   - **Database password:** click **Generate** and store it safely (password manager).
   - **Region:** London (West EU / eu-west-2) — keeps UK pupils' data in the UK.
   - **Plan:** Free (for development)
3. Wait 1–2 minutes for it to finish setting up.

### 6.2 Run the database scripts

Run each file **once**, **in this order**, using **SQL Editor → New query → paste → Run**:

| Order | File | What it creates |
|---|---|---|
| 1 | `migrations/20260928000001_schema.sql` | All 20 tables, value lists (enums), ID number sequences, triggers that keep data consistent |
| 2 | `migrations/20260928000002_views_and_functions.sql` | Summary views (`student_list`, `student_stats`, `batch_list`) and `expected_classes()` |
| 3 | `migrations/20260928000003_security.sql` | Row-level security: only active staff can read or change anything |
| 4 | `migrations/20260928000004_student_functions.sql` | `save_student()` (saves a student, guardian and subjects in one go), "student left" trigger, `teacher_list` view |
| 5 | `seed.sql` | Reference data: 4 subjects and 54 curriculum topics |

How to copy a file: open it in VS Code → **Ctrl+A** → **Ctrl+C** → paste into the SQL Editor with **Ctrl+V** → **Run**. Wait for *"Success. No rows returned"* before the next file.

If Supabase warns about tables without row-level security while running file 1, choose to run anyway: file 3 switches security on.

### 6.3 What `seed.sql` contains (and why we ran it)

`seed.sql` holds **reference data only**: no students, teachers, parents or staff. It is safe to run more than once (existing rows are skipped).

- **Subjects (4):** Maths, Science, English, 11+ Prep. **Required**: you cannot save a teacher or student without a subject.
- **Curriculum topics (54):** Maths 16, Science 14, English 12, 11+ Prep 12. Copied into each new batch as its lesson plan.

> **To do:** the topics are a generic UK curriculum written by the original developer. Ask the person who owns the teaching plan to review them.

### 6.4 Check the database is correct

Run in a new SQL query:

```sql
-- Expect: BASE TABLE 20, VIEW 4
select table_type, count(*)
from information_schema.tables
where table_schema = 'public'
group by table_type;

-- Expect: maths 16, science 14, english 12, eleven_plus 12
select subject_id, count(*) from curriculum_topics group by subject_id;
```

In **Table Editor**, `subjects` has 4 rows and every other table is empty.

### 6.5 The tables at a glance

```
staff ── one row per person who can sign in (linked to Supabase Auth users)

families ─< guardians                 (parent contacts)
families ─< students ─< enrolments >─ subjects
                            ├──> teachers  (optional until assigned)
                            └──> batches   (optional; teacher copied from batch)

teachers ─< batches ─< batch_slots       (weekly times)
                 ├─< batch_topics        (lesson plan)
                 ├─< class_sessions ─< attendance
                 └─< homework_sheets ─< homework_results

enquiries ─< enquiry_subjects, enquiry_events
students  ─< student_notes
file_links  (Google Drive folder links, ready for phase 2)
```

`─<` means "one to many" (one family has many students).

### 6.6 Automatic rules inside the database

The database enforces these itself, whichever screen changes the data:

- ID numbers are generated: students `PM-1001…`, teachers `T001…`, batches `B-001…`, enquiries `E-201…`.
- A student can have only one open enrolment per subject.
- An enrolment's batch must be the same subject; its teacher is set from the batch automatically.
- When a student's status becomes `left`, they lose their batch places and `left_on` is filled in.
- A new batch automatically receives a copy of the curriculum topics; topic 1 is set to "in progress".
- `updated_at` columns update themselves on every change.

### 6.7 Security (row-level security)

Every table has a rule: **only a signed-in user with an active row in `staff` can read or change data.** Someone who signs in but is not in `staff` sees nothing. Only `admin` users can change the `staff` table.

> Roles (`operations`, `head_teacher`) are stored but not yet enforced differently. That is part of the admin module work.

**Teachers** (since 27 Oct 2026) are not staff: a teacher login gets its own rules that show only that teacher's open batches and the students in them, and nothing about families, enquiries or other staff. Date of birth and the hand-in code on `students` can't be read directly by anyone signed in; staff read them through `student_private()`. See guide 15.

---

## 7. The web app (Next.js)

### 7.1 How the app was created

From `PencilMaths-Admin` in the VS Code terminal:

```powershell
npx create-next-app@15 web
```

| Question | Answer | Reason |
|---|---|---|
| TypeScript? | Yes | Catches mistakes early; reference project uses it |
| ESLint? | Yes | Code checking |
| Tailwind CSS? | No | We use plain CSS (simpler, matches reference project) |
| `src/` directory? | Yes | Same layout as the reference project |
| App Router? | Yes | Modern Next.js routing |
| Turbopack for `next dev`? | Yes | Faster reloads |
| Customize import alias? | No | Keep the default `@/*` |

`@15` pins Next.js version 15 to match the reference project (version 16 renames some files, e.g. `middleware.ts`).

### 7.2 Important files

| File | Purpose |
|---|---|
| `web/package.json` | Lists the app's commands (`dev`, `build`, `start`, `lint`) and libraries |
| `web/tsconfig.json` | TypeScript settings; defines `@/` as a shortcut for `web/src/` |
| `web/src/app/layout.tsx` | The frame around every page. Loads the Geist font, sets the browser tab title (`Sign in · Pencil Maths Admin`), language `en-GB`, mobile viewport, and asks search engines not to index the portal |
| `web/src/app/page.tsx` | The home page `/`. For now it immediately redirects to `/login` (on the server, so there is no loading flash). It will become the dashboard |
| `web/src/app/globals.css` | Design tokens (colours) and base styles used by every page |
| `web/src/components/icons.tsx` | Shared icons drawn inline as SVG (no icon library needed) |

### 7.3 Server code vs browser code

Next.js runs code in two places:

| Where | Marked by | Used for | Example |
|---|---|---|---|
| **Server** (default) | Nothing, or `'use server'` for actions | Reading the database, checking passwords, secrets | `login/page.tsx`, `login/actions.ts` |
| **Browser** | `'use client'` at the top of the file | Clicks, typing, showing/hiding things | `login/LoginForm.tsx` |

Keep as much as possible on the server; only use `'use client'` when something needs to react to the user.

### 7.4 Commands

Run these in `PencilMaths-Admin\web`:

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app for development at http://localhost:3000, with hot reload |
| `npm run build` | Builds the production version (also checks all types; good final check) |
| `npm run start` | Runs the production build |
| `npm run lint` | Checks the code with ESLint |
| `npm install` | Downloads the libraries listed in `package.json` |

---

## 8. The login page in detail

**Address:** http://localhost:3000/login

### 8.1 What it looks like

- **Desktop (1024 px and wider):** split screen.
  - **Left:** indigo brand panel with a grid-paper texture and large faded maths symbols (+ ÷ × π √ ∑ = %). Shows the logo, the headline *"Every student, class and teacher. One place."* and three feature cards (Students & families, Batches & classes, Homework & progress), plus a copyright line.
  - **Right:** the sign-in form, sitting directly on the page.
- **Phone / tablet (below 1024 px):** the brand panel is hidden. The logo sits above a white rounded card containing the form.

The design was inspired by the existing PencilMaths admin sidebar (indigo accent, slate greys, large rounded corners, bold headings).

### 8.2 What the form does

| Feature | Detail |
|---|---|
| **Sign in mode** | Email + password + *Sign in* button |
| **Reset mode** | Click *Forgot password?* → the same card shows only email + *Send reset link* + *Back to sign in* |
| **Show/hide password** | Eye button inside the password box |
| **Email remembered** | The email stays filled in after an error and carries over to reset mode |
| **Loading state** | Button shows a spinner and *Please wait…* while the server responds |
| **Messages** | Red box for errors, green box for success |
| **Invitation note** | *"Access is by invitation only. Ask an admin if you need an account."* |

> **Current limitation:** sign-in and reset are **not connected to Supabase yet**. The server checks that the email and password are filled in and look valid, then shows *"Sign-in is not connected yet…"*. Piece 5 connects it.

### 8.3 The four files and how they work together

```
browser                                   server
───────                                   ──────
login/page.tsx  (layout, brand panel) ◄── rendered on the server
   └─ LoginForm.tsx ('use client')
         │ user clicks "Sign in"
         │ form data (email, password) ─────────► actions.ts → signIn()
         │                                         checks the input
         │ ◄──────────── { error } or { ok } ─────  (Piece 5: asks Supabase)
         └─ shows the message
login.module.css  styles for all of the above
```

| File | What to know |
|---|---|
| `login/page.tsx` | Server component. Builds the two-column layout and brand panel. Sets the tab title to *Sign in*. Feature cards come from the `FEATURES` list at the top: edit that list to change them. |
| `login/LoginForm.tsx` | Client component. Holds the mode (`signin`/`reset`), show-password and email state. Uses React's `useActionState` to send the form to the server actions and receive their result (`state`) and loading flag (`pending`). |
| `login/actions.ts` | `'use server'`. `signIn()` and `sendReset()` read the form, validate it and return `{ error }` or `{ ok }`. Validation also happens here (not only in the browser) because the browser can be bypassed. |
| `login/login.module.css` | A **CSS Module**: class names are private to this page, so `.card` here cannot clash with a `.card` elsewhere. Used in code as `styles.card`. |

### 8.4 Accessibility and mobile details

- Every input has a visible `<label>`.
- Error messages use `role="alert"` so screen readers announce them.
- Inputs use 16 px text so iPhones don't zoom in when tapping a field.
- Buttons and the eye toggle are at least 44 px tall (comfortable finger size).
- Keyboard focus shows a clear indigo ring.
- `autocomplete` attributes let password managers fill the form.
- Respects the phone's safe area (notch) and *reduced motion* setting.

### 8.5 How to test it

1. Run `npm run dev` and open http://localhost:3000 (redirects to `/login`).
2. **Phone view:** press **F12**, then **Ctrl+Shift+M**, choose e.g. *iPhone 12 Pro*.
3. Enter an email and password → *Sign in* → you should see the "not connected yet" message and the email stays filled in.
4. Click *Forgot password?* → reset form; *Back to sign in* returns.
5. Click the eye icon → password becomes visible.

### 8.6 Password reset

How "Forgot password" works (Piece 6).

#### Overview

```
/login  "Forgot password"  →  sendReset()  →  Supabase emails a link
                                                     ↓
/reset-password  ←  /auth/accept (reads the sign-in from the link)  ←  user clicks link
       ↓
updatePassword()  →  password saved  →  home page (signed in)
```

1. The user enters their email on the login page.
2. Supabase emails them a one-time link.
3. The link opens `/auth/accept` (the same page invite emails use), which signs them in for this browser.
4. `/reset-password` lets them choose a new password, then sends them to the home page.

(Until 3 Nov 2026 the link went to `/auth/callback`. Nothing used that page any more, so it was removed.)

#### Supabase settings

**Authentication → URL Configuration**

| Setting | Value | Why |
|---|---|---|
| Site URL | `http://localhost:3000` | Default address used in emails |
| Redirect URLs | `http://localhost:3000/**` | Supabase only sends users to listed addresses |

Add the live address (e.g. `https://portal.pencilmaths.com/**`) when the site goes live.

#### Files

| File | Job |
|---|---|
| `web/src/app/login/actions.ts` → `sendReset` | Asks Supabase to send the reset email |
| `web/src/app/auth/accept/page.tsx` | Landing point for the email link (invites and resets); signs the user in |
| `web/src/app/auth/confirm/route.ts` | Not used yet. Kept for when we send emails through our own email service (custom SMTP) |
| `web/src/app/reset-password/page.tsx` | The "Choose a new password" screen |
| `web/src/app/reset-password/actions.ts` → `updatePassword` | Checks and saves the new password |

#### The code, briefly

**`sendReset`** (login/actions.ts)

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${await siteUrl()}/auth/accept`,
});
```

- `resetPasswordForEmail` makes Supabase send the email.
- `redirectTo` is where the link leads: `/auth/accept`, then `/reset-password`.
- The same message is shown whether the email exists or not, so strangers can't find out who has an account.

**`/auth/accept`** (page.tsx)

- The link carries the sign-in in the address after `#`. The page saves it with `setSession`, clears it from the address bar, then goes to `/reset-password`.
- If the link was already used or has run out, it says so and offers a new link.

**`/reset-password`** (page.tsx)

- Runs `getUser()`; if nobody is signed in (link not used), redirects to `/login`.
- Shows two password fields and any `?error=` message from the address bar.
- The form calls `updatePassword`.

**`updatePassword`** (reset-password/actions.ts)

```ts
if (password.length < 8) redirect('/reset-password?error=Use at least 8 characters.');
if (password !== confirm) redirect('/reset-password?error=The passwords do not match.');
await supabase.auth.updateUser({ password });
redirect('/');
```

- Checks length and that both fields match; errors come back to the page in the address.
- `updateUser({ password })` saves it for the signed-in user.
- Real errors are written to the terminal with `console.error`; the user sees a friendly message.

#### How to test

1. Sign out. On `/login`, click **Forgot password**, enter your email, send.
2. Open the email **in the same browser** and click the link.
3. On **Choose a new password**, save a new one → you land on the home page.
4. Sign out and sign in with the new password.

| Problem | Fix |
|---|---|
| No email | Check spam. Supabase's built-in email allows only a few per hour, and only to your Supabase team's addresses. |
| Link goes back to `/login` | Opened in a different browser, link already used, or the address is missing from **Redirect URLs**. Request a new link. |
| "Could not save the password" | Session expired; request a new link. Check the terminal for the real error. |

#### Later

- Style `/reset-password` to match the login page.
- Use a proper email service (custom SMTP) before going live, to lift the email limit.

---

## 9. Design system: colours and layout rules

All colours are defined once in `web/src/app/globals.css` as **CSS variables** ("design tokens"). Use the variable, never the raw colour code, so the look can be changed in one place.

| Token | Colour | Used for |
|---|---|---|
| `--brand` | `#4f46e5` (indigo) | Buttons, links, focus, logo |
| `--brand-strong` | `#4338ca` | Button hover, gradients |
| `--brand-deep` | `#312e81` | Dark end of the brand panel gradient |
| `--brand-ring` | indigo at 18% | Focus ring around inputs |
| `--bg` | `#f8fafc` | Page background |
| `--surface` | `#ffffff` | Cards and inputs |
| `--border` / `--border-strong` | `#e2e8f0` / `#cbd5e1` | Borders, hover borders |
| `--text` | `#0f172a` | Main text |
| `--muted` | `#64748b` | Secondary text |
| `--subtle` | `#94a3b8` | Placeholders, icons |
| `--danger`, `--danger-soft`, `--danger-border` | reds | Error messages |
| `--ok`, `--ok-soft`, `--ok-border` | greens | Success messages |

**Layout rules used so far:**

- **Breakpoints:** 480 px (larger card padding), 1024 px (desktop split layout).
- **Corner radius:** 14 px inputs/buttons, 24 px cards, 18 px feature cards.
- **Font:** Geist (loaded by `layout.tsx`), falling back to the system font.
- **Mobile first:** styles are written for phones, then `@media (min-width: …)` adds the desktop layout.

Example of using a token in CSS:

```css
.myButton { background: var(--brand); color: #fff; }
.myButton:hover { background: var(--brand-strong); }
```

---

## 10. Everyday workflow

### 10.1 Start working

1. Open VS Code → **File → Open Folder → PencilMaths-Admin** (or File → Open Recent).
2. Open the terminal: **Ctrl+`** (backtick, above Tab). It opens in `PencilMaths-Admin`.
3. Start the app:
   ```powershell
   cd web
   npm run dev
   ```
4. **Ctrl+click** `http://localhost:3000`.
5. Open a **second terminal** with the **+** button for Git and other commands; leave the first one running the app.

### 10.2 Which folder for which command

Always check the folder shown in the prompt (`PS C:\...\PencilMaths-Admin\web>`) before running a command.

| Command type | Run in |
|---|---|
| `npm ...` (run dev, install, build) | `PencilMaths-Admin\web` |
| `git ...` | Anywhere inside `PencilMaths-Admin` (usually the top folder) |

Moving between folders: `cd web` (go into), `cd ..` (go up one level).

### 10.3 Making a change

1. Edit a file and save (**Ctrl+S**). The browser updates by itself (*hot reload*).
2. Check it on desktop and phone view (**F12**, **Ctrl+Shift+M**).
3. Update this guide (section 17 change log and any section affected).
4. Commit and push to the `staging` branch (section 11). Production only changes when you merge into `main`: see [13 Staging and Production](13-staging-and-production.md).

### 10.4 Stop working

Click the terminal running the app and press **Ctrl+C**. If asked `Terminate batch job (Y/N)?`, type **Y**.

---

## 11. Git: saving your work

### 11.1 Key ideas

- **Repository:** a folder Git tracks. Created with `git init`, which adds a hidden `.git` folder.
- **Commit:** a saved checkpoint of the project with a message.
- **Staging:** choosing which changes go into the next commit (`git add`).
- **`.gitignore`:** a list of files Git must not save (e.g. `node_modules`, `.next`, `.env*`).

### 11.2 The commit routine

From `PencilMaths-Admin`:

```powershell
git status                       # what has changed (red = not staged)
git add .                        # stage everything
git status                       # now green = staged
git commit -m "Short description of the change"
git log --oneline                # list of checkpoints
```

**Good commit messages** say what changed, in the present tense: `Add login page design`, `Fix email cleared after error`, `Update HELP guide for Piece 5`.

### 11.3 Never commit

- `web/node_modules/` (huge; recreated by `npm install`)
- `web/.next/` (build output)
- `web/.env.local` or any file with keys or passwords

These are already in `web/.gitignore`.

### 11.4 Seeing hidden `.git`

- File Explorer: **View → Show → Hidden items**.
- Terminal: `ls -Force`.
- Never edit or delete `.git`: it holds the whole history.

---

## 12. Troubleshooting

Problems we met while setting up, and their fixes.

| Message / symptom | Cause | Fix |
|---|---|---|
| `node` / `git` *is not recognized* | Terminal opened before install, or install failed | Close and reopen the terminal; reinstall if needed |
| Can't see a `.git` folder after `git init` | It is hidden | `ls -Force`, or Explorer → View → Show → Hidden items. Check with `git status` |
| `fatal: not a git repository` | Running Git outside the project | `cd` into `PencilMaths-Admin` |
| `npm error enoent Could not read package.json` | Running npm in the wrong folder (e.g. `PencilMaths-Admin` instead of `web`) | `cd web`, then run the command again |
| `npm warn deprecated eslint@9…` | Information only: ESLint 10 exists | Ignore. Next.js 15 is built for ESLint 9; do **not** upgrade |
| `A new version of create-next-app is available` | Next.js 16 exists | Ignore. We deliberately use version 15 |
| Can't name the app `PencilMaths-Admin` | npm forbids capital letters | App lives in the lowercase `web` folder |
| SQL: `… already exists` | That script was already run | Skip it and run the next file |
| SQL: `… does not exist` | A script was skipped or run out of order | Run the earlier script first |
| SQL: warning about tables without row-level security | File 1 creates tables before file 3 secures them | Run anyway; then run file 3 |
| `LF will be replaced by CRLF` | Windows vs Mac/Linux line endings | Harmless; ignore |
| `adding embedded git repository: web` | `web` got its own `.git` | Ask for help before continuing (remove `web\.git`, re-add) |
| `Terminate batch job (Y/N)?` after Ctrl+C | Windows asking to confirm stop | Type `Y` |
| Port 3000 already in use | App already running in another terminal | Use that one, or stop it with Ctrl+C |
| Browser shows old page | Cache | Refresh with Ctrl+Shift+R |
| `Invalid API key` / `supabaseUrl is required` | Supabase details missing or wrong in `web/.env.local` | See the table in section 5.5, step 6 |
| `git status` shows `?? supabase/` | The database scripts were never added to Git | `git add supabase` then commit (section 11.2) |

`npm warn` = information, keep going. `npm error` / `npm ERR!` = something failed; read the last lines.

---

## 13. Decisions we made and why

| # | Decision | Reason | Date |
|---|---|---|---|
| 1 | Build a **new project** (`PencilMaths-Admin`) instead of editing the downloaded phase 1 folder | Learn by building; keep the original as a clean reference | 3 Oct 2026 |
| 2 | **Next.js 15** (not 16) | Matches the reference project, so its code can be reused directly | 3 Oct 2026 |
| 3 | **Supabase** (Postgres + Auth) | Same as the reference project; database security built in | 3 Oct 2026 |
| 4 | Supabase region **London** | UK pupils' data stays in the UK | 3 Oct 2026 |
| 5 | Run the **schema migrations and `seed.sql`**, but **no test data** | `seed.sql` is reference data (subjects, curriculum), not dummy records | 3 Oct 2026 |
| 6 | App in a **`web/`** subfolder; `supabase/` and `docs/` beside it | npm naming rules; keeps database scripts and docs with the code | 3 Oct 2026 |
| 7 | **No Tailwind**; plain CSS + CSS Modules | Fewer tools to learn; matches reference project. Can be added later if we reuse the Tailwind admin sidebar | 3 Oct 2026 |
| 8 | **Inline SVG icons** (`components/icons.tsx`) instead of an icon library | No extra install; same look as lucide icons | 4 Oct 2026 |
| 9 | Login design: **split screen on desktop, single card on mobile**, indigo brand | Modern, mobile-friendly; inspired by the existing PencilMaths admin sidebar | 4 Oct 2026 |
| 10 | Home page **redirects to `/login` on the server** | Instant, no loading spinner flash (the old admin used a browser redirect) | 4 Oct 2026 |
| 11 | Work in the **VS Code terminal** | Files and commands in one window | 3 Oct 2026 |

---

## 14. Roadmap: what comes next

| Piece | Goal | Status |
|---|---|---|
| 1 | Learn what the app does | ✅ Done |
| 2 | Install Node.js, Git, VS Code | ✅ Done |
| 3 | Supabase project + database scripts | ✅ Done |
| 4 | Create project folder, Next.js app, first commit, login page design | ✅ Done |
| 5 | Connect the app to Supabase: install libraries, `.env.local`, show subjects from the database | ✅ Done |
| 6 | Real sign-in: invite yourself, add your `staff` row as `admin`, sign in/out, password reset links | ✅ Done |
| 7 | Protect pages: only signed-in staff can see the portal (middleware + layout check) | ✅ Done |
| 8 | App shell: sidebar navigation (mobile menu) and dashboard | ✅ Done (dashboard now interactive analytics) |
| 9 | Admin module: manage staff (list, role, deactivate) | ✅ Done, except 9.3 invite by email (skipped for now) |
| 10 | Admin module: subjects and curriculum topics | ✅ Done |
| — | Students, Teachers, Batches screens | ✅ Done |
| — | Enquiries (leads, convert to student) | ✅ Done |
| — | WhatsApp homework: Drive setup, student folders, hand-in link, marking (Phases 2–5) | ✅ Done |
| — | Teacher login: teachers see only their own batches and students | ✅ Done (Staging) |
| — | Settings menu (Staff moved there) and Bulk import from a spreadsheet | ✅ Done (Staging) |
| 9.3 | Invite staff by email | ⏭ Next |
| 11 | Audit log | Planned |
| — | Classes and attendance logging screen | Planned |

---

## 15. How to update this guide

Update this file **in the same commit** as the change it describes.

1. Update **Last updated** and **Current stage** at the top.
2. Change any section the work affects (e.g. new files in section 4, new commands in section 7.4, new problems in section 12, new decisions in section 13).
3. Tick off or add pieces in section 14.
4. Add an entry at the **top** of the change log (section 17) using this template:

```markdown
### YYYY-MM-DD — Short title
**Who:** your name
**What changed:**
- …
**Files added / changed / removed:**
- `path/to/file` — what and why
**How to check it works:**
- …
**Notes / follow-ups:**
- …
```

5. Commit: `git add .` → `git commit -m "…"`.

### 15.1 Adding help with Claude

You can also ask Claude, in the PencilMaths Admin project, to add new help information. Claude will:

1. Put the information in the right section of `Help/01-project-guide.md` (or add a new section and list it in Contents).
2. Update **Last updated** at the top and add a change log entry (section 17).
3. Share the updated file back in the project so the project's copy matches.

You then commit `Help/01-project-guide.md` as usual (section 11).

---

## 16. Glossary of technical terms

| Term | Meaning |
|---|---|
| **Terminal / PowerShell** | Text window where you type commands |
| **`cd`** | "Change directory": move into a folder (`cd web`) or up (`cd ..`) |
| **npm** | Node Package Manager: downloads libraries and runs project commands |
| **`npx`** | Runs a tool from npm without installing it permanently |
| **`package.json`** | The app's ID card: name, commands, libraries |
| **`node_modules`** | Folder of downloaded libraries; never edit or commit |
| **localhost:3000** | Your own computer, port 3000: where the dev app runs |
| **Hot reload** | The browser updates automatically when you save a file |
| **Component** | A reusable piece of interface written as a function (`LoginForm`) |
| **Server component** | Runs on the server; can read the database safely |
| **Client component** | Runs in the browser (`'use client'`); handles clicks and typing |
| **Server action** | A server function a form can call directly (`'use server'`) |
| **Route** | A web address; in Next.js, a folder in `src/app` |
| **CSS Module** | A `.module.css` file whose class names only apply to the file that imports it |
| **Design token** | A named value (e.g. `--brand`) used instead of a raw colour |
| **Migration** | A database script that changes the structure; run once, in order |
| **Seed** | Script that inserts starting/reference data |
| **Schema** | The structure of the database: tables, columns, rules |
| **View** | A saved query that behaves like a read-only table |
| **Trigger** | Database code that runs automatically when data changes |
| **RLS (row-level security)** | Database rules deciding which rows each user may see or change |
| **Enum** | A column that only allows values from a fixed list |
| **Environment variable** | A setting kept outside the code (e.g. in `.env.local`) |
| **Repository** | A folder tracked by Git |
| **Commit** | A saved checkpoint in Git |

---

## 17. Change log

Newest first.

### 2026-11-11 — Students list: create missing Drive folders
**What changed:**
- A student without a Google Drive folder can't hand in homework ("Your homework folder is not ready yet"). The **Students** list now shows an amber box when any current student has no folder, naming them, with a **Create missing folders** button that makes them all (5 at a time, with progress). Those students also get a **No Drive folder** badge in the list.
- Staff only (teachers don't see it). The **Create Drive folder** button on a single student's page is unchanged.
- No database change.

**Files added / changed / removed:**
- `web/src/app/(portal)/students/MissingFolders.tsx` — new.
- `web/src/app/(portal)/students/page.tsx`, `students/actions.ts` (`createMissingDriveFolders`) — changed.

### 2026-11-11 — Add student: possible duplicate warning
**What changed:**
- On **Students › Add student**, once First name, Last name and Year group are filled in, the form checks for a student with the same first name, last name and year group (ignoring capitals and spaces at the ends, any status). If one exists, an amber box lists them with links, and a tick box **"This is a different student. Add them anyway."** must be ticked before **Save** works.
- The server checks again when saving, so the warning can't be skipped. Editing an existing student is not checked.
- Not covered yet: **Convert to student** from an enquiry, and bulk import (which already matches by full name).
- No database change.

**Files added / changed / removed:**
- `web/src/app/(portal)/students/duplicates.ts`, `DuplicateWarning.tsx` — new.
- `web/src/app/(portal)/students/StudentForm.tsx`, `students/actions.ts`, `web/src/components/ui.module.css` (`.alertWarn`) — changed.

### 2026-11-11 — Batch page: sections that open and close
**What changed:**
- Every part of the batch page is now a **section that opens and closes** (press its header). **Students** and **Upload Homework** start open; **Lesson plan**, **Attendance**, **Class notes and documents**, **Google Classroom** and **Batch settings** start closed. A closed section still shows one line of what is in it, for example "Term 1: 4 of 20 lessons completed · now on Y5-T1L5", "Last class 10 Nov: 3 of 3 attended" or "2 notes · latest 11 Nov".
- A **section bar** under the title (Students, Lesson plan, 📘 Homework, Attendance, Class notes, Google Classroom, Batch settings) stays at the top while scrolling. Pressing a name opens that section and moves to it; 📘 Homework goes straight to the latest homework. **Expand all** and **Collapse all** are at the end of the bar (wider screens).
- A section you open or close stays that way for the rest of the visit (this browser tab), so a save that reloads the page doesn't fold it away. Choosing a term or module opens Lesson plan, and choosing a class date opens Attendance, by themselves.
- The title line now shows places, the teacher and the class times. **Join class** is the one button next to the title.
- The batch details form moved into **Batch settings** at the end of the page, and **Close batch** moved there too, in a red box, and now asks "Are you sure?" first.
- In Class notes, the form folds away behind **＋ Add a note** once the batch has notes, so the notes list comes first.
- No database change. Built with the same colours and card style as the rest of the app; works with the keyboard and screen readers (native `<details>`).

**Files added / changed / removed:**
- `web/src/components/Section.tsx`, `Section.module.css`, `SectionNav.tsx`, `SectionNav.module.css` — new, reusable on other pages.
- `web/src/app/(portal)/batches/[id]/page.tsx`, `HomeworkSection.tsx`, `LessonPlanner.tsx`, `AttendanceSection.tsx`, `ClassLinkSection.tsx`, `ClassNotesSection.tsx`, `classNotes.module.css`, `BatchForm.tsx` (new `embedded` option) — changed. `web/src/components/ui.module.css` — `.group` and `.dangerZone` added.

### 2026-11-11 — Class notes and documents
**What changed:**
- Batch page: a new **Class notes and documents** card (and a **Class notes** button at the top). Staff and the batch's teacher add a note with a title, an optional lesson plan topic (Lesson library lesson or curriculum topic), text, and a document (PDF, Word, PowerPoint, Excel or photo, up to 50 MB) or a link. **Remove** takes a note away; the file stays in Google Drive.
- Student login: a new **Class Notes/Documents** tab (**Notes** on phones) listing the notes of the student's current classes, newest first, with subject tabs when there is more than one class. Documents open through the app.
- Files go to Google Drive under **PencilMaths › Class notes › &lt;batch code&gt;**, sent straight from the browser like marked sheets (4 MB fallback through the server).
- Teachers see and add notes only on their own open batches. Students only see notes of batches they are in now.
- 45 new automation checks (511 in all, all passing). Guide 22.

**Files added / changed / removed:**
- `supabase/migrations/20261111000002_class_notes.sql` — new (run on Staging; Prod at go-live after `20261106000001`). Safe to run twice.
- `web/src/lib/classNotes.ts`, `web/src/app/(portal)/batches/notesActions.ts`, `ClassNoteForm.tsx`, `ClassNotesSection.tsx`, `classNotes.module.css`, `web/src/app/(portal)/class-notes/[id]/route.ts`, `web/src/app/(student)/me/notes/page.tsx`, `notes.module.css`, `web/src/app/(student)/me/notes/[id]/route.ts`, `web/src/app/(student)/nav.module.css` — new.
- `web/src/app/(portal)/batches/[id]/page.tsx`, `web/src/app/(student)/StudentNav.tsx` — changed.
- `Automation Testing/database/67-class-notes.test.sql` — new. `Help/22-class-notes.md` — new; `Help/README.md` — row 22.

### 2026-11-10 — AI stage 1: question bank database
**What changed:**
- First step of the AI plan (`Help/AI/01-ai-plan.md`, Part 1). Each Lesson library worksheet can now hold its questions and answers in **versions**: draft → approved → retired. Approved versions are frozen, and any change makes a new version.
- An admin or a teacher of that subject and year group approves each version, for one exact PDF. If the PDF is replaced later, the worksheet shows "PDF changed". Students and families see none of it.
- Keyword search over approved questions (`search_questions_keyword`): the baseline that embeddings must beat later.
- No screens yet. The Worksheet review page is the next step.
- 63 new automation checks (358 in all, all passing). The script was run twice to check it is safe to repeat.

**Files added / changed / removed:**
- `supabase/migrations/AI/20261110000001_question_bank.sql` — new, in the new `AI` folder (run on Staging; Prod at go-live after `20261108000001`). Safe to run twice.
- `Automation Testing/database/95-question-bank.test.sql` — new; `90-database-checks.test.sql` — 34 teacher rules (was 29); `run-database-tests.sh` — also runs `supabase/migrations/AI/`.
- `Help/AI/02-question-bank.md` — new; `Help/README.md` — AI section updated.

### 2026-11-09 — Dashboard: full batches no longer in Needs attention
**What changed:**
- **Needs attention** no longer lists "TB-2 is full". It now shows students without a batch or teacher, homework to mark, and enquiries waiting 7 or more days. Batch places are still shown in the Open batches tile and the batch places chart.
- No database change.

**Files added / changed / removed:**
- `web/src/app/(portal)/_dashboard/data.ts`, `Help/03-core-admin-screens.md`, `Help/10-testing-guide.md` — updated.

### 2026-11-08 — GCSE - H and GCSE - F instead of Year 11, 12 and 13
**What changed:**
- Every year picker and label now goes Year 1 … Year 10, **GCSE - H**, **GCSE - F**. Lists and charts show `GCSE-H` / `GCSE-F`. Year 13 can't be chosen any more. Behind the scenes the numbers stay: 11 = GCSE - H, 12 = GCSE - F.
- Screens: student, batch, enquiry and teacher forms and pages, the Students, Batches, Enquiries and Teachers lists, the Curriculum page, the Lesson library, the dashboard (chart, places, Needs attention) and the student pages.
- **Bulk import** accepts `GCSE-H` and `GCSE-F` (also `GCSE - H`, `GCSE Higher`, `Foundation` …) in the Year column. A file that still says Year 11, 12 or 13 is refused with a message.
- **Lesson library:** GCSE lesson codes start with `GH-` / `GF-`; worksheets go to `Homework library/Maths GCSE - H` (or `- F`).
- ⚠️ As asked, the database script **deletes all Year 11, 12 and 13 data**: students, their families when no other child, batches, enquiries, Lesson library lessons and curriculum topics. Google Drive files are kept. Guide 02 has a query that shows what will be deleted.
- 23 new automation checks (295 in all, all passing). The script was also tested on test data with Year 11–13 students, batches, lessons and enquiries, and run twice.

**Files added / changed / removed:**
- `supabase/migrations/20261108000001_gcse_year_groups.sql` — new (run on Staging; Prod at go-live after `20261106000001`, see the warning in guide 13). Safe to run twice.
- `web/src/lib/options.ts` (`YEARS` 1–12, `yearLabel`, `yearShort`, `lessonCodePrefix`), `web/src/lib/format.ts` (`yearRange`).
- `web/src/app/(portal)/`: `students/StudentForm.tsx`, `students/page.tsx`, `students/[id]/page.tsx`, `batches/BatchForm.tsx`, `batches/page.tsx`, `batches/[id]/page.tsx`, `enquiries/EnquiryForm.tsx`, `enquiries/page.tsx`, `enquiries/[id]/page.tsx`, `teachers/TeacherForm.tsx`, `subjects/actions.ts`, `subjects/[id]/page.tsx`, `lesson-library/actions.ts`, `lesson-library/page.tsx`, `_dashboard/data.ts`, `settings/import/ImportForm.tsx`.
- `web/src/app/(student)/me/page.tsx`, `web/src/app/(student)/me/classes/page.tsx`.
- `Automation Testing/database/85-gcse-year-groups.test.sql` — new; `70-students.test.sql` — Year 13 refused.
- `Help/02` (GCSE section), `Help/10`, `Help/13`, `Help/14`, `Help/16`, `Help/20` — updated.

### 2026-11-06 — Automation testing: 272 database checks, run by GitHub before go-live
**What changed:**
- New folder **`Automation Testing`** at the top of the project. It builds a fresh test database from every migration and checks 272 rules: staff, teacher, student and family access, the WhatsApp hand-in link, batches (places, class-time clashes, closing), homework (Set homework, Mark completed, separate maximum marks), saving students, Bulk import, and whole-database safety rules.
- GitHub runs them by itself on every push to `staging` (**Actions › Automation tests**), together with the app's type check, lint and build. There is also a **Run workflow** button.
- Going live now starts with a check that the latest run is green (guide 13, step 0).
- The tests never touch Staging or Production. No app code or migration changed.
- Checked that the tests notice mistakes: with three rules broken on purpose (a teacher rule, the batch places check and one table's security), 15 checks failed with clear messages.

**Files added / changed / removed:**
- `Automation Testing/` — new: `README.md`, `run-database-tests.sh`, `database/supabase-stub.sql`, `database/helpers.sql`, `database/fixtures.sql` and nine `database/NN-area.test.sql` files.
- `.github/workflows/automation-tests.yml` — new (the GitHub run). Copy it there from `Automation Testing/setup/` once (guide 20, section 5).
- `Help/20-automation-testing.md` — new.
- `Help/README.md`, `Help/10-testing-guide.md`, `Help/13-staging-and-production.md`, `Help/17-architecture-review.md` (F9 partly done) — updated.

### 2026-11-06 — Faster database: same access rules, much faster staff screens
**What changed:**
- The database's access rules now check each table against short lists worked out once per query: the signed-in teacher's batches, students and homework. Before, they ran several lookups on every row. For staff, the teacher lists are empty, so the check costs almost nothing.
- Staff and admin checks are worked out once per query: `(select is_staff())`.
- New indexes for the dashboard's homework lists and counts, and for five foreign keys. The Batches list view works its counts out once for all batches instead of 8 sub-queries per batch.
- **Nobody sees or can change anything different.** Tested on a local copy of all migrations with a few years of test data: the same rows in every table for an admin, a teacher and a student, and the same teacher add/change/delete checks. Staff lists went from 20–30 s to 0.02–0.05 s at that size. Today's Staging data is small, so the difference shows as the data grows.
- No app change. Not fixed by this script: the batch page's 1,000-row limit for files (guide 18, D6).

**Files added / changed / removed:**
- `supabase/migrations/20261106000001_faster_database.sql` — new (run on Staging; Prod at go-live after `20261105000002`). Safe to run twice.
- `Help/18-database-performance-review.md` — status lines: D1–D4 built.
- `Help/18-database-performance-draft.sql` — now only points to the migration; it can be deleted.
- `Help/02-database-supabase.md`, `Help/13-staging-and-production.md`, `Help/15-teacher-login.md`, `Help/19-page-speed-review.md`, `Help/README.md` — updated.

### 2026-11-06 — New Help section: Process Improvement / Optimization
**What changed:**
- The Help index (`Help/README.md`) has a new section, **Process Improvement / Optimization**, for reviews of speed, safety and simplicity and the fixes they suggest.
- The database performance review of 5 Nov 2026 is now guide 18 in that section. Its draft fix script sits next to it. The draft has **not** been run on Staging or Production, and no app code or migration changed.
- The architecture review (guide 17) moved from the main table into this section. The page speed review of 3 Nov 2026 is now guide 19 there, with a progress table: P2–P5 done, P6 and P8 partly done, P1 still to check, P7 replaced by guide 18 D1, P9 not started.

**Files added / changed / removed:**
- `Help/18-database-performance-review.md` — new (findings D1–D8, timings, good practice for new scripts, suggested order).
- `Help/18-database-performance-draft.sql` — new. A draft only, not a migration; it becomes `supabase/migrations/20261106000001_faster_database.sql` if adopted.
- `Help/19-page-speed-review.md` — new (the 3 Nov review, findings P1–P9, with what has been done since).
- `Help/17-architecture-review.md` — links to guide 19.
- `Help/README.md` — new section with rows 17, 18 and 19 (17 moved from the main table); the "New guide" convention mentions the new section.

### 2026-11-05 — A separate maximum mark for each homework sent together
**What changed:**
- In the **Mark completed** pop-up (Lesson library lessons), each ticked homework now has its own **out of** box next to it, instead of one Maximum mark for all of them. So Hw-1 can be out of 10 and Hw-2 out of 20. An empty box means no maximum mark. Set on and Due on are still shared.
- Set homework, and Mark completed for curriculum topics, send one homework at a time, so they keep their single Maximum mark box.

**Files added / changed / removed:**
- `supabase/migrations/20261105000002_lesson_homework_marks.sql` — new (run on Staging; Prod at go-live after `20261105000001`). Updates `complete_lesson` to read a maximum mark for each homework. Safe to run twice. Until it is run, homework sent from the pop-up gets no maximum mark.
- `web/src/app/(portal)/batches/CompleteLesson.tsx`, `web/src/app/(portal)/batches/actions.ts` (`completeLesson`) — changed.
- `Help/14-lesson-planner.md` — updated.

**How to check it works (on Staging):**
- Run the script in the Staging SQL editor.
- Batch page › a library lesson › Mark completed: tick Hw-1 and Hw-2, set 10 and 20, Send. The Homework section shows "out of 10" and "out of 20".
- Tick one with an empty box: that homework has no maximum. Enter 0: refused with "Each maximum mark must be more than 0."

### 2026-11-05 — A teacher can't be given the same class time twice
**What changed:**
- Creating or saving a batch is now refused, with a message, if one of its class times (day and start time) is already assigned to the same teacher in another open batch. For example *"Agnes Smith already teaches B-004 on Monday at 16:00. Choose another time or another teacher."* Closed batches don't count.
- The same check runs when a batch is given a different teacher, when a closed batch is reopened, and in Bulk import (the clash is listed as a problem and nothing is imported).
- The check is in the database, so two people saving at the same moment can't both get through.

**Files added / changed / removed:**
- `supabase/migrations/20261105000001_teacher_time_clash.sql` — new (run on Staging; Prod at go-live after `20261103000003`). Adds the check (`check_teacher_times` and two triggers) and updates `save_batch` so the old times are cleared before the teacher changes. Safe to run twice.
- `web/src/app/(portal)/batches/actions.ts` — reopening a batch now shows the database's message.
- `Help/03-core-admin-screens.md` — Batches: the rule, and a query that lists any clashes made before the check.

**How to check it works (on Staging):**
- Run the script in the Staging SQL editor. Optionally run the query in guide 03 §6 to see any clashes already there.
- New batch with the same teacher, day and time as an existing open batch: refused with the message. A different time: saved.
- The same day and time with a different teacher: saved.
- Change a batch's teacher to one who already teaches at that time: refused.
- Close a batch, create another at the same time for the same teacher, then reopen the first: refused.

### 2026-11-03 — Architecture review added to Help
**What changed:**
- The architecture review (findings F1–F24 and the roadmap) is now guide 17, with a progress table at the top and a status line under each finding. Done: F3, F4, F5, F7, F10, F15, F18, F19. Partly done: F2, F16. Waiting for a decision: F14.

**Files added / changed / removed:**
- `Help/17-architecture-review.md` — new. `Help/README.md` — new row. No code or database change.

### 2026-11-03 — Simpler code: fewer tools, shared login code, saved Drive folders
**What changed:**
- **Tailwind removed.** It was installed by `create-next-app` but never used (decision 7: plain CSS). The two packages are gone from `package.json`, and `postcss.config.mjs` no longer loads anything. Nothing looks different.
- **`/auth/callback` removed.** Invite and password-reset emails both land on `/auth/accept`, so the old page was not used. It now only redirects to `/login` until you delete its folder. `/auth/confirm` is kept for custom email (SMTP) later and says so at the top.
- **One copy of the login code.** Students (family login) and Teachers used to have their own copies of "invite / resend invite / remove login". Both now use `web/src/lib/logins.ts`. Same buttons and messages; removing a login now also reports it if the database refused to unlink it.
- **Drive folders are remembered.** The first time the app finds or makes a Drive folder (PencilMaths, Students, a student's folder, Homework, Lesson library…), it saves the folder's id in a new table `drive_folders`. After that it uses the id straight away instead of searching Drive by name on every upload. Uploads and hand-ins need fewer Drive calls, and two uploads at the same moment can no longer make two folders with the same name (the spare one goes to the Drive bin).
- **One retry on Drive hiccups.** If Google says it is busy (429), or has a brief error (500–504) on a read or change, the app waits under a second and tries once more. It does not repeat an upload or folder creation after a 5xx, in case Google made it anyway.
- If a saved folder has gone (an upload into it gets "not found"), the app forgets it and the next try finds or makes the folder again.

**Files added / changed / removed:**
- `web/package.json`, `web/package-lock.json`, `web/postcss.config.mjs` — changed (Tailwind removed). Please delete `web/postcss.config.mjs` and run `npm install` in `web`.
- `web/src/app/auth/callback/route.ts` — now a stub; please delete the `web/src/app/auth/callback` folder. `web/src/app/auth/confirm/route.ts`, `web/src/app/reset-password/page.tsx` — comments only.
- `web/src/lib/logins.ts` — new. `web/src/app/(portal)/students/actions.ts`, `web/src/app/(portal)/teachers/actions.ts` — changed.
- `web/src/lib/google/folderIds.ts` — new. `web/src/lib/google/drive.ts` — changed.
- `supabase/migrations/20261103000003_drive_folder_ids.sql` — new (run on Staging; Prod at go-live after `20261103000002`). Adds the `drive_folders` table; only the server can read or write it. Safe to run twice. Before it is run, the app just searches Drive by name as before.

**Good to know:**
- **Don't put the app's folders in the Drive bin.** The app now trusts its saved ids, so a binned folder would keep receiving files. If it happens, restore the folder from the bin. If you ever want the app to look everything up again, empty the table: `delete from drive_folders;` (safe; it refills itself).

**How to check it works (on Staging):**
- Run `20261103000003_drive_folder_ids.sql` in the Staging SQL editor.
- Pages look the same as before (no Tailwind).
- Forgot password on the login page: the email link opens the "Choose a new password" screen.
- Students: give a family login, resend the invite, remove the login. Teachers: invite, resend, remove login.
- Make a new student's Drive folder, upload a homework sheet, and send a hand-in link upload. Then in Supabase, Table editor › `drive_folders` shows rows for the folders used. A second upload is a little quicker.

### 2026-11-03 — Clearer access checks, and saves that report every failure
**What changed:**
- **Homework, marking and lesson-plan actions now check who is asking first.** A new `requireStaffOrTeacher()` lets staff and teachers through and stops anyone else (a student or family login, or a signed-out caller) before any work starts. Where an action already reads the homework or batch first, the check runs alongside that read, so saves are no slower. The database rules still limit a teacher to their own batches, as before.
- **Staff settings** (change role, deactivate) now use the admin check (`requireAdmin`) as well as the database rule.
- **Save & send on the marking page** now says so if your pen marks couldn't be kept for changing later (the sheet and mark are still sent).
- **Remove homework file** now reports a failure if the database refused, instead of saying "removed".
- **Delete homework** deletes the homework first and only then its file rows (before, a refused delete left the homework without its files). Its corrected-sheet rows are removed too; all files stay in Google Drive.
- Two tidy-up steps after sending a marked sheet (removing the earlier corrected sheet, clearing the unsent copy) are logged clearly if they fail. An unsent copy is only put in the Drive bin once it has been cleared, so the batch page never offers Send for a file that is gone.

**Files added / changed / removed:**
- `web/src/lib/auth.ts` (`requireStaffOrTeacher`), `web/src/app/(portal)/batches/actions.ts`, `web/src/app/(portal)/batches/[id]/mark/actions.ts`, `web/src/lib/homework/corrections.ts`, `web/src/app/(portal)/settings/staff/actions.ts` — changed.
- No database script.

**How to check it works (on Staging):**
- As admin and as a teacher: set homework, add and remove a homework file, mark a hand-in (Save & send, and Save & close then Send), give past homework, start and complete a topic or lesson. All work as before.
- As admin: delete a homework; change a staff member's role. As operations staff: Settings › Staff is still refused.
- As a student: the portal pages still send you to /me.

### 2026-11-03 — Faster pages: loading placeholders, fewer login checks, lighter dashboard
**What changed:**
- **Loading placeholders.** Clicking a link in the portal or the student area now shows grey placeholder bars straight away, with the menu still in place, until the page is ready. Before, the old page stayed on screen with no sign anything was happening. Quick pages don't flash them: they only appear after 0.15 s.
- **The login is checked once per page instead of 2–3 times.** The check now uses `getClaims()`: it checks the login token itself, and once the Supabase project uses the newer signing keys it needs no call to Supabase at all (see below). Admin pages (Subjects, Settings, Lesson library, Google Drive) no longer check the login and staff record a second time. A student's dashboard is fetched once instead of twice (layout and page shared it). Security is unchanged: forged or expired logins are still refused, and the database rules still check every query.
- **Lists and the batch page load their data at the same time** as the "who is this?" check, not after it. The batch page now runs its queries side by side (about 7 waits in a row before, 3 now), and its homework files, drafts and worksheets are fetched together.
- **Lighter dashboard.** Taken off: the date range filter, Attendance tile and chart, Classes logged (and "classes not logged" in Needs attention), the Homework handed in % tile, and the Hand-in rate by batch chart. Added: an **Open batches** tile (places used). The students part no longer works out every student's attendance figures. The Homework section loads on its own, so the rest of the dashboard shows first. "+N new" students now means the last 4 weeks.

**To get the full speed-up (optional; Staging first, then Production when you go live):** in Supabase open **Project Settings › JWT Keys**. If it says the project uses the **legacy JWT secret**, migrate to the new **JWT signing keys** and follow the steps (create the standby key, then rotate). Don't revoke the legacy secret afterwards. Until this is done, the login check still asks Supabase once per page, as before, so nothing breaks.

**Files added / changed / removed:**
- `web/src/components/Skeleton.tsx`, `Skeleton.module.css`, `web/src/app/(portal)/loading.tsx`, `web/src/app/(student)/loading.tsx`, `web/src/app/(student)/me/myDashboard.ts` — new.
- `web/src/lib/auth.ts` (`getUserId`, `getViewer` looks up staff and teacher at once, `requireAdmin` reuses it), `web/src/middleware.ts` (`getClaims`), `web/src/app/(portal)/layout.tsx`, `web/src/app/(student)/layout.tsx`, `web/src/app/(student)/me/page.tsx`, `web/src/app/(student)/me/classes/page.tsx`, `web/src/app/(portal)/settings/staff/page.tsx` — changed (login checked once).
- `web/src/app/(portal)/students/page.tsx`, `batches/page.tsx`, `batches/[id]/page.tsx`, `batches/HomeworkSection.tsx` — changed (queries side by side).
- `web/src/app/(portal)/page.tsx`, `dashboard.module.css`, `_dashboard/data.ts`, `_dashboard/homework.ts`, `_dashboard/HomeworkPanel.tsx` — changed (lighter dashboard). `_dashboard/Sparkline.tsx` is no longer used and can be deleted.
- `Help/03-core-admin-screens.md` — updated (section 8).
- No database script.

**How to check it works (on Staging):**
- Sign in as admin, as a teacher and as a student: each lands where it did before, and signing out still goes to the login page.
- Click between Students, Batches and a batch: grey placeholders show at once, then the page.
- The dashboard shows the three tiles, Needs attention, Homework (it may fill in a moment after the rest), the student charts, batch places and the enquiry pipeline, with no attendance.
- On a batch page, everything works as before: lesson plan, Give past homework, homework files, marking.
- Subjects and Settings still open for an admin, and still send operations staff and teachers back to the dashboard.

### 2026-11-03 — Created / modified dates on the lists
**What changed:**
- The **Students**, **Batches**, **Teachers** and **Subjects** lists have a new **Created / modified** column: the date the record was added and, under it in grey, "Modified …" with the date it was last changed (only once it has been changed). Dates are UK dates.
- "Modified" now only moves when something in the record really changes. Pressing Save without changing anything, reordering subjects, or running the same bulk import again doesn't count.
- Subjects didn't record these dates before. Existing subjects show "—" as their created date; they get a modified date the next time they are changed. New subjects get both.
- Changes to a student's subjects or batch, a batch's students or topics, and a subject's curriculum topics are saved in other tables, so they don't change these dates unless the record itself is saved too.

**Files added / changed / removed:**
- `supabase/migrations/20261103000002_created_modified_dates.sql` — new (run on Staging; Prod at go-live after `20261103000001`). Adds the dates to `subjects`, changes the four "modified" triggers to fire only on a real change, and adds `created_at` / `updated_at` to the `student_list`, `batch_list` and `teacher_list` views.
- `web/src/components/CreatedModified.tsx` — new (the table cell).
- `web/src/lib/format.ts` (`formatDay`, a date in UK time), `web/src/components/ui.module.css` (`.stamp`), `web/src/app/(portal)/students/page.tsx`, `batches/page.tsx`, `teachers/page.tsx`, `subjects/page.tsx` — changed.
- `Help/03-core-admin-screens.md`, `Help/13-staging-and-production.md` — updated.

**How to check it works (on Staging, after running the script):**
- Open each of the four lists: the new column shows a created date for students, batches and teachers, and "—" for existing subjects.
- Edit a student's school and save: the list shows "Modified" with today's date. Open another student and press Save without changing anything: its dates stay the same.
- Rename a subject: it shows "Modified" with today's date. Add a subject: it shows today's created date.
- Before the script is run, these four lists show the "Something went wrong" page.

### 2026-11-03 — Saves all at once, and friendly error pages
**What changed:**
- **Saving a batch, setting homework, completing a topic and completing a lesson now happen all at once.** Each is one database function, so if any part fails (a lost connection, a rule that says no), nothing is saved and the page says so. Before, a problem halfway could leave a batch with no class times, or a homework that no student was given.
- A homework file is uploaded to Google Drive first; the homework, its students and its file are then saved together. If the save fails, the file just uploaded goes to the Drive bin.
- Teachers keep exactly the same rights: the functions run with the signed-in person's own rights, so the existing rules still decide.
- **Friendly error pages.** A page that fails to load shows "Something went wrong" with **Try again** (inside the portal and the student area the menu stays), instead of Next.js's blank error screen. A wrong address or an old hand-in link shows "Page not found".

**Files added / changed / removed:**
- `supabase/migrations/20261103000001_atomic_saves.sql` — new (run on Staging; Prod at go-live after `20261102000001`). Adds `save_batch`, `set_homework`, `complete_topic`, `complete_lesson`.
- `web/src/app/(portal)/batches/actions.ts`, `web/src/lib/homework/sheets.ts` — changed (use the new functions).
- `web/src/components/ProblemPage.tsx`, `web/src/app/error.tsx`, `web/src/app/global-error.tsx`, `web/src/app/not-found.tsx`, `web/src/app/(portal)/error.tsx`, `web/src/app/(portal)/not-found.tsx`, `web/src/app/(student)/error.tsx` — new.
- `Help/13-staging-and-production.md` — updated (script added to the go-live list).

**How to check it works (on Staging, after running the script):**
- Create a batch with two class times, then edit it: change the teacher and the times. Both saves show "Batch saved"; the students' teacher follows the batch.
- Set a homework with a file: it reaches every student in the batch and the file opens.
- Complete a topic, and a Lesson library lesson with Hw-1 and Hw-2 ticked: the homework is sent once; completing again sends nothing new. Tick a sheet with no worksheet: nothing is sent and the message names the sheet.
- Open a made-up address such as `/h/abc`: the "Page not found" card shows.
- Before the script is run, these saves say "run 20261103000001_atomic_saves.sql in Supabase first".

### 2026-11-02 — Settings menu and Bulk import
**What changed:**
- New **Settings** link in the sidebar (admins only). It opens to **Staff** (moved from the main menu; old `/staff` links still work) and **Bulk import**.
- **Bulk import** reads a spreadsheet (Year, Batch, Student Name, Teacher Name, Batch Time, optional Subject) and adds or matches teachers, batches with their class times, and students, then puts each student in their batch and makes Drive folders for new students. **Check file** shows what will happen without saving; importing the same file twice adds nothing (guide 16).
- Batches can have a **name** ("Batch 1"), shown next to the code and editable on the batch page.
- The **last name is optional** for students and teachers (many are known by one name).
- Standalone script `supabase/scripts/bulk-import-to-sql.mjs` makes a SQL file from the spreadsheet for the Supabase SQL Editor.

**Files added / changed / removed:**
- `supabase/migrations/20261102000001_bulk_import.sql` — new (run on Staging; Prod at go-live after `20261027000004`).
- `supabase/scripts/bulk-import-to-sql.mjs`, `Help/16-bulk-import.md` — new.
- `web/src/app/(portal)/settings/` (`page.tsx`, `settings.module.css`, `import/page.tsx`, `import/ImportForm.tsx`, `import/actions.ts`, `import/import.module.css`), `web/src/lib/import/rows.ts` — new.
- `web/src/app/(portal)/staff/` (`page.tsx`, `actions.ts`, `staff.module.css`) — moved to `web/src/app/(portal)/settings/staff/`; `web/src/app/(portal)/staff/page.tsx` is now a redirect.
- `web/src/components/AppShell.tsx`, `AppShell.module.css`, `icons.tsx`; `web/src/app/(portal)/batches/` (`BatchForm.tsx`, `actions.ts`, `page.tsx`, `[id]/page.tsx`); `web/src/app/(portal)/students/StudentForm.tsx`; `web/src/app/(portal)/teachers/` (`TeacherForm.tsx`, `actions.ts`); `web/src/lib/google/drive.ts` (no trailing space in a folder name when there is no last name) — changed.
- `Help/README.md`, `Help/02-database-supabase.md`, `Help/03-core-admin-screens.md`, `Help/13-staging-and-production.md` — updated.

**How to check it works:** guide 16, section 8.

### 2026-10-27 — Teacher login
**What changed:**
- Admins can give a teacher a login from the teacher's page (**Teacher login** › **Send login invite**), like student logins. A teacher sees the portal with a short menu (Dashboard, My batches, My students) and only their own open batches and the students in them: lesson plan, homework, hand-ins and marking. They can't edit students or batches, delete homework, or see parents' details, enquiries, other teachers, logins, hand-in links or Drive folders (guide 15).
- The database enforces it: new teacher rules next to the staff rules, and date of birth and the hand-in code can no longer be read directly by anyone signed in (staff read them through `student_private`).
- One login can't be both a teacher and a student/family login.

**Files added / changed / removed:**
- `supabase/migrations/20261027000004_teacher_login.sql` — new (run on Staging; Prod at go-live).
- `web/src/app/(portal)/teachers/TeacherLogin.tsx`, `Help/15-teacher-login.md` — new.
- `web/src/lib/auth.ts`, `web/src/lib/supabase/admin.ts`, `web/src/lib/homework/corrections.ts`, `web/src/lib/students/driveFolder.ts`, `web/src/components/AppShell.tsx`, `web/src/app/(portal)/layout.tsx`, `page.tsx`, `_dashboard/` (`data.ts`, `homework.ts`, `HomeworkPanel.tsx`), `batches/` (`page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `actions.ts`, `HomeworkSection.tsx`), `students/` (`page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `actions.ts`), `teachers/` (`page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `actions.ts`), `enquiries/` (`page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `actions.ts`) — changed.
- `Help/README.md` — guide 15 added.

**How to check it works:** guide 15, section 5.

### 2026-10-27 — Dashboard Homework section
**What changed:**
- The dashboard has a new **Homework** section: five numbers (to mark, overdue, handed in this week, marked this week, marked but not sent), a **Needs marking** list (oldest first, with **🖊️ Mark** links), **Students falling behind** (2+ overdue, with a **WhatsApp nudge** button) and a **Hand-in rate by batch** chart (on time, last 4 weeks). The **Homework handed in** tile jumps to it.
- No database change.

**Files added / changed / removed:**
- `web/src/app/(portal)/_dashboard/homework.ts`, `HomeworkPanel.tsx`, `NudgeButton.tsx` — new.
- `web/src/app/(portal)/page.tsx`, `web/src/app/(portal)/dashboard.module.css` — changed.
- `Help/03-core-admin-screens.md` — section 8.1 added; `Help/09-homework-marking.md` — section 2.3 added.

**How to check it works:**
- On Staging, open the dashboard and scroll to **Homework**. Hand in a file as a test student: **To mark** and **Handed in this week** go up by one and the hand-in appears in **Needs marking**. **🖊️ Mark** opens it; **Save & close** moves it to **Marked, not sent**.
- Give a test student two homeworks with a due date in the past and don't hand them in: they appear under **Students falling behind**; **WhatsApp nudge** opens WhatsApp with the reminder.

### 2026-10-27 — Family login, batch places and fixes
**What changed:**
- **Marking in the browser:** a **🖊️ Mark** link next to each hand-in opens it in a new tab to draw, type and tick on, then **Save & send** makes it the student's corrected sheet (guide 09, section 2.2). New script `20261027000003_homework_marking.sql`; new packages `pdfjs-dist` (run `npm install` in `web`).
- **Family login:** one email and password opens several children; the parent switches child from the top bar. Give access with the same email to link brothers and sisters (guide 12, section 7.1).
- **Batch places:** a student can't be added to a full batch, and a batch's places can't go below its current students. Full batches show "full" in the student form.
- **Student form:** the Teacher dropdown is removed; the teacher comes from the batch.
- **Corrected sheet:** Save and Excuse are disabled while saving (a double click saved it twice); a new upload replaces the earlier one.
- **Invite and reset links** use the address of the site in use, so Staging no longer sends localhost links.

**Files added / changed / removed:**
- `supabase/migrations/20261027000001_batch_capacity.sql`, `20261027000002_family_login.sql` — new (run on Staging; Prod at go-live).
- `web/src/lib/siteUrl.ts`, `web/src/app/(portal)/batches/MarkButtons.tsx`, `web/src/app/(student)/StudentSwitcher.tsx`, `web/src/app/(student)/actions.ts` — new.
- `web/src/app/(portal)/students/` `actions.ts`, `StudentForm.tsx`, `PortalAccess.tsx`; `web/src/app/(portal)/batches/` `actions.ts`, `HomeworkSection.tsx`; `web/src/app/login/actions.ts`; `web/src/app/(student)/layout.tsx`, `student.module.css`; `web/src/components/ui.module.css` — changed.
- `Help/12-student-login.md` — section 7.1 added.
- Marking: `web/src/app/(portal)/batches/[id]/mark/` (`page.tsx`, `Marker.tsx`, `marks.ts`, `actions.ts`, `marker.module.css`), `web/src/app/(portal)/files/[id]/route.ts`, `web/src/lib/homework/corrections.ts`, `supabase/migrations/20261027000003_homework_marking.sql` — new; `web/package.json`, `web/src/lib/google/drive.ts`, `batches/actions.ts`, `batches/HomeworkSection.tsx` — changed; `Help/09-homework-marking.md` — section 2.2 added.

### 2026-10-25 — Batch page updates and past homework
**What changed:**
- In progress lessons shown in green; mark and corrected sheet saved together; **Upload Homework** section with the latest active homework open; green **📘 Homework** button; section header bars; class times **Save** inside its box.
- **Give past homework (N)** next to a student who joined after homework was set.

**Files added / changed / removed:**
- `web/src/app/(portal)/batches/GivePastHomework.tsx` — new.
- `web/src/app/(portal)/batches/` `actions.ts`, `HomeworkSection.tsx`, `BatchForm.tsx`, `LessonPlanner.tsx`, `[id]/page.tsx`; `web/src/components/ui.module.css`, `StatusBadge.tsx` — changed.
- `Help/14-lesson-planner.md` — sections 3.1, 9 and 10 added.

### 2026-10-24 — Lesson planner
**What changed:**
- New **Lesson library** (admin): import a "Term Lesson Plan - Year N" spreadsheet and upload the worksheets (Year 5 Maths: 95 lessons, 285 homework codes).
- Batch page **Lesson plan** for library classes: Term and Module dropdowns, Start / Mark completed / Undo; Mark completed sends the ticked Hw-1/2/3 worksheets.
- Staff can upload a **corrected sheet** per student; students see it on My homework.

**Files added / changed / removed:**
- `supabase/migrations/20261024000001_lesson_planner.sql` — new (Staging first).
- `web/src/lib/lessons/` — new `xlsx.ts`, `plan.ts`.
- `web/src/app/(portal)/lesson-library/` — new page, actions, upload box.
- `web/src/app/(portal)/batches/` — new `LessonPlanner.tsx`, `PlannerPicker.tsx`, `CompleteLesson.tsx`; changed `actions.ts`, `HomeworkSection.tsx`, `[id]/page.tsx`.
- `web/src/app/(student)/me/homework/page.tsx`, `web/src/components/AppShell.tsx`, `web/src/lib/form.ts` — changed.
- `Help/14-lesson-planner.md` — new guide.

### 2026-10-23 — New students only get future homework
**What changed:**
- A student who joins a batch no longer sees homework set before they joined. Staff can give an older homework with **Give homework** on the batch page.

**Files added / changed / removed:**
- `supabase/migrations/20261023000001_homework_for_new_students.sql` — new (run on Staging first).
- `web/src/app/(portal)/batches/actions.ts` — `giveHomework`.
- `web/src/app/(portal)/batches/HomeworkSection.tsx` — table lists students given the homework; **Not given to** list.
- `Help/09-homework-marking.md` — section 2.1.

### 2026-10-23 — Staging and Production
**What changed:**
- Two environments: Staging (branch `staging`, original Supabase project, test data) and Production (branch `main`, new empty Supabase project).
- All development now goes to `staging`; Production changes only when `staging` is merged into `main`.

**Files added / changed / removed:**
- `Help/13-staging-and-production.md` — new guide.
- `Help/README.md` — rows for guides 10, 12 and 13.
- `Help/01-project-guide.md` — section 10.3 points to guide 13.

### 2026-10-11 — Help folder organised
**What changed:**
- `docs/` renamed to `Help/`; every guide renamed `NN-topic.md` in reading order; links between guides updated.
- Added `README.md` (index), `08-homework-handin-link.md` and `09-homework-marking.md`.
- `02-database-supabase.md` now covers the two later database scripts.
- Current stage and roadmap brought up to date.

**Files added / changed / removed:**
- `Help/HELP.md` → `Help/01-project-guide.md`; `SUPABASE.md` → `02-database-supabase.md`; `help_1.md` → `03-core-admin-screens.md`; `help_enquiry.md` → `04-enquiries.md`; G-Drive guides → `05`–`07`.

### 2026-10-05 — Password reset section
**What changed:**
- Added section 8.6: how password reset works, its Supabase settings, files, code and testing.

**Files added / changed / removed:**
- `docs/HELP.md` — added section 8.6.

### 2026-10-04 — Steps to connect the app to Supabase (Piece 5)
**What changed:**
- Section 5.5 now has the full steps to connect the app to Supabase: install libraries, copy the URL and key, create `web/.env.local`, add `src/lib/supabase/server.ts`, restart, check with a temporary `/check` page, commit.
- Added a troubleshooting row for Supabase connection errors.

**Notes / follow-ups:**
- An empty subjects list at `/check` is expected until real sign-in (Piece 6), because of row-level security.

### 2026-10-04 — Help guide added to the project folder
**What changed:**
- Put this guide in the repository at `docs/HELP.md` (the folder was empty; the guide was only in the Claude project's files).
- Added section 15.1: how to add help information by asking Claude.
- Added a troubleshooting row for the `supabase/` folder not being tracked by Git.

**Files added / changed / removed:**
- `docs/HELP.md` — added: this guide.

**Notes / follow-ups:**
- `supabase/` (migrations and `seed.sql`) is not committed yet. Commit it together with `docs/HELP.md`.
- Decision 7 says "No Tailwind", but `web/package.json` still lists `tailwindcss` and `@tailwindcss/postcss` (left from `create-next-app`). Decide whether to remove them or update decision 7.

### 2026-10-04 — Login page design
**What changed:**
- Designed a modern, mobile-friendly login page, inspired by the existing PencilMaths admin sidebar style (indigo, slate, rounded corners).
- The home page now redirects to `/login`.
- Added design tokens (colours) for the whole app.
- Fixed: email no longer clears after a failed sign-in attempt.

**Files added / changed / removed:**
- `web/src/app/globals.css` — replaced: design tokens and base styles.
- `web/src/app/layout.tsx` — replaced: Geist font, titles (`… · Pencil Maths Admin`), `en-GB`, mobile viewport, no search indexing.
- `web/src/app/page.tsx` — replaced: redirects to `/login`.
- `web/src/app/page.module.css` — removed (welcome page styles no longer used).
- `web/src/components/icons.tsx` — added: shared inline icons.
- `web/src/app/login/page.tsx` — added: layout and brand panel.
- `web/src/app/login/LoginForm.tsx` — added: sign-in / reset form.
- `web/src/app/login/actions.ts` — added: server-side validation (Supabase connection in Piece 5).
- `web/src/app/login/login.module.css` — added: login styles.

**How to check it works:** see [section 8.5](#85-how-to-test-it).

**Notes / follow-ups:** sign-in is not connected yet (Piece 5).

### 2026-10-03 — Project set up
**What changed:**
- Installed Node.js, Git and VS Code.
- Created Supabase project `PencilMaths-Admin`; ran the 4 schema migrations and `seed.sql` (20 tables, 4 views, 4 subjects, 54 curriculum topics; no test data).
- Created `PencilMaths-Admin` folder with `git init`, `docs/`, `supabase/migrations/`.
- Copied the database scripts from the reference project into `supabase/`.
- Created the Next.js 15 app in `web/` with `npx create-next-app@15 web`.
- Ran the app at http://localhost:3000; made the first edit and first commit.

**Notes / follow-ups:** curriculum topics to be reviewed by the teaching lead.

### 2026-09-29 — Architecture review of the phase 1 reference project
**What changed:**
- Reviewed `pencil-maths-portal-phase1/pencil-portal` and documented its architecture (Next.js 15 + Supabase, row-level security, data model, module status).
- Identified the admin module's needs: staff management UI, role enforcement, reference data screens, audit log.

**Notes / follow-ups:** full architecture notes are in the project's `architecture-phase1.md`.
