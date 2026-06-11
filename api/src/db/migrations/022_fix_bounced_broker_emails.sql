-- Fix the 10 GDPR-email addresses that bounced ("Adresse introuvable") in the first scan.
-- 6 corrected with addresses verified from each operator's official privacy policy;
-- 4 reverted to manual (web-form-only removal or operator/address unverifiable) so they
-- stop auto-sending to dead addresses.

-- ── Corrected (verified official DPO addresses) ────────────────────────────
UPDATE brokers SET opt_out_email='dpo@solocal.com'                       WHERE id='pagesjaunes';      -- Solocal DPO
UPDATE brokers SET opt_out_email='dpo@kompass.com'                       WHERE id='kompass-fr';       -- Kompass DPO
UPDATE brokers SET opt_out_email='dpo@yell.com'                          WHERE id='yell';             -- Yell DPO
UPDATE brokers SET opt_out_email='info@italiaonline.it', gdpr_lang='it'  WHERE id='paginebianche';    -- SEAT→Italiaonline
UPDATE brokers SET opt_out_email='mesdonneespersonnelles.laposte@laposte.fr' WHERE id='annuaire-laposte'; -- La Poste
UPDATE brokers SET opt_out_email='rgpd@scores-decisions.com'             WHERE id='verif-com';         -- Scores&Décisions

-- ── Reverted to manual (no reliable email — web form / unverifiable) ────────
UPDATE brokers SET type='manual', opt_out_email=NULL WHERE id='192dotcom';      -- 192.com web removal form
UPDATE brokers SET type='manual', opt_out_email=NULL WHERE id='telefonbuch-de'; -- 11880.com web form
UPDATE brokers SET type='manual', opt_out_email=NULL WHERE id='copainsdavant';  -- CCM Benchmark/Figaro, address unverified
UPDATE brokers SET type='manual', opt_out_email=NULL WHERE id='dastelefonbuch'; -- DTM, address unverified
