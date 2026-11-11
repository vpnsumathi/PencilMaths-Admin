# 21. Google Classroom link and attendance

Built 11 Nov 2026. **Staging only** until go-live. Plan: "Attendance and Google Classroom plan" (Claude Doc, https://claude.ai/artifact/8i9kJeLWu2VKFapG3wnBni).

Each batch can have one **Google Classroom link**. Students in the batch (and the family login) get a class button in their login, and the batch's teacher gets a **Join class** button on the batch page. At class time the student's button says **I'm here, open class**: pressing it is a **portal check-in**. A check-in counts as attended straight away (decided 11 Nov 2026) but shows as **Checked in** until the teacher confirms or corrects it. Staff and the teacher can see and correct attendance in the batch's **Attendance register**. Families see their child's attendance in the student login.

This is stages 1 to 3 of the plan. Stage 4, a **Create** button that makes the Google Classroom from the app (and adds the teacher), comes later, after this has been tested.

---

## 1. Setting it up (once, on Staging)

1. In the Supabase **Staging** project, open **SQL Editor**, paste `supabase/migrations/20261111000001_class_link_attendance.sql` and press **Run**. It needs `20261108000001_gcse_year_groups.sql` (and everything before it) to have run first. It is safe to run twice.
2. Nothing new in `.env.local` or Vercel. No new Google permission is needed: the app does not talk to Google for this.
3. Commit and push the code to the `staging` branch. Vercel redeploys Staging on its own.

Until the script has run, the batch page says "The database is not ready for this yet" in the new sections, and everything else works as before.

## 2. Adding or changing a batch's class link (staff)

1. Create the class in **Google Classroom** as usual and copy its link (it starts with `https://classroom.google.com/`). A Google Meet link (`https://meet.google.com/…`) is also accepted.
2. In the app: **Batches** › the batch › **Google Classroom** card.
3. Paste the link and press **Save link**. The card shows when it was last changed and by whom.
4. To replace it, paste the new link over the old one and press **Save link** again. Students get the new link the next time they press Join class.
5. **Remove link** takes the Join class button away from students and the teacher.

Only Google Classroom and Google Meet links can be saved. Anything else is refused, by the app and by the database.

Teachers see the link and the **Join class** button but cannot change it ("Ask the office to add it").

The **Batches** list also has a **Class** column with **Join class** for open batches that have a link.

## 3. What students and families see

* **My classes**: one big button on each class that has a link. During the check-in times it says **I'm here, open class**; at other times **Open classroom**. The check-in times are written under it (for example "Monday 15:45–17:00, late if more than 10 minutes after the start").
* An **Attendance** line: "Attended 10 of 12 classes · 1 late · 2 absent · 1 checked in, not yet confirmed", over the last 12 weeks, with the last 6 classes listed. An unconfirmed check-in shows as **Checked in** (or **Checked in late**) until the teacher confirms it.
* **Dashboard**: the same button under each class in the Class schedule.
* The button's words are only a guide: the database decides whether a press counts, so a page left open past class time can't check anyone in.
* The link itself is never on the page. Pressing the button asks the app for it, the app records the check-in (only inside the check-in times), then opens Google Classroom in the same tab. Pressing it at other times just opens the class and records nothing. The student sees their check-in under **Attendance** when they come back to My classes.
* A closed batch, or a class the student has left, has no button.

Pressing it twice does no harm: the first press inside the check-in times counts, later ones change nothing.

A family login can switch between its children, so a parent can check in for a child. That is why a check-in is shown as "not confirmed" on the register until the teacher ticks it.

## 4. How the automatic marking works

| When the student presses Join class | Result |
|---|---|
| From **15 minutes before** the class start time up to **10 minutes after** | **Checked in** (counts as present) |
| From 10 minutes after up to **60 minutes after** the start | **Checked in late** (counts as late) |
| Any other time, or on a day with no class | Opens the Classroom, **nothing is recorded** |

* Class times are the batch's **Days and times** (UK time; summer time is handled).
* The first press of a class day creates that day's register, with **every student in the batch marked Absent ("Has not joined")**. Each press then turns that student to Checked in or Checked in late.
* **One class time per batch per day.** Each class day has one register, so the batch form refuses two times on the same day ("A batch can have only one class time on Monday"). Make a second batch if a group really meets twice in a day.
* To change the window (for example for 90-minute classes), change the three numbers in the `class_window()` function in the database script (minutes before, minutes after, late after) and run it again. The batch page and guide text update themselves.

## 5. The Attendance register (staff and the batch's teacher)

On the batch page, press **Attendance** at the top, or scroll to the **Attendance** card.

1. It opens on **today**. Choose another **Class date** and press **Show**, or click one of the **earlier classes** chips (they show joined / total).
2. Each student shows how their mark got there: "Checked in on the portal at 17:02 · not confirmed", "Has not checked in", "Set by Anna Smith", "Not marked yet".
3. Students who have checked in on the portal, or whose mark staff saved, are ticked. Students who **haven't checked in are left unticked**.
4. Tick **Present**, **Late** or **Absent** for anyone, then **Save register**. Only ticked students are saved, so saving during class leaves the others free to check in later.
5. When the class is over, **Save and mark the rest absent** saves your ticks and marks everyone still unticked as Absent.
6. **Saving confirms.** A ticked check-in becomes the teacher's mark when you save. What you save is final: a later check-in never changes it (it only notes the time).
7. **Corrections need a reason.** To change a mark that was already saved, or to give a checked-in student a different mark, type a reason in the small box under that student before saving ("Give a reason for changing Sam One to Absent" if it's missing). Up to 300 characters.
8. **Changes** under a student lists every saved change for that class: when, who, from what to what, and the reason. It can't be edited or deleted.
9. You can take a register by hand on a day with no class planned, or for a past day nobody checked in. Future dates are refused.

The register of a past day lists the students who were in the batch **on that day**: someone who joined later isn't on it and can't be marked for it, and someone who has left since is still there, marked "no longer in this batch". A teacher can only take the register for their own batches.

If nobody checks in and nobody takes the register, the day has no register (so holidays never count as absences). Today's students still show on the batch page as "Not marked yet", ready to take.

## 6. Where else attendance shows

* **Student page** (staff and the teacher): an **Attendance** card, last 12 weeks, with the latest classes (unconfirmed ones say Checked in). The teacher sees only their own classes.
* The older "Attendance %" in the student page header (last 28 days) includes these registers too.
* Neither counts a student as absent while their class is still running (until the check-in times have ended).

## 7. Testing on Staging

1. Run the script (section 1). Pick a test batch and add a class time for **today**, a few minutes from now.
2. Paste a Google Classroom link on the batch and save.
3. Sign in as a test student in that batch (guide 12). **My classes** shows Join class. Press it: Google Classroom opens.
4. Back on the batch page, **Attendance** shows the student "Checked in on the portal at … · not confirmed" ticked as Present, and everyone else unticked, "Has not checked in".
5. Change the student to Late: **Save register** asks for a reason. Type one and save, then open **Changes** under the student to see it. Press the button again as that student: their mark stays Late. Check in as a second student: they still show Checked in, because the save didn't touch them.
   As the student, the button says **I'm here, open class** during the check-in times and **Open classroom** outside them.
6. Press **Save and mark the rest absent**: everyone still unticked becomes Absent.
7. Check the family login and the student page show the attendance line.
8. Automated tests: `bash "Automation Testing/run-database-tests.sh" class-link` (108 checks; the whole suite is 466 with the AI scripts).

## 8. Limits

* A check-in shows the class was **opened from the portal**, not that the student stayed. The teacher confirms or corrects it.
* Batches that already had two class times on one day keep them until they are next saved, when the form asks for one to be removed. To list them, run in the SQL Editor:
  `select b.code, bs.weekday, count(*) from batch_slots bs join batches b on b.id = bs.batch_id group by b.code, bs.weekday having count(*) > 1;`
* A student who opens Google Classroom some other way (its app, an old bookmark) is not counted; the teacher marks them by hand.
* Students use their **parent's Google account**: the Classroom must allow personal accounts (classes made from a personal Gmail do). Google says children 13 and under should use Classroom through Google Workspace for Education; worth checking before relying on it.

## 9. Go-live

Run `20261111000001_class_link_attendance.sql` on **Production** after `20261108000001`, as part of the go-live list. Run the automated tests first.
