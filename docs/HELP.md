# PencilMaths-Admin — Project Help Guide

> **Living document.** Update this file every time you change the project (see [How to update this guide](#15-how-to-update-this-guide)).
> Keep it in the repository at `PencilMaths-Admin/docs/HELP.md` and commit it together with the change it describes.

| | |
|---|---|
| **Last updated** | 5 October 2026 |
| **Current stage** | Piece 4 done (project created, login page designed). Next: Piece 5, connect the app to Supabase. |
| **Where this guide lives** | `PencilMaths-Admin/docs/HELP.md` (master copy). A copy is kept in the Claude project's files. |
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
| Import | Loading students from a spreadsheet (CSV) | Not started |
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
├── docs/
│   └── HELP.md                    ← this guide
├── supabase/
│   ├── migrations/                ← database scripts, run in order
│   │   ├── 20260928000001_schema.sql
│   │   ├── 20260928000002_views_and_functions.sql
│   │   ├── 20260928000003_security.sql
│   │   └── 20260928000004_student_functions.sql
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

**Why the app lives in `web/`:** npm does not allow capital letters in app names, so `PencilMaths-Admin` cannot be the app folder itself. Keeping the app in `web/` also leaves room for `supabase/` and `docs/` beside it.

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
/reset-password  ←  /auth/callback (swaps the code for a session)  ←  user clicks link
       ↓
updatePassword()  →  password saved  →  home page (signed in)
```

1. The user enters their email on the login page.
2. Supabase emails them a one-time link.
3. The link opens `/auth/callback`, which signs them in for this browser.
4. `/reset-password` lets them choose a new password, then sends them to the home page.

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
| `web/src/app/auth/callback/route.ts` | Landing point for the email link; signs the user in |
| `web/src/app/reset-password/page.tsx` | The "Choose a new password" screen |
| `web/src/app/reset-password/actions.ts` → `updatePassword` | Checks and saves the new password |

#### The code, briefly

**`sendReset`** (login/actions.ts)

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
});
return { ok: 'If that email belongs to a staff account, a reset link is on its way.' };
```

- `resetPasswordForEmail` makes Supabase send the email.
- `redirectTo` is where the link leads: the callback, then `/reset-password`.
- The same message is shown whether the email exists or not, so strangers can't find out who has an account.

**`/auth/callback`** (route.ts)

```ts
const code = searchParams.get('code');
const { error } = await supabase.auth.exchangeCodeForSession(code);
if (!error) return NextResponse.redirect(`${origin}${next}`);
return NextResponse.redirect(`${origin}/login`);
```

- A `route.ts` returns a response (here a redirect) instead of a page.
- The link carries a one-time `code`. `exchangeCodeForSession` swaps it for a signed-in session saved in cookies.
- Success goes to `next` (`/reset-password`); failure goes back to `/login`.
- The code only works in the **same browser** that requested the reset (security check).

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
4. Commit (section 11).

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
| 5 | Connect the app to Supabase: install libraries, `.env.local`, show subjects from the database | ⏭ Next |
| 6 | Real sign-in: invite yourself, add your `staff` row as `admin`, sign in/out, password reset links | Planned |
| 7 | Protect pages: only signed-in staff can see the portal (middleware + layout check) | Planned |
| 8 | App shell: sidebar navigation (mobile menu) and dashboard | Planned |
| 9 | Admin module: manage staff (invite, role, deactivate) | Planned |
| 10 | Admin module: subjects and curriculum topics | Planned |
| 11 | Audit log; then Students, Teachers, Batches… | Planned |

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

1. Put the information in the right section of `docs/HELP.md` (or add a new section and list it in Contents).
2. Update **Last updated** at the top and add a change log entry (section 17).
3. Share the updated file back in the project so the project's copy matches.

You then commit `docs/HELP.md` as usual (section 11).

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
