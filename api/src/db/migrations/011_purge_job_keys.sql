-- Purge encrypted_job_key from completed/failed jobs (data minimization).
-- Old keys used a weak derivation (ASCII-padded secret, static salt).
-- New keys use HKDF. Clearing old values limits exposure if DB leaks.
UPDATE scan_jobs SET encrypted_job_key = '' WHERE status IN ('done', 'failed');
-- Reset stuck 'running' jobs to 'queued' for reprocessing with the new key format.
UPDATE scan_jobs SET status = 'queued', started_at = NULL WHERE status = 'running';
