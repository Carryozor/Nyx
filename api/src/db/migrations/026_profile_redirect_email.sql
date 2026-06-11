-- Optional per-profile delegate address: where broker replies should be routed.
-- Plain text (a routing address, not sensitive PII). NULL = default (alias → owner box).
-- The scan alias is assigned to this address's SimpleLogin mailbox when set.
ALTER TABLE profiles ADD COLUMN redirect_email TEXT;
