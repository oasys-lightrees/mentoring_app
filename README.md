# Lightrees Mentoring CRM

White-label **Lead → Deal → Client** CRM for coaching, mentoring, training and consulting companies.
Each company (AlphaLeaders, PIWA, iPlus, …) gets its own branded app; Lightech manages all of them from one console. UI in **English / Bahasa Indonesia** (toggle top-right).

## Where it runs

| Mode | URL | Data & sign-in | Use for |
|---|---|---|---|
| **Production** | `lightech.co.id/alpha/` (static files) + Google Apps Script API | Google Sheet; sign-in, tenant isolation & audit log enforced **on the server** | Real companies — see [DEPLOY.md](DEPLOY.md) |
| **Demo** | [Claude Artifact](https://claude.ai/artifact/PDk86467k37K7Qs4wWPKoh) | Artifact database, real-time | Presentations with example data |
| **Local** | open `index.html` | This browser only | Offline demo / development |

The app picks the mode automatically: `assets/config.js → apiUrl` set → Production; inside a Claude Artifact → Demo; otherwise Local.

## How people sign in

| Who | Link | What they see |
|---|---|---|
| A company's team (e.g. AlphaLeaders) | app link + `#alphaleaders` | Only their brand: logo, colours, terminology, data. No other company is ever shown. |
| Lightech admins | app link (no code) or `#lightech` | **Lightech Console**: every company, stats, create / edit / suspend companies, open any company as Owner, audit log (Production). |

Demo credentials (Demo & Local modes, password `demo`): `super@lightech.co.id`, `owner@alphaleaders.id`, `owner@piwa.id`, `owner@iplus.id`, plus one-click buttons per role on each company's sign-in page. Production creates its own one-time admin password during setup.

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
index.html                  app shell
assets/config.js            deployment config (apiUrl)
assets/presets.js           company templates, roles, permission matrix, reserved login codes
assets/app.js               storage backends (server / artifact / local), tenants, Lightech console, RBAC, views, EN/ID
assets/app.css              Lightrees design system (navy/gold, Plus Jakarta Sans), light & dark
server/Code.gs              Production API on Google Apps Script + Sheets (auth, isolation, audit)
scripts/build-deploy.mjs    builds dist/alpha + dist/lightech-alpha.zip for lightech.co.id/alpha
scripts/build-artifact.mjs  builds dist/artifact.html for the Claude Artifact
tests/                      server isolation tests + browser end-to-end for all three modes
```

## Tests

`npm install && npx playwright install chromium && npm test` runs:
- `tests/server.test.js`: 25 checks on the API (tenant isolation, password redaction, governance rules, lockout, suspension, audit)
- `tests/e2e-server.js`: 17 browser checks against the real `server/Code.gs` through an in-memory Apps Script harness (also runs against the built package: `BASE=file://$PWD/dist/alpha/index.html`)
- `tests/e2e-local-cloud.js local|cloud`: white-label flows, console, language toggle, suspension, data integrity when re-opening a company

## Governance

Security, data protection (UU PDP) and change management: see [GOVERNANCE.md](GOVERNANCE.md).

## Roadmap

1. **Production hosting**: own domain per company (`crm.alphaleaders.id`), Supabase auth + row-level security per tenant.
2. **Automation**: WhatsApp API reminders (H-1), Meta Ads lead webhook, round-robin BD assignment (n8n).
3. **AI**: automatic session summaries and client progress reports.
4. **Billing for Lightech**: plan per company, usage dashboard in the console.
