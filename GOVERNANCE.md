# Governance, Security & Data Protection

How Lightrees Mentoring CRM meets good corporate governance (GCG) expectations for a multi-company SaaS platform, and what remains on the roadmap. Written for Lightech management, client companies and auditors.

## 1. Principles → controls

| GCG principle | What it means here | Control in the product |
|---|---|---|
| **Transparency** | Every change is traceable | Server-side **audit log** (who, what, when, which company); lead stage history with actor; Lightech mode banner when Lightech staff view a company |
| **Accountability** | Clear owner for every decision and record | Each lead has a PIC; each client has a coach + assistant; Owner role per company; Lightech Super Admin vs Admin |
| **Responsibility** | Protect client data | Server-side sign-in, salted SHA-256 password hashes never sent to browsers, 5-attempt lockout, 6-hour sessions, security headers |
| **Independence** | Companies cannot see or influence each other | Tenant isolation enforced on the server for every read and write; login code & suspension controlled by Lightech only |
| **Fairness** | Same rules for everyone, measured on results | Role-based access matrix; leaderboard on revenue closed (SUKA / Self Compensation) from the same data for all |

## 2. Roles & access (RACI)

| Activity | Lightech Super Admin | Lightech Admin | Company Owner | Company Admin/CS | Mentor / BD | Client |
|---|---|---|---|---|---|---|
| Create / suspend / delete company | **A/R** | R (no delete) | I | – | – | – |
| Company branding, funnel, programs | C | C | **A/R** | R | – | – |
| User accounts & roles | C | C | **A/R** | R | – | – |
| Leads & sessions | – | – | A | R | **R** (own scope) | – |
| Client program data | – | – | A | R | R (own clients) | View own |
| Audit review | **A/R** | R | R (own company, roadmap) | – | – | – |

A = accountable, R = responsible, C = consulted, I = informed.

## 3. Data protection (UU PDP No. 27/2022 alignment)

| Requirement | Status |
|---|---|
| Purpose limitation: data only for coaching sales & delivery | ✅ Fields limited to contact, pipeline and program data |
| Data minimisation | ✅ No ID numbers, no payment data stored |
| Access control & confidentiality | ✅ Server-side RBAC + tenant isolation |
| Integrity & traceability | ✅ Audit log, stage history |
| Data portability / subject access | ✅ JSON backup and CSV export per company |
| Deletion on request | ✅ Delete lead / client / account; delete company (Super Admin) |
| Breach detection | ⚠️ Manual: failed-login entries in audit log. Roadmap: alert to WhatsApp/email |
| Data processing agreement with each company | ⚠️ To prepare: Lightech = processor, company = controller |
| Data residency | ⚠️ Google Workspace region. Roadmap option: Indonesian region on production database |

## 4. Change management

1. All code lives in Git (`oasys-lightrees/mentoring_app`). Changes go through a branch + pull request.
2. Automated tests before release: `npm test` (server isolation checks + browser end-to-end in three storage modes).
3. Deploy with a backup of the previous version and a 1-minute rollback ([DEPLOY.md](DEPLOY.md)).
4. Default passwords are flagged in the console until changed; demo sign-in must be switched off before real data.

## 5. Known limits & roadmap (honest view)

| Limit today | Risk | Plan |
|---|---|---|
| Google Sheets as database | Performance beyond ~20k rows | Migrate to Supabase/Postgres with row-level security |
| Polling sync every 15 s | Small delay between users | Realtime channel on production database |
| No 2FA | Account takeover if a password leaks | TOTP 2FA for Owners and Lightech admins |
| Company-level audit view | Owners rely on Lightech for audit exports | Audit tab inside each company for Owners |
| Claude Artifact demo link | Readable by anyone with the link; outside users cannot save | Use only for demos with example data; production is lightech.co.id/alpha + server |
