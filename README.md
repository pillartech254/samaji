# Samaji — School Management Platform (deployable web app)

A database-driven feature-flag licensing platform. **Four front-ends, one backend:**

| Portal | Path | Who | Sees |
|---|---|---|---|
| Admin console | `/admin/` | super_admin | every school, all flags, subscriptions |
| School portal | `/school/` | school_admin | their school only — license-gated UI |
| Teacher portal | `/teacher/` | teacher | their own classes/subjects, attendance, grading, report books and payslips only |
| Parent portal | `/parent/` | parent | their own children's records, fees, and M-Pesa payments only |

All three are **static HTML/JS** that talk directly to **Supabase** (hosted Postgres + Auth).
The licensing logic lives in the database as the `resolve_flags()` function, so there is
**no server to run or maintain.** That makes it a perfect fit for **Cloudflare Pages** (free).

```
webapp/
├─ index.html          landing → pick a portal
├─ admin/index.html    provider console
├─ school/index.html   school portal
├─ teacher/index.html  teacher portal
├─ parent/index.html   parent portal
├─ supabase/functions/ Edge Functions (admin user management, M-Pesa STK push)
├─ assets/
│  ├─ config.js        ← the ONLY file you edit (Supabase keys)
│  ├─ app.js           shared client + module metadata
│  └─ styles.css       shared styles
├─ setup.sql           run once in Supabase to create everything
├─ _headers, _redirects  Cloudflare Pages config
└─ README.md
```

---

## A. Create the backend (once, ~5 min)
1. Go to **https://supabase.com** → create a free project (pick a region near your schools).
2. Open **SQL Editor → New query**, paste all of **`setup.sql`**, click **Run**.
   This creates the licensing tables, security (RLS), the `resolve_flags()` resolver, and seed data.
3. **New query** again, paste all of **`setup-modules.sql`**, **Run**.
   This adds the working-module tables (students, attendance, grades, fee_invoices) with their
   own RLS, plus a few demo students for Greenwood.
4. **New query** again, paste all of **`setup-modules-2.sql`**, **Run**.
   Adds the Exams and Library tables (+ demo books).
5. **New query** again, paste all of **`setup-modules-3.sql`**, **Run**.
   Adds the Timetable and Communications tables (+ a demo announcement).
6. **New query** again, paste all of **`setup-modules-4.sql`**, **Run**.
   Adds the Transport tables (+ demo routes). Analytics needs no new tables.
7. **New query** again, paste all of **`setup-modules-5.sql`**, **Run**.
   Adds the Payroll tables (staff, payroll_runs, payslips) + demo staff.
8. **New query** again, paste **`setup-modules-6.sql`**, **Run** — SMS (secures the credit
   ledger, adds the message log, seeds an opening balance for Greenwood).
9. **New query** again, paste **`setup-modules-7.sql`**, **Run** — Biometric + API/Webhooks tables.
10. **New query** again, paste **`setup-modules-8.sql`**, **Run** — academic setup: classes &
    streams, dormitories, richer student biodata, fee structures/items, and payments/receipts.
    Auto-seeds the Kenyan CBC class levels (PP1–Grade 9) for every school.
11. **New query** again, paste **`setup-modules-9.sql`**, **Run** — fee-collection idempotency
    guard + bus transport toggle on payments.
12. **New query** again, paste **`setup-modules-10.sql`**, **Run** — subjects catalog, teacher
    directory, and per-class subject/teacher assignment.
13. **New query** again, paste **`setup-modules-11.sql`**, **Run** — Parent Portal backend:
    `parent_accounts`, M-Pesa config/transactions, school backups, and the `admin_*` RPCs the
    `admin-users` Edge Function and admin console use to create/reset/delete portal logins.
14. **New query** again, paste **`setup-modules-12.sql`**, **Run** — fixes a `auth.users.phone`
    unique-constraint bug in `admin_create_user` (empty-string phones collided on the 2nd user).
15. **New query** again, paste **`setup-modules-13.sql`**, **Run** — adds `profiles.teacher_id`,
    exam grading columns, and a `teacher_payroll` table from an earlier, simpler pass at the
    Teacher Portal. **Not used by this repo's `/teacher/` app** (see the note at the top of
    `setup-modules-14.sql`) — safe to run for the other schema pieces it carries.
16. **New query** again, paste **`setup-modules-14.sql`**, **Run** — wires the Teacher Portal
    actually used here: lets a teacher sign up at `/teacher/` and auto-links to their `teachers`
    row by email, splits payroll into named allowance lines + a `staff_deductions` table for
    loans/salary advances, and tightens payroll RLS so a teacher can only ever see their **own**
    payslips (admins keep full access exactly as before).
17. **Edge Functions**: deploy `supabase/functions/admin-users` and `supabase/functions/mpesa-stk`
    (`supabase functions deploy admin-users` / `mpesa-stk`) and set their secrets
    (`SUPABASE_SERVICE_ROLE_KEY`, M-Pesa Daraja credentials) in Project Settings → Edge Functions.
18. **Authentication → Providers → Email**: enable it. For a fast demo, turn **off**
    "Confirm email" (re-enable for production).
19. **Project Settings → API**: copy your **Project URL** and **anon public key**.

> Tip: you can also paste all the `setup*.sql` files into one query in order and run once.

## B. Configure the app
Open **`assets/config.js`** and paste your two values:
```js
window.SAMAJI_CONFIG = {
  SUPABASE_URL:      "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...your-anon-key..."
};
```
> The anon key is **safe to commit** — it's a public client key, and Row-Level Security in
> `setup.sql` is what actually protects the data.

## C. Push to GitHub
```bash
cd webapp
git init
git add .
git commit -m "Samaji school platform"
git branch -M main
git remote add origin https://github.com/<you>/samaji.git
git push -u origin main
```
(Or use GitHub Desktop / the website "upload files" button — any method works.)

## D. Deploy on Cloudflare Pages
1. **https://dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick your repo.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`  (the repo root *is* the site — it's already static)
     *If you committed the `webapp` folder inside a larger repo, set this to `webapp`.*
3. **Save and Deploy.** In ~30 seconds you get a live URL like
   `https://samaji.pages.dev`.
4. In **Supabase → Authentication → URL Configuration**, add that URL to **Site URL** /
   **Redirect URLs** so logins are allowed.

Every `git push` now redeploys automatically.

## E. Log in
**Admin:** open `/admin/`, click **Create an account**, sign up. The first user is made
`super_admin` by a trigger in `setup.sql`. You'll see all seeded schools and their live flags.

**School:** create a second user, then link them to a school as a school_admin —
**SQL Editor → New query**:
```sql
update profiles
set role = 'school_admin', school_id = 'SCH-10428'   -- Greenwood (seeded)
where id = 'PASTE-USER-UID-HERE';                     -- from Authentication → Users
```
Open `/school/`, sign in as that user → you see Greenwood's license-gated workspace.
Change its license from the admin side (or via SQL) and refresh — the school UI follows.

---

## Troubleshooting

### "No schools visible" + 403 errors in the browser console
If the console shows `Failed to load resource: … 403` for queries (even `modules`/`packages`),
the API roles have **no table privileges**. Tables made in the SQL editor are owned by
`postgres`; `authenticated`/`anon` get nothing by default, so PostgREST returns 403 before
RLS even runs. Fix it once:
```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
```
Then hard-refresh. (Current `setup.sql` already includes this block.)

### "No schools visible" in the admin console
You're signed in but the school list is empty. Work through these in order:

1. **Confirm your role.** The console header now shows `email · role: …`. If it isn't
   `super_admin`, fix your profile row:
   ```sql
   insert into profiles (id, role)
   select id, 'super_admin' from auth.users where email = 'YOU@EXAMPLE.COM'
   on conflict (id) do update set role = 'super_admin';
   ```
   The signup trigger only creates a profile for accounts made **after** `setup.sql` ran —
   accounts created earlier have no profile and resolve to no access.

2. **Confirm the schools seeded.** `select id, name from schools;` should return rows.
   If empty, re-run `setup.sql` (it's idempotent).

3. **Fix the SECURITY DEFINER search_path (most common cause when 1 & 2 are fine).**
   If your role is `super_admin` and schools exist but the list is still empty, the
   permission helper can't resolve the `profiles` table. Re-run this:
   ```sql
   create or replace function is_super_admin()
   returns boolean language sql stable security definer
   set search_path = public as $$
     select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
   $$;
   create or replace function my_school()
   returns text language sql stable security definer
   set search_path = public as $$
     select school_id from profiles where id = auth.uid();
   $$;
   grant execute on function is_super_admin() to authenticated;
   grant execute on function my_school()    to authenticated;
   ```
   Then **hard-refresh** the page (Ctrl+Shift+R). (Current `setup.sql` already includes this.)

4. **Still stuck?** Open the browser console on `/admin/` and run:
   ```js
   window.getSB().from('schools').select('*').then(r => console.log(r.data, r.error));
   ```
   A non-null `error` is the exact RLS/permission message; an empty array with no error
   means a stale token — sign out and back in.

## Custom domain (optional)
Cloudflare Pages → your project → **Custom domains** → add `app.yourschoolsaas.com`.
For per-school subdomains (`greenwood.yourapp.com`), add a wildcard `*.yourapp.com` and read
`location.hostname` to pick the school — a later enhancement.

## What's done vs. next
**Working now:**
- Real auth (Supabase), real Postgres, the `resolve_flags()` resolver, and RLS.
- **Admin console writes:** change a school's **base package** and **add / remove add-ons**.
- **School portal — all 14 modules functional** (real CRUD against Postgres, RLS-scoped):
  Students, Attendance, Gradebook, Fees, Exams, Library, Timetable, Communications, Transport,
  Analytics Pro, Payroll, SMS Gateway, Biometric, API & Webhooks. Each renders only when its
  feature flag resolves true; locked ones sit under "Not in your plan".
  - **Payroll** computes PAYE / NSSF / SHIF / Housing Levy and produces payslips.
  - **SMS** meters real credits (ledger balance, send debits, top-ups) — delivery is simulated.
  - **Biometric** manages devices + student enrollment; **API** issues keys + webhooks.
- **Dashboard KPIs** are computed from live queries (student count, today's attendance %, outstanding fees).
- Modules render only when their flag resolves true; locked ones sit under "Not in your plan".

**Next (platform, not modules):** Stripe billing + dunning, trial-expiry / cache jobs, and
wiring a real SMS carrier (Africa's Talking) behind the now-functional SMS metering. Note:
some modules aren't in Greenwood's default plan (e.g. Transport) — add them from the admin
console to use them; that's the licensing model proving itself.

> **Caveats for production:** Payroll tax rates are a 2024/25 approximation — verify with KRA.
> SMS delivery is simulated (metering is real). API keys are stored plainly for the demo — hash
> them in production. Biometric hardware sync needs an on-prem agent. Re-run the security
> checklist below before go-live.

### Try the full loop
1. Sign in to `/admin/`, pick **Greenwood**, **+ Add** Payroll → `module.payroll` = true.
2. Open `/school/` as Greenwood's school_admin → Payroll appears in the sidebar.
3. Open **Students** → enrol a student. Open **Fees** → issue them an invoice, mark it paid —
   the Dashboard's outstanding-fees KPI updates. All persisted in your database.

## Security checklist before real use
- [ ] Re-enable email confirmation in Supabase Auth.
- [ ] Change the signup trigger default from `super_admin` to `school_admin` (see `setup.sql`).
- [ ] Review every RLS policy; add write policies per the RBAC matrix in the handoff doc.
- [ ] Restrict Supabase Auth redirect URLs to your real domain(s).
