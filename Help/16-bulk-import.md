# 16 — Settings and Bulk import

> Added 2 November 2026. Built on **Staging**. Production gets it at go-live (see section 6).

## 1. What it does

- The sidebar has a new **Settings** link (admins only). It opens to **Staff** (moved here from the main menu) and **Bulk import**. Old `/staff` links still work: they go to `/settings/staff`.
- **Bulk import** loads a spreadsheet of students with their year, batch, teacher and class times. In one go it:
  - finds or adds each **teacher**,
  - finds or adds each **batch** (subject Maths unless the file says otherwise) with its **class times**,
  - finds or adds each **student** and puts them in their batch,
  - makes a **Google Drive folder** for each new student (as when a student is added by hand).
- **Check file** first: it shows exactly what Import will do and saves nothing. **Import** then saves it all at once; if anything goes wrong nothing is saved.
- **No duplicates:** importing the same file again changes nothing. Import an updated file and only the differences are applied (a moved student, new class times, a new teacher for a batch).

## 2. The spreadsheet

One row per student. Headings in the first row, in any order (the sample `Student_Batches_By_Year.xlsx` is exactly this):

| Year | Batch | Student Name | Teacher Name | Batch Time |
|---|---|---|---|---|
| Year 2 | Batch 1 | Nevaeh Mariam | Agnes | Monday: 4.30 to 5.30 p.m.<br>Wednesday: 4.30 to 5.30 p.m. |

- **Year:** `Year 2` or `2` (Year 1 to Year 10), or **`GCSE-H`** and **`GCSE-F`**. `GCSE - H`, `GCSE H`, `GCSE Higher`, `Higher` (and the same for F, Foundation) also work, in any capitals. A row that still says `Year 11`, `Year 12` or `Year 13` is refused: "\"Year 11\" is no longer a year group. Use GCSE-H or GCSE-F." (since 8 Nov 2026, guide 02).
- **Batch:** a name such as `Batch 1`. It only has to be unique within a year and subject: "Year 2 Batch 1" and "Year 3 Batch 1" are different batches.
- **Student Name / Teacher Name:** the first word is the first name, the rest the last name. One name is fine (`Ithika`, `Agnes`).
- **Batch Time:** one day per line in the cell (Alt+Enter in Excel), or separated by `;`. Examples that work: `Monday: 4.30 to 5.30 p.m.`, `Saturday: 11 am to 12 p.m.`, `Thu 17:00`. Only the **start** time is kept (batches store start times only). If there is no am/pm at all, 1 to 7 o'clock is taken as afternoon.
- **Subject** (optional column): `Maths`, `Science`, `English`, `11+ Prep` (or `maths`, `eleven_plus`…). Without it every row is Maths.
- `.xlsx` or `.csv`, up to 1000 rows. The first sheet that has the headings is used.

Every row of the same batch must have the same teacher and the same batch time, and a student can only be listed once per subject. The check lists any row that breaks this, with its row number.

## 3. How things are matched (so nothing is added twice)

| | Matched to an existing one when… | Otherwise |
|---|---|---|
| Teacher | Same full name (teachers who have left are ignored). A first name alone (`Agnes`) matches if exactly one teacher has that first name. | Added as a new active teacher for that subject, with the years from the file |
| Batch | An **open** batch with the same subject, year and name. Or else an open batch **without a name** with the same subject, year, teacher and class times (it is given the name). | Added with places = 3, or more if the file has more students for it |
| Student | Same full name (students who have left are ignored); if two match, the one in the same year. A first name alone matches if exactly one student in that year has that first name. | Added as a new active student (with their own family and hand-in link) |

Then for each student:
- not in a batch of that subject yet → **added** to the batch;
- in another batch of that subject → **moved** to the batch in the file;
- already in that batch → nothing changes.

For a batch that already exists, a different teacher or different class times in the file **replace** the ones in the portal (shown as "Update" in the check). If the file puts more students in a batch than it has places, its places are raised to fit (up to 12). Students already in a batch who are **not** in the file stay where they are: the check lists them under "Good to know".

If a name is ambiguous (two teachers called Agnes, two Year 3 students called Eric), nothing is imported and the check says which row to fix: write the full name as it appears in the portal.

## 4. Using it

1. **Settings › Bulk import**.
2. Choose the spreadsheet and press **Check file**.
3. Read the result:
   - a red box lists problems with row numbers. Fix the spreadsheet and check again;
   - otherwise a green line gives the totals, then the teachers, batches and students with what will happen to each.
4. Press **Import N rows**. The page then makes the Google Drive folders for the new students, a few at a time ("Making Google Drive folders… 5 of 15"). If some fail, open those students and press **Create Drive folder**.
5. Check **Batches** and **Students**. Batches now show their name next to the code (`B-004 · Batch 1`), and the name can be edited on the batch page.

## 5. The standalone script (without the portal)

`supabase/scripts/bulk-import-to-sql.mjs` turns the spreadsheet into a SQL file for the Supabase SQL Editor. It is useful to load data into a database before the new portal code is live there.

```powershell
node supabase\scripts\bulk-import-to-sql.mjs "C:\path\Student_Batches_By_Year.xlsx"
```

1. It writes `Student_Batches_By_Year.import.sql` next to the spreadsheet.
2. Open the SQL Editor of the right project (**check the name at the top left**), paste the whole file and **Run**. As written it only checks: the result's `errors` must be `[]`; `batches` and `students` say what would happen.
3. Change the `true` on the last line to `false` and **Run** again to import.
4. New students have no Drive folder yet: open each one in the portal and press **Create Drive folder**. (The portal page does this for you, so prefer it once the code is live.)

The script needs the database script from section 6 first.

## 6. Database changes

`supabase/migrations/20261102000001_bulk_import.sql` (run after `20261027000004_teacher_login.sql`):

- `batches.name` (optional) and a rule that two open batches of the same subject and year can't share a name.
- `batch_list` view: adds `name` (and no stray "." after a student with no last name).
- `save_student`: only the **first name** is required now. Student and teacher forms show **Last name (optional)**.
- `import_parse_times`, `import_times_label`, `import_norm`: helpers that read the spreadsheet cells.
- `bulk_import(rows, dry_run)`: does the matching and saving described above, in one transaction. Admins only (plus the service key and the SQL Editor). With `dry_run = true` everything is undone at the end, and the B-/PM-/T- code counters are put back so checks don't use up numbers.

**Staging:** run it in the Staging SQL Editor before using the page. **Production:** run it at go-live, after `20261027000001`–`04`.

## 7. Files

| File | Job |
|---|---|
| `web/src/app/(portal)/settings/page.tsx`, `settings.module.css` | Settings page with a tile per settings page |
| `web/src/app/(portal)/settings/staff/` | Staff page (moved from `(portal)/staff/`) |
| `web/src/app/(portal)/staff/page.tsx` | Sends old `/staff` links to `/settings/staff` |
| `web/src/app/(portal)/settings/import/page.tsx`, `ImportForm.tsx`, `import.module.css` | Bulk import page: choose file, check, import, Drive folders |
| `web/src/app/(portal)/settings/import/actions.ts` | `bulkImport` (check or import), `makeDriveFolders` |
| `web/src/lib/import/rows.ts` | Reads the .xlsx/.csv and finds the columns by their headings |
| `web/src/components/AppShell.tsx`, `AppShell.module.css`, `icons.tsx` | Settings group in the sidebar |
| `supabase/scripts/bulk-import-to-sql.mjs` | Standalone script (section 5) |
| `supabase/migrations/20261102000001_bulk_import.sql` | Database changes (section 6) |

## 8. How to test it on Staging

1. Run `20261102000001_bulk_import.sql` in the **Staging** SQL Editor.
2. Sign in as an admin. The sidebar shows **Settings**; clicking it shows **Staff** and **Bulk import** under it. Operations and head-teacher logins don't see Settings, and `/settings/import` sends them to the dashboard.
3. **Bulk import** › choose `Student_Batches_By_Year.xlsx` › **Check file**. Expect: 15 rows, no problems, 2 teachers (Agnes, Alifya), 8 batches with times like `Mon 16:30, Wed 16:30` and `Mon 18:30, Sat 11:00`, 15 students. Any test teacher/student with the same name is shown as "Existing".
4. **Import 15 rows**. Drive folders are made for the new students. Batches shows B-codes with names; each student is in the right batch.
5. **Check file** again with the same file: everything is "Already there" / "Already in this batch". Importing again adds nothing.
6. Change a cell (move Riyana to Batch 1 of Year 4, or change a time), check: that row shows "Moved from Year 4 Batch 2" / "Update: class times".
7. Break a row (time `Someday`, year `Reception`) and check: the red box lists the row numbers and nothing is saved.
8. Change a row's year to `GCSE-H` and check: no problem, and the batch shows as GCSE - H. Change it to `Year 11`: the red box says to use GCSE-H or GCSE-F.
