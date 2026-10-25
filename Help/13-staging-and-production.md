# PencilMaths-Admin — Help: Staging and Production

> Two copies of the app: **Staging** for building and testing, **Production** for real families.
> All new work goes to Staging first. Production only changes when you decide to go live.

| | |
|---|---|
| **Last updated** | 23 October 2026 |
| **Set up on** | 23 October 2026 |
| **Rule** | Develop on `staging`. Merge into `main` only when you decide to go live |
| **Plan it came from** | `plans/staging-and-production.md` in the Claude project |

---

## Contents

1. [The two environments](#1-the-two-environments)
2. [Your computer: stay on staging](#2-your-computer-stay-on-staging)
3. [Every change](#3-every-change)
4. [Database scripts](#4-database-scripts)
5. [Going live (Staging to Production)](#5-going-live-staging-to-production)
6. [Settings (Vercel environment variables)](#6-settings-vercel-environment-variables)
7. [Admin logins and passwords](#7-admin-logins-and-passwords)
8. [Troubleshooting](#8-troubleshooting)
9. [Good to know](#9-good-to-know)

---

## 1. The two environments

| | Staging | Production |
|---|---|---|
| Purpose | Build and test. Test data only | Real families, students and staff |
| Git branch | `staging` | `main` |
| Web address | `https://staging-pencilmaths.vercel.app` | `https://pencil-maths-admin.vercel.app` |
| Vercel | Same project, **Preview** deployments of branch `staging` | Same project, **Production** deployments |
| Supabase | The original project (has dummy data) | New project, started empty (schema + subjects only) |
| Google Drive folder | `PencilMaths` for now (see 9) | `PencilMaths` |
| `web/.env.local` on your computer | ✅ points here | ❌ never |

```
your computer ──git push──► staging branch ──► staging-pencilmaths.vercel.app ──► Staging Supabase
                                 │
                       (only when you decide)
                          git merge into main
                                 ▼
                            main branch ──► pencil-maths-admin.vercel.app ──► Production Supabase
```

---

## 2. Your computer: stay on staging

Once, in `PencilMaths-Admin`:

```powershell
git checkout staging
git pull
git branch          # the * must be next to staging
```

Leave it on `staging`. VS Code shows the branch name in the bottom-left corner.

Keep `web/.env.local` pointing at the **Staging** Supabase project, so local testing never touches real data.

---

## 3. Every change

1. Make the change (or Claude writes it into the folder).
2. Test locally (`npm run dev`).
3. Save it to Staging:
   ```powershell
   git status
   git add -A
   git commit -m "What changed"
   git push
   ```
4. Vercel builds the staging site by itself. Check **Vercel › Deployments**: a new **Preview** row for `staging` turns **Ready**.
5. Test on `https://staging-pencilmaths.vercel.app`.

Production does not change.

---

## 4. Database scripts

A new file in `supabase/migrations/` changes the database, so it has to be run on each Supabase project separately.

| When | Run it on |
|---|---|
| While building | **Staging** Supabase only (SQL Editor › paste › Run) |
| When going live | **Production** Supabase, just **before** merging into `main` |

- Keep a note of which scripts Production has had. The last one run on Production when it was set up was `20261020000006_student_handed_in_files.sql`.
- ⚠️ **Never** run `dummy_data.sql` or `clear_dummy_data.sql` on Production.
- Always check the project name at the top left of Supabase before pressing Run.

**Production was built with these, in order:** the 4 base scripts `20260928000001`–`04`, then `seed.sql`, `20261007000001`, `20261011000001`, `20261020000001`–`06`.

---

## 5. Going live (Staging to Production)

When everything works on Staging:

1. Run any new database scripts on **Production** (section 4).
2. Merge and push:
   ```powershell
   git checkout main
   git pull
   git merge staging
   git push
   git checkout staging
   ```
3. Vercel builds Production. Check **Deployments**: the new **Production** row turns **Ready**.
4. Sign in on `https://pencil-maths-admin.vercel.app` and check the new feature.
5. Back on `staging` (the last command did that), carry on working.

**Undo a bad release:** Vercel › Deployments › the previous Production deployment › ⋯ › **Promote to Production** (or **Instant Rollback**). This switches the site back at once. A database script is not undone by this.

---

## 6. Settings (Vercel environment variables)

Vercel › project › **Settings › Environment Variables**. Each variable has one value for **Production** and one for **Preview, branch `staging`**.

| Variable | Production | Preview (`staging`) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Prod project URL | Staging project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Prod publishable key | Staging publishable key |
| `SUPABASE_SECRET_KEY` (Sensitive) | Prod secret key | Staging secret key |
| `NEXT_PUBLIC_SITE_URL` | `https://pencil-maths-admin.vercel.app` | `https://staging-pencilmaths.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | same | same |

**Where the Supabase values are:** in each Supabase project:
- **URL:** Project Settings › Data API (or the **Connect** button). It must be exactly `https://<ref>.supabase.co`, with **nothing after `.co`** (no `/rest/v1/`, no `/`).
- **Publishable and secret keys:** Project Settings › API Keys (older style: `anon` and `service_role`).

**Rules:**
- The three Supabase values must all come from the **same** project.
- Never put `NEXT_PUBLIC_` in front of the secret key.
- After changing any variable: **Deployments › ⋯ › Redeploy** (untick build cache). `NEXT_PUBLIC_` values are baked in when the site is built, so saving alone changes nothing.

**Supabase sign-in links** (each project › Authentication › URL Configuration):

| | Site URL | Redirect URLs |
|---|---|---|
| Production | `https://pencil-maths-admin.vercel.app` | `https://pencil-maths-admin.vercel.app/**` |
| Staging | `https://staging-pencilmaths.vercel.app` | `https://staging-pencilmaths.vercel.app/**`, `http://localhost:3000/**` |

---

## 7. Admin logins and passwords

Each Supabase project has its **own** logins. Your Staging login does not work on Production, and the other way round.

**Add an admin to Production**
1. Prod Supabase › Authentication › Users › **Add user › Create new user**, tick **Auto confirm**.
2. SQL Editor:
   ```sql
   insert into staff (id, full_name, email, role, active)
   select id, 'Full Name', email, 'admin', true from auth.users where email = 'name@example.com';
   ```
3. Check: `select s.full_name, s.email, s.role, s.active, u.email_confirmed_at from staff s join auth.users u on u.id = s.id;`

**Reset a password**
- Easiest: **Forgot password** on the sign-in page (needs the project's email set up).
- Or Supabase › Authentication › Users › ⋯ › **Send password recovery**.
- Or set it directly with SQL (no email). It sets the password and checks it in one go; the result must show `password_ok = true`:
  ```sql
  with p as (select 'NewPassword'::text as pw)
  update auth.users
  set encrypted_password = extensions.crypt((select pw from p), extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where lower(trim(email)) = lower(trim('name@example.com'))
  returning email, encrypted_password = extensions.crypt((select pw from p), encrypted_password) as password_ok;
  ```
  Avoid a `'` in the password. Delete the query from SQL history afterwards.

---

## 8. Troubleshooting

| Problem | Cause and fix |
|---|---|
| "Email or password is incorrect" but the password is right | The app shows this for **any** sign-in error from Supabase. Check Supabase › **Logs › Auth / Edge** for the real error. Usually the URL or a key is wrong in Vercel |
| Supabase log shows `POST 404 /rest/v1/auth/v1/token` | `NEXT_PUBLIC_SUPABASE_URL` ends in `/rest/v1/`. Set it to `https://<ref>.supabase.co` only, then redeploy (this happened on 23 Oct 2026) |
| Nothing at all in the Prod Supabase logs when signing in | The site is still using the Staging project: Production variables wrong or not redeployed |
| "Invalid API key" | A key from the other project. All three Supabase values must match one project |
| Changed a variable, nothing different | Redeploy (section 6) |
| No new staging build after a push | Check you pushed `staging` (`git branch`, `git push`). Vercel › Deployments, filter by branch `staging` |
| Production shows the change before you merged | Something was pushed to `main`. Check `git branch` before committing |
| Invite or reset email opens the wrong site | `NEXT_PUBLIC_SITE_URL` and Supabase URL Configuration (section 6) |
| Free Supabase project paused | Free projects pause after a week unused. Restore it in Supabase, or upgrade Production to Pro |

---

## 9. Good to know

- **Google Drive is shared for now.** Both sites use the same Drive folder `PencilMaths`, so test students on Staging also get Drive folders there. Planned change: a `DRIVE_ROOT_FOLDER` setting (`PencilMaths` on Production, `PencilMaths Staging` on Staging) in `web/src/lib/google/drive.ts`. Until then, delete test students' Drive folders by hand, or avoid creating students on Staging.
- **Cost:** branch domains and branch-only Preview settings work on Vercel's free Hobby plan. Supabase's free plan allows 2 active projects.
- **Backups:** Supabase Pro has daily backups. On the free plan, export Production now and then.
- **Optional safety net:** GitHub › repo **Settings › Branches** › add a rule for `main` that requires a pull request, so nothing reaches Production by accident.
