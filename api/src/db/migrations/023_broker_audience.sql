-- Broker audience classification: who the broker's data concerns.
--   private      → data on individuals (people-search, directories of persons)
--   professional → B2B / company data only (firmographics, decision-makers)
--   both         → exposes both (universal directories, registries listing the
--                  company AND its director as a natural person)
-- Drives the scan audience selector and whether the GDPR email carries company data.

ALTER TABLE brokers
  ADD COLUMN audience TEXT NOT NULL DEFAULT 'private'
  CHECK(audience IN ('private','professional','both'));

-- Universal directories: list individuals and professionals alike.
UPDATE brokers SET audience='both' WHERE id IN ('pagesjaunes','118712','annuaire-118000');

-- Company registries / B2B data that also expose the director as a natural person.
UPDATE brokers SET audience='both' WHERE id IN ('societe-com','verif-com','infogreffe','pappers');

-- Pure B2B (firmographics / decision-makers): irrelevant to a private-only opt-out.
UPDATE brokers SET audience='professional' WHERE id IN ('kompass-fr','manageo','nomination');

-- New broker: Altares D&B (Altares Dun & Bradstreet) — French B2B company data.
-- DPO confirmed: dpo@altares.com
-- (https://www.altares.com/fr/mentions-legales-cgu-altares/donnees-personnelles/)
INSERT OR IGNORE INTO brokers
  (id, name, url, country, type, script_file, manual_guide, active, opt_out_email, gdpr_lang, audience)
VALUES
  ('altares', 'Altares D&B', 'https://www.altares.com', 'FR', 'auto', NULL, NULL, 1,
   'dpo@altares.com', 'fr', 'professional');
