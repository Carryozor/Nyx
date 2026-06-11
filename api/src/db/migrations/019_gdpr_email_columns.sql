-- GDPR email-based opt-out support.
-- Brokers whose removal path is an Article 17 erasure email (most EU directories)
-- carry a DPO address here; the worker sends the email automatically instead of
-- driving a browser. Language selects the localized template.
ALTER TABLE brokers ADD COLUMN opt_out_email TEXT;
ALTER TABLE brokers ADD COLUMN gdpr_lang TEXT;
