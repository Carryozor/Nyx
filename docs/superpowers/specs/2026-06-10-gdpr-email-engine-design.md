# GDPR Auto-Send Email Engine — Design (Sub-project 1)

Date: 2026-06-10
Status: Approved

## Problem

Most European data brokers do not expose a web opt-out form — their removal path is a
GDPR Article 17 erasure request **sent by email** to a DPO/privacy address. Today these
brokers are stored as `manual` (script_file = NULL) and require the user to send the
email by hand. We want to automate sending the erasure email.

Constraint discovered: the system has **no outbound email capability**. The existing
email infra (`worker/src/email-checker.ts`) only *reads* SimpleLogin alias activities to
detect inbound confirmation emails.

## Decision

- Add outbound email behind a transport-agnostic `MailSender` interface, with two
  implementations selected by env:
  - **Cloudflare Email Service REST API** (preferred). Cloudflare Email Routing is
    inbound-only; the Email Service (public beta) sends to arbitrary recipients. Crucially
    Cloudflare treats Reply-To as a first-class field (`reply_to`) and **rejects** a raw
    `Reply-To` header — so the SMTP path is unreliable for our needs and REST is used.
  - **Generic SMTP** (nodemailer) — fallback for non-Cloudflare setups.
- Send the erasure email with **`Reply-To` = the profile's SimpleLogin confirmation
  alias**, so broker replies land in the alias the existing `email-checker` already
  monitors → `confirmed` with no new loop.
- Env: `MAIL_FROM` (onboarded sender), `CF_EMAIL_ACCOUNT_ID` + `CF_EMAIL_API_TOKEN`
  (Email Sending: Edit), or `SMTP_HOST/PORT/USER/PASS`.

## Components

1. **Schema** (`api` migration): add columns to `brokers`:
   - `opt_out_email TEXT` — broker DPO/privacy address. Presence marks a GDPR-email broker.
   - `gdpr_lang TEXT` — template language (fr/en/de/es/it/nl/pl).

2. **Dispatch** (`worker/src/broker-runner.ts`): before launching Chromium, short-circuit —
   if the broker row has `opt_out_email`, call the GDPR sender (no browser), update
   `opt_out_requests`, emit event, return. Checked **before** the existing manual
   (`script_file === null`) short-circuit.

3. **Sender** (`worker/src/gdpr-email.ts`): `sendGdprEmail(broker, pii, replyTo, transport?)`.
   - No SMTP configured → `{ status: 'failed', reason: 'SMTP non configuré…' }` (graceful,
     no regression on existing scrapers).
   - Success → `{ status: 'awaiting_email', confirmationPattern: <broker email domain> }`.
   - Send error → `{ status: 'failed', reason }`.
   - Transport is injectable for testing.

4. **Templates** (`worker/src/gdpr-templates.ts`): `buildGdprEmail(broker, pii)` →
   `{ subject, text }` localized by `gdpr_lang`, interpolating PII (name, full address,
   optional DOB), citing GDPR Art. 17.

5. **Config** (`worker/src/config.ts`): optional `SMTP_HOST`, `SMTP_PORT` (default 587),
   `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Added to `compose.yml` + `.env`.

6. **Confirmation loop**: reuse `email-checker.ts` unchanged (matches `confirmation_pattern`).

## Data flow

```
job-runner → runBroker → broker has opt_out_email?
  → sendGdprEmail() [no browser] → status=awaiting_email, confirmation_pattern=domain
  → (later) email-checker sees broker reply in alias → status=confirmed
```

## Testing

- Unit (`worker/src/__tests__/gdpr-email.test.ts`): mocked nodemailer transport asserts
  To / Reply-To / subject / body / language; status transitions; SMTP-absent path.
- Integration: in-memory DB + mocked transport through `runBroker` dispatch.
- No real erasure emails sent to real DPOs during verification — live SMTP test targets the
  operator's own address.

## Out of scope (sub-project 2)

- Catalogue mapping (each EU broker → DPO email + lang) and new PL/NL/BE/CH brokers.
- Playwright form scripts for EU brokers that DO have a web form.
