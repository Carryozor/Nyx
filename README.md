<div align="right"><a href="./README.fr.md">🇫🇷 Version française</a></div>

# Nyx

**Privacy-first, zero-knowledge automation for data-broker opt-outs and GDPR erasure requests.**

Nyx helps you remove your personal data from data brokers and people-search sites. It
automates both **web-form opt-outs** (headless browser) and **GDPR Article 17 erasure
emails**, tracks every request to confirmation, and keeps your personal data encrypted
end-to-end — the server never sees it in clear text.

> Status: private project. Self-hosted via Docker Compose.

---

## Key features

- **Zero-knowledge PII** — personal data is encrypted client-side intent with a master
  password (argon2id key derivation, AES-GCM). The server stores only ciphertext and can
  never read it without the password.
- **Two opt-out engines**
  - **Browser automation** (Playwright + stealth) for brokers with web forms, with
    automatic Cloudflare challenge solving via FlareSolverr.
  - **GDPR e-mail engine** — sends localized Article 17 erasure requests (FR, EN, DE, ES,
    IT, NL, PL) to broker DPO addresses via SMTP (Brevo) and tracks replies.
- **Automatic confirmation** — reply detection through SimpleLogin alias monitoring flips
  a request to *confirmed* without manual checking.
- **Broker targeting**
  - **By audience** — `private` / `professional` / `both`. Business-data brokers (e.g.
    Altares, Kompass, Infogreffe) are only contacted for professional scans.
  - **By country / region** — pick exact countries (e.g. FR + PL) or a region: **EU**,
    **Europe** (incl. CH/UK), **US**, or all.
  - **Expert mode** — hand-pick individual brokers, each tagged with its type.
- **Professional profiles** — optional company block (legal name, SIREN, SIRET, legal
  form) injected into erasure emails sent to B2B brokers.
- **Reply redirection** — route a profile's broker replies to a delegate mailbox so a
  third party can handle follow-up, without exposing your own inbox.
- **Mail budget guard** — a daily send counter (correlated with the Brevo quota) blocks a
  scan before it would exceed the limit; live quota shown when a Brevo API key is set.
- **Role-based access control** — four hierarchical roles and per-profile sharing.
- **Scheduling, history & evidence** — recurring auto-scans, full scan history, per-broker
  status, screenshots, and manual guides for brokers that can't be automated.

---

## Roles & sharing (RBAC)

Hierarchical roles — each rank inherits the rights below it:

| Role | Can do |
|------|--------|
| **viewer** | Read profiles shared with them: statuses, scan history, broker reports. No actions. |
| **editor** | + Launch scans and manage schedules on accessible profiles; set reply redirection. |
| **manager** | + Create / own / edit / delete their own profiles (multiple); share them. |
| **admin** | + Full access to all profiles; manage users and invitations. |

A profile owner (or admin) shares a profile read/act access with a **viewer** or **editor**
via a `profile_access` grant. Editing and decryption stay restricted to the owner or admin.

---

## How a scan works

```
Profile (encrypted PII) ──► Launch scan (audience + country filter / expert mode + redirect)
        │                            │
        │                    mail-budget gate (Brevo quota) — 409 if over
        ▼                            ▼
   per-broker opt-out          worker picks up the job
        │                            │
   ┌────┴─────────────┐              ▼
   │ web-form broker  │     browser automation (Playwright + FlareSolverr)
   │ email broker     │     GDPR erasure email (SMTP/Brevo, From = monitored alias)
   └──────────────────┘              │
                              broker reply ──► SimpleLogin alias ──► auto-confirmed
                                                     └► (optional) forwarded to delegate
```

---

## Architecture

| Component | Stack |
|-----------|-------|
| **API** | Node.js, Fastify, better-sqlite3, Zod, JWT (httpOnly cookies), argon2id |
| **Worker** | Node.js, Playwright (+ stealth), FlareSolverr, nodemailer, vitest |
| **Frontend** | React 19, Vite, Tailwind CSS, Zustand |
| **Database** | SQLite (file-based, migration-driven) |
| **Email** | Brevo SMTP (sending), SimpleLogin (aliases + reply monitoring) |
| **Infra** | Docker Compose (api · worker · flaresolverr) |

Crypto: profile PII is encrypted with a key derived from the user's master password
(argon2id) and AES-GCM. Per-scan job keys are wrapped with a server `WORKER_SECRET` (HKDF)
so the worker can decrypt PII during a scan, then purged.

---

## Configuration

Environment variables (set via the deployment `.env`, prefixed `NYX_` in Compose):

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET`, `WORKER_SECRET` | Auth signing & PII key-wrapping secrets (≥ 32 chars) |
| `MAIL_FROM` | Sender address for GDPR emails (a monitored SimpleLogin alias) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Brevo SMTP relay |
| `MAIL_DAILY_CAP` | Daily mail budget (default `300`, the Brevo free tier) |
| `BREVO_API_KEY` | *(optional)* Brevo API key to display the live quota |
| `WEBHOOK_SECRET` | Inbound webhook signature secret |

The SimpleLogin API key is stored client-side and used to create per-scan aliases and read
reply activity for auto-confirmation.

---

## Development

```bash
# API
cd api && npm install && npm run dev
npx vitest run          # tests

# Worker
cd worker && npm install && npm run dev
npx vitest run

# Frontend
cd frontend && npm install && npm run dev
npm run build           # production build

# Full stack (Docker)
docker compose build && docker compose up -d
```

Database migrations run automatically on API start. The codebase follows a test-driven
workflow (unit + integration with vitest).

---

## Security & privacy notes

- Personal data is never stored or logged in clear text; the server cannot decrypt it
  without the user's master password.
- Sessions use httpOnly, `SameSite=strict` cookies; passwords are argon2id-hashed.
- API keys (SimpleLogin, Brevo) are kept out of the repository and injected via environment.
- Outbound requests are GDPR Article 17 erasure requests on behalf of the data subject.

---

*Nyx is a personal, self-hosted tool. Use it only to act on your own personal data or data
you are authorized to act upon.*
