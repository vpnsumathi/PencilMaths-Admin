# 19. Page speed review

**Date:** 3 November 2026. This review only read the code; nothing was changed at the time.  
**Section:** Process Improvement / Optimization (see the [Help index](README.md)). The database side is covered in more depth by [guide 18](18-database-performance-review.md).  
**Status (6 Nov 2026):** P2, P3, P4 and P5 are done. P6 and P8 are partly done. P1 is a settings check that is still to confirm. P7 is replaced by guide 18. See **Progress since the review** below.

It was based on the code in your folder (Staging) as it stood on 3 November, and on a production build (`next build`, Next.js 15.5.27).

## Summary

The app is already lean in the browser. Every page except two sends about 105–110 kB of JavaScript, and most of the work happens on the server. So the slowness people feel is **not** the size of the pages. It comes from three things:

1. **Waiting on the server before anything shows.** No page has a `loading.tsx` or `<Suspense>`. Clicking a menu link keeps the old page on screen, with no sign that anything is happening, until every database query for the new page has finished.
2. **Database round trips in a chain.** Each page load checks the login 2–3 times and runs several queries one after another. If Vercel and Supabase are in different regions, each step costs an extra 70–100 ms.
3. **Some queries do far more work than the page needs.** The dashboard works out every student's 28-day attendance and homework figures even though it never shows them. It also fetches whole tables and counts them in JavaScript, which is the 1000-row issue F2 from the [architecture review](17-architecture-review.md).

The fixes below are listed in order of benefit for the effort. None of them weakens a security rule. Every query still runs as the signed-in person, so the database rules still decide what they can see.

| # | Change | Gain | Effort | Risk |
|---|---|---|---|---|
| P1 | Check that Vercel and Supabase are in the same region | Large (every query) | 5 min | None |
| P2 | Add `loading.tsx` skeletons to the portal and student area | Large (how fast it feels) | Small | None |
| P3 | Check the login once per request, not 2–3 times | Medium (100–300 ms per page) | Small | Low, if done as described |
| P4 | Run the batch page's queries side by side | Medium (batch page) | Small | None |
| P5 | Stop the dashboard computing unused student figures | Medium to large as data grows | Small | None |
| P6 | Count on the dashboard in the database, not in JavaScript | Large as data grows; fixes F2 | Medium | Low |
| P7 | Speed up the database rules with `(select is_staff())` | Medium on big lists | Small | Low |
| P8 | Stream the slow parts of the batch page | Medium (batch page) | Small | None |
| P9 | Small items: one index, the marking page, phone layout | Small each | Small | None |

### Progress since the review

| # | Status | What was done |
|---|---|---|
| P1 | ⬜ To confirm | A settings check in Supabase and Vercel. Nothing in the code to change. |
| P2 | ✅ Done (3 Nov) | `loading.tsx` skeletons in `(portal)` and `(student)`, using `components/Skeleton.tsx`. No separate one for the batch page. |
| P3 | ✅ Done (3 Nov) | `getClaims()` in `middleware.ts` and `getUserId()` in `lib/auth.ts`. `requireAdmin()` now uses `getViewer()`. The login check only skips the network call once Supabase uses the newer signing keys (**Project Settings › JWT Keys**), which is still optional. |
| P4 | ✅ Done (3 Nov) | The batch page runs its queries together. `HomeworkSection.tsx` runs its three lookups together. |
| P5 | ✅ Done (3 Nov) | The dashboard reads `students` with their enrolments, not `student_list`. |
| P6 | 🟡 Partly (3 Nov) | At your request the attendance tile and chart, the date range filter, classes logged, homework % and hand-in rate by batch were removed. The "this week" figures are counted in the database. The handed-in and not-handed-in lists still fetch rows, so they can still reach the 1,000-row limit (F2 in [guide 17](17-architecture-review.md)). |
| P7 | ↪ Replaced by [guide 18](18-database-performance-review.md) D1 (built 6 Nov, `20261106000001_faster_database.sql`) | Tests on 5 Nov showed that wrapping `is_staff()` alone barely helps (20.7 s → 20.0 s). The cost is in the teacher rules, which guide 18 rewrites. The advice below to leave the teacher rules as they are was wrong. |
| P8 | 🟡 Partly (3 Nov) | The dashboard Homework panel streams in `<Suspense>`. The batch page's homework section does not yet. |
| P9 | ⬜ Not started | The `enrolments(student_id)` index for past enrolments is not added, and it is not in the guide 18 draft either. The other items need no change. |

---

## P1. Put Vercel and Supabase in the same region (check first)

> ⬜ **To confirm.** Check both regions as described below.

**What happens now.** Each page runs about 5–12 Supabase calls: the login check in `middleware.ts`, `getViewer()` in `lib/auth.ts` (the login check again, the `staff` table, sometimes `current_teacher`), and then the page's own queries. Some of these run one after another.

**The problem.** Vercel runs server code in the region set for the project. Older projects default to Washington, D.C. (`iad1`). If the Supabase projects are in London (`eu-west-2`) or another European region, every call crosses the Atlantic and back, about 70–100 ms each. Five calls in a chain then add half a second before the page can even start to draw. This is likely the biggest single cause of slow pages, and it costs nothing to fix.

**What to do.**
- In Supabase, open **Project Settings › General** and note each project's region (Staging and Production).
- In Vercel, open **Project › Settings › Functions › Function Region** and choose the nearest match (London is `lhr1`). Then redeploy.
- If Staging and Production use separate Vercel projects or environments, check both.

**Trade-off.** None. Families and staff are in the UK, so London is also closest to them.

## P2. Show a loading skeleton straight away

> ✅ **Done (3 Nov).** `(portal)/loading.tsx` and `(student)/loading.tsx`, built from `components/Skeleton.tsx`.

**What happens now.** There are no `loading.tsx` files and no `<Suspense>` anywhere in `web/src`. All portal pages are rendered on the server for each visit (the build marks them as ƒ, dynamic). When you click **Students**, the browser keeps showing the old page until the whole Students page is ready on the server, and nothing on screen says it is working. People click again, which starts the load over.

**What to do.** Add three small files:
- `app/(portal)/loading.tsx`: a grey header bar and a few grey table rows, using the existing `ui.module.css` look.
- `app/(student)/loading.tsx`: the same idea for `/me`.
- Optionally `app/(portal)/batches/[id]/loading.tsx`, because it is the heaviest page.

Next.js shows the skeleton as soon as a link is clicked, and keeps the menu (the layout) on screen. It can also prefetch the skeleton for links in the menu, so the switch feels immediate.

**Benefit.** The single biggest improvement to how fast the app *feels*, for about 30 lines of code.

**Trade-off.** None. The real page replaces the skeleton as soon as it is ready. Error pages (added today) still work.

## P3. Check the login once per request

> ✅ **Done (3 Nov).** `getClaims()` in middleware and in `getUserId()`. `requireAdmin()` builds on `getViewer()`. Optional: switch Supabase to the newer signing keys so the check needs no network call.

**What happens now.**
- `middleware.ts` calls `supabase.auth.getUser()` on every request, which is a network call to Supabase Auth.
- `getViewer()` (`lib/auth.ts`) calls `getUser()` again, then reads the `staff` row, and for a teacher also calls `current_teacher`.
- `requireAdmin()` does not use `getViewer()`. It calls `getUser()` and reads `staff` again. So on the Subjects page and the Settings pages, the portal layout and the page each check the login separately.

So a normal portal page spends 2–3 login checks plus 1–2 lookups before it starts on its own data.

**What to do.**
1. **Middleware:** replace `getUser()` with `getClaims()`. Your Supabase library (2.117) already supports it. Once the project uses the newer signing keys (Supabase **Project Settings › JWT Keys**, the asymmetric keys), `getClaims()` checks the login token on the server itself, without a network call. Middleware only needs "is someone signed in?" to decide whether to send them to `/login`, and it still refreshes the login cookie.
2. **`requireAdmin()`:** build it on `getViewer()`, which is already cached for each request: `const v = await getViewer(); if (v?.kind !== 'staff' || v.role !== 'admin') redirect(...)`. That removes one login check and one `staff` query from the admin pages.
3. **Keep `getUser()` (or `getClaims()`) inside `getViewer()`.** This is what security depends on: the page must make sure the login is real before it uses it. `getClaims()` does that check too, so either is safe. What must not be used to decide access is `getSession()`, which only reads the cookie without checking it.

**Benefit.** About 1–2 fewer round trips on every page: 100–300 ms if P1 is not fixed, and still around 20–50 ms after it.

**Trade-off.** `getClaims()` only works without a network call after switching to the newer signing keys. Before that it quietly falls back to a network call, so nothing breaks, but nothing speeds up either. A login that was signed out elsewhere is still accepted by middleware until its token expires (up to an hour). That is acceptable, because every database query is still checked by Supabase.

## P4. Run the batch page's queries side by side

> ✅ **Done (3 Nov).** One `Promise.all` on the batch page, and one in `HomeworkSection.tsx`.

**File.** `app/(portal)/batches/[id]/page.tsx`, lines 33–71.

**What happens now.** Six queries run together (good). Then three more run **one after another**: the Lesson library count, all homework with who received it, and the homework sent for each topic. After that, `HomeworkSection.tsx` runs up to four more queries in a chain (sheets, then results, then markups, then files). That is about 7 database waits in a row before the batch page can be shown.

**What to do.**
- Move the three later queries into the first `Promise.all`. They only need the batch `id`, which the page already has. The library count needs the batch's subject and year, so either run it straight after the batch query, or change it to one query by `batch_id`. Keep `notFound()` where it is.
- The topic homework query can come from `allHomework` if `topic_id` is added to its `select`, which removes one query.
- In `HomeworkSection.tsx`, the results, markups and files queries all depend only on the list of sheet ids, so run those three together with `Promise.all`.

**Benefit.** The batch page drops from about 7 waits in a row to about 3.

**Trade-off.** None. The same queries run, under the same rules.

## P5. Stop the dashboard computing unused student figures

> ✅ **Done (3 Nov).** The dashboard reads `students` with `enrolments(...)` embedded, with no new view.

**Files.** `_dashboard/data.ts` line 61, and the `student_list` view (`20260928000002`, now `20261103000002`).

**What happens now.** The dashboard reads `student_list` for its student counts. The view joins `student_stats`, which works out each student's attendance and homework percentages over the last 28 days. Because the view groups by those columns, the database works them out for **every student**, even though the dashboard only reads names, year, status and subjects.

**What to do.** For the dashboard, read only what it needs:
- either a small new view, `student_overview` (the student row, `subject_ids`, `missing_teacher`, `missing_batch`, with no stats join);
- or read `students` with `enrolments(subject_id, teacher_id, batch_id)` embedded, and work out the flags in JavaScript.

Keep `student_list` for the Students page, which does show the percentages.

**Benefit.** Removes 2 subqueries per student on every dashboard visit. This grows with the number of students.

**Trade-off.** One more view to keep up to date, with `security_invoker` like the others.

## P6. Count on the dashboard in the database (also fixes F2)

> 🟡 **Partly done (3 Nov).** Most of the counted sections were removed at your request, and the "this week" figures are counted in the database. The handed-in and not-handed-in lists still fetch rows. No `dashboard_summary` function was built.

**Files.** `_dashboard/data.ts`, lines 58–81, and `_dashboard/homework.ts`.

**What happens now.** The dashboard downloads every student, every attendance row in the date range, every homework result in the range, and every enquiry, then counts them in JavaScript. On 90 days this is thousands of rows. Supabase also stops at 1000 rows without warning, so the figures quietly become wrong once the school grows (architecture review F2).

**What to do.** Add one database function, `dashboard_summary(p_from date, p_to date)`, that returns the tiles and charts already counted (`count(*) filter (...)`, `group by`). Mark it `security invoker`, so a teacher still only counts their own students. The page then makes one call and receives a few hundred bytes instead of thousands of rows.

**Benefit.** The dashboard stays fast as data grows, and the figures stay correct past 1000 rows.

**Trade-off.** This is the biggest change in this list (about half a day, with tests). The counting logic moves from TypeScript to SQL. Test it by comparing the new tiles with the current ones on Staging data.

## P7. Make the database rules cheaper on big lists

> ↪ **Replaced by [guide 18](18-database-performance-review.md), finding D1.** Measured on 5 Nov: the teacher rules run first on every row, even for staff, and wrapping `is_staff()` alone barely helps. Guide 18 rewrites the teacher rules as lists worked out once per query. Use that instead of the advice below.

**Files.** `20260928000003_security.sql` (`using (is_staff())` on every table) and the teacher rules in `20261027000004_teacher_login.sql` (`teaches_batch(batch_id)` and similar).

**What happens now.** Written as `using (is_staff())`, Postgres may run `is_staff()`, which is itself a query on `staff`, once **per row**. On lists of thousands of rows (attendance, homework results), that adds up. Supabase's own performance guide recommends wrapping it as `using ((select is_staff()))`, which runs once per query.

**What to do.** In a new script, recreate the staff policies with `(select is_staff())` and `(select is_admin())`. Leave the teacher rules that pass a column, such as `teaches_batch(batch_id)`, as they are, because they must run per row. For those, the lookups inside the functions are already indexed.

**Benefit.** Large lists get noticeably faster for staff, with exactly the same rules.

**Trade-off.** It is a rewrite of every staff policy, so test it like the teacher login: as admin, as a teacher, and signed out.

## P8. Stream the slow parts of the batch page

> 🟡 **Partly done (3 Nov).** The dashboard's Homework panel streams. The batch page's `<HomeworkSection>` is not wrapped yet.

After P4, the batch page will still wait for homework (the slowest part) before showing anything. Put `<HomeworkSection>` inside `<Suspense fallback={<SkeletonCard />}>`. The class details, students and lesson plan then appear first, and homework fills in a moment later. The same applies to the dashboard's Homework panel (`HomeworkPanel`).

**Trade-off.** The page fills in two steps. The order stays the same, so nothing jumps around if the skeleton is about the right height.

## P9. Smaller items

> ⬜ **Not started.** The `enrolments(student_id)` index is still to add. The other items need no change.

- **Indexes.** The main lookups are already indexed: homework by batch, by topic and by Lesson library sheet, and Drive folders by student. One gap is `enrolments(student_id)` for past enrolments: the current index only covers open ones, and the student page reads both. This is one line in a script, with no effect on behaviour. After the next real data load, open Supabase's **Advisors › Performance**, which lists missing indexes and slow rules for the live data.
- **Marking page (`/batches/[id]/mark`, 289 kB).** This is mostly `pdfjs-dist`, and it already loads only when needed (`import()` in `Marker.tsx`). The PDF.js worker file could also be served from `/public` so the browser caches it once. This is a minor gain on teachers' phones.
- **`/auth/accept` (179 kB).** It loads the whole Supabase browser library to read the invite link. That's fine for a page people open once. Leave it.
- **Phone layout.** The layouts already adapt to screen size, using `@media` breakpoints in `ui.module.css`, `AppShell.module.css` and `dashboard.module.css`, and wide tables scroll sideways inside their frame. Two improvements:
  - On phones, the Students list (11 columns) could hide the least-used columns (Teachers, Created / modified) below 768 px with a CSS class, keeping Name, Year, Batches and Status.
  - The marking page should be checked on a real phone, because pen input and page zoom matter more there than speed.
- **Search on Students.** `ilike '%name%'` cannot use an index, but at a few hundred students it takes under a millisecond. Only add a trigram index (`pg_trgm`) if the list grows past several thousand.
- **Images and fonts are already right.** They use `next/image` and `next/font` (Geist), so nothing to do there.

## What not to do

- **Don't cache pages or queries across people** (`unstable_cache`, `revalidate`, `'use cache'`) for anything read with the signed-in person's login. The database rules give each person different rows, so a shared cache could show one teacher another teacher's students. The only safe candidates are values that are the same for everyone, such as the subjects list, and the gain there is tiny.
- **Don't fetch data in the browser** (React Query, SWR) to "speed up" pages. The server components are already the fast path. Moving reads into the browser would add round trips and copy the rules into a second place.
- **Don't switch the server's database access to the secret key** to skip the rules for speed. With P7, the rules cost very little.
- **Don't add an extra API layer or a separate backend.** Supabase called directly from server components is the simplest and fastest setup for an app this size.

## Suggested order

1. **Today, with no code change:** P1 (check regions).
2. **One short session:** P2 (loading skeletons), P3 (single login check), P4 (batch page queries run together). This is app code only, with no database script.
3. **Next database script:** P5, P7 and the P9 index together, tested on Staging the same way as earlier scripts.
4. **Before the school passes about 300 students or a term of data:** P6 (dashboard counted in the database), then P8 (streaming).

To check each step worked, open a page with the browser's **Network** tab, or look at the function duration in Vercel's **Logs**, before and after.
