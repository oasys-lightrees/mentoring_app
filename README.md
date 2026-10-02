# Lightrees Mentoring CRM

White-label **Lead → Deal → Client** CRM for coaching, mentoring, training and consulting companies.
Each company (AlphaLeaders, PIWA, iPlus, …) gets its own branded app; Lightech manages all of them from one console. UI in **English / Bahasa Indonesia** (toggle top-right).

## How people sign in

| Who | Link | What they see |
|---|---|---|
| A company's team (e.g. AlphaLeaders) | app link + `#alphaleaders` | Only their brand: logo, colours, terminology, data. No other company is ever shown. |
| Lightech admins | app link (no code) or `#lightech` → sign in with a Lightech account | **Lightech Console**: every company, stats, create / edit / suspend companies, open any company as Owner. |

Cloud app: [Claude Artifact](https://claude.ai/artifact/PDk86467k37K7Qs4wWPKoh) · AlphaLeaders: `…/PDk86467k37K7Qs4wWPKoh#alphaleaders`

**Demo credentials** (password `demo` everywhere — change before go-live):
- Lightech Super Admin: `super@lightech.co.id`
- Company owners: `owner@alphaleaders.id`, `owner@piwa.id`, `owner@iplus.id` (plus one-click demo buttons per role on each company's sign-in page)

## Features

| Area | What it does |
|---|---|
| **White-label tenants** | Per-company brand name, colour, tagline, terminology (Mentor → Coach/Teacher/PT/Consultant, Session → Class/Webinar/Workshop), funnel stages, session types, programs, sources. The company Owner configures it in **Settings**. |
| **Lightech Console** | Company list with users, leads, deals won, revenue, active clients, last activity. Create company from a template (with or without example data), set login code, suspend (blocks sign-in), reset owner password, delete. Manage Lightech admins. "Open" a company as its Owner with a visible Lightech banner. |
| **Roles inside a company** | Owner, Admin/PA/CS, Senior Mentor, Mentor, Asst. Mentor (linked to a mentor), BD/Sales, Client. Menus and data scoped per role. |
| **Lead & pipeline** | Lead form (duplicate WhatsApp check), drag-and-drop kanban, Won requires deal value, Lost requires a reason, stage SLA "idle" flag, next action + overdue. |
| **Sessions** | Types linked to funnel stages; booking a session moves the lead forward automatically. Notes, action items, one-click WhatsApp reminder, assistant auto-assigned. |
| **Clients** | Deal Won creates a client with program, coach, assistant and period. Session progress, action items, renewal countdown, churn-risk flag. Client portal login. |
| **Dashboard** | KPIs, funnel conversion, needs-action list, BD leaderboard (SUKA), upcoming sessions, performance by lead source. |
| **Data** | Cloud (artifact database, real-time) or local browser storage. JSON backup/restore, CSV export, delete example data for go-live. |

## Project layout

```
index.html                  app shell (local mode)
assets/presets.js           company templates, roles, permission matrix, reserved login codes
assets/app.js               storage backends, tenants, Lightech console, RBAC, all views, EN/ID strings
assets/app.css              Lightrees design system (navy/gold, Plus Jakarta Sans), light & dark
scripts/build-artifact.mjs  builds dist/artifact.html for the Claude Artifact
```

Cloud data model: `platform/main` (Lightech admins) · `ws/{id}` (company: name, slug, status, config, accounts, programs) · `ws/{id}/leads|sessions|clients/{doc}`.

Update the cloud app: `node scripts/build-artifact.mjs`, then republish `dist/artifact.html` with `assets/*` to the same artifact URL.

## Known limits (pilot stage)

- **Isolation is enforced in the app UI, not on the server.** Everyone who can open the artifact link can technically read every company's records (including hashed passwords) through the browser. Fine for a demo / internal pilot; for real external companies, move to a backend with server-side tenant rules (Supabase RLS or Odoo).
- On a Claude Artifact, only the owner's organization members (or people invited as Editor) can **save**; outside viewers are read-only. External company teams need the production deployment.

## Roadmap

1. **Production hosting**: own domain per company (`crm.alphaleaders.id`), Supabase auth + row-level security per tenant.
2. **Automation**: WhatsApp API reminders (H-1), Meta Ads lead webhook, round-robin BD assignment (n8n).
3. **AI**: automatic session summaries and client progress reports.
4. **Billing for Lightech**: plan per company, usage dashboard in the console.
