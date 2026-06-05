-- Remove defunct brokers — sites that no longer exist or are permanently unreachable.
-- Keeping them clutters the UI and opt-out history with useless entries.

DELETE FROM opt_out_requests WHERE broker_id IN ('addresssearch', 'publicrecords', 'fastpeoplesearch');
DELETE FROM brokers          WHERE id         IN ('addresssearch', 'publicrecords', 'fastpeoplesearch');
