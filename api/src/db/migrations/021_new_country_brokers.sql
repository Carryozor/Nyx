-- New European directory brokers (NL/BE/PL/CH), wired to the GDPR auto-send engine.
-- DPO/privacy addresses verified from each operator's official privacy statement:
--   NL De Telefoongids → privacy@youvia.nl (Youvia)
--   BE Goudengids/Pagesdor → info@fcrmedia.be (FCR Media Belgium NV)
--   PL Panorama Firm → iod@wenet.pl (WeNet Sp. z o.o. DPO)
--   CH local.ch/search.ch → dataprivacy@localsearch.ch (localsearch / Swisscom Directories)

INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, opt_out_email, gdpr_lang, manual_guide, active) VALUES
('detelefoongids', 'De Telefoongids', 'https://www.detelefoongids.nl/', 'NL', 'auto', NULL,
 'privacy@youvia.nl', 'nl',
 '## De Telefoongids (Pays-Bas)
Demande RGPD/AVG envoyée automatiquement à privacy@youvia.nl. Sinon : retirer la vermelding via mijnnummervermelding.nl ou son opérateur télécom.', 1),

('goudengids', 'Goudengids / Pagesdor', 'https://www.goudengids.be/', 'BE', 'auto', NULL,
 'info@fcrmedia.be', 'fr',
 '## Goudengids / Pagesdor (Belgique — FCR Media)
Demande RGPD envoyée automatiquement à info@fcrmedia.be. Tél. : 078 15 15 25.', 1),

('panoramafirm', 'Panorama Firm', 'https://panoramafirm.pl/', 'PL', 'auto', NULL,
 'iod@wenet.pl', 'pl',
 '## Panorama Firm (Pologne — WeNet)
Żądanie RODO (art. 17) wysyłane automatycznie do iod@wenet.pl (Inspektor Ochrony Danych).', 1),

('localch', 'local.ch / search.ch', 'https://www.local.ch/', 'CH', 'auto', NULL,
 'dataprivacy@localsearch.ch', 'de',
 '## local.ch / search.ch (Suisse — localsearch)
DSGVO/RGPD-Anfrage wird automatisch an dataprivacy@localsearch.ch gesendet. Eintrag löschen: info.local.ch/kontakt.', 1);
