-- Scripts return 'manual' immediately; keep them in automated scans so the manual guide is surfaced to users
UPDATE brokers SET type = 'semi' WHERE id IN ('whitepages', 'radaris');

-- IP-banned at Cloudflare level — disable to avoid wasting scan time
UPDATE brokers SET active = 0 WHERE id = 'fastpeoplesearch';
