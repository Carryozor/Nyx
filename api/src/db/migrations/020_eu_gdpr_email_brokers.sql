-- Wire existing European brokers to the GDPR auto-send email engine.
-- DPO/privacy addresses are taken verbatim from the manual_guide text already shipped
-- in migrations 013/014/017 (no invented addresses). Each broker flips manual → auto so
-- it is picked up by automatic scans; the worker now emails the Article 17 request.
--
-- Deliberately left manual (no plain email opt-out): pipl & ratsit (web/postal flow),
-- annuaire-118000 (operator web form).

-- ── France (fr) ────────────────────────────────────────────────────────────
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='donnees-personnelles@solocal.com' WHERE id='pagesjaunes';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='dpd.courriers@laposte.fr'         WHERE id='annuaire-laposte';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='rgpd@scores-decisions.com'        WHERE id='societe-com';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='dpo@verif.com'                    WHERE id='verif-com';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='contact@manageo.fr'               WHERE id='manageo';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='privacy@copainsdavant.com'        WHERE id='copainsdavant';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='contact@trombi.com'               WHERE id='trombi';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='privacy@kompass.com'              WHERE id='kompass-fr';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='dpo@infogreffe.fr'                WHERE id='infogreffe';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='contact@pappers.fr'               WHERE id='pappers';
UPDATE brokers SET type='auto', gdpr_lang='fr', opt_out_email='rgpd@nomination.fr'               WHERE id='nomination';

-- ── Germany (de) ───────────────────────────────────────────────────────────
UPDATE brokers SET type='auto', gdpr_lang='de', opt_out_email='datenschutz@dastelefonbuch.de' WHERE id='dastelefonbuch';
UPDATE brokers SET type='auto', gdpr_lang='de', opt_out_email='datenschutz@gelbeseiten.de'    WHERE id='gelbeseiten';
UPDATE brokers SET type='auto', gdpr_lang='de', opt_out_email='datenschutz@11880.com'         WHERE id='telefonbuch-de';
UPDATE brokers SET type='auto', gdpr_lang='de', opt_out_email='datenschutz@yasni.de'          WHERE id='yasni';

-- ── Spain (es) ─────────────────────────────────────────────────────────────
UPDATE brokers SET type='auto', gdpr_lang='es', opt_out_email='protecciondedatos@hibu.com' WHERE id='paginas-amarillas';

-- ── Italy (it) ─────────────────────────────────────────────────────────────
UPDATE brokers SET type='auto', gdpr_lang='it', opt_out_email='privacy@seat.it' WHERE id='paginebianche';

-- ── United Kingdom (en) ────────────────────────────────────────────────────
UPDATE brokers SET type='auto', gdpr_lang='en', opt_out_email='privacy@192.com'  WHERE id='192dotcom';
UPDATE brokers SET type='auto', gdpr_lang='en', opt_out_email='privacy@yell.com' WHERE id='yell';
