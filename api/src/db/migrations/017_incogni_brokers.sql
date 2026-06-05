-- Brokers from Incogni list — auto-scriptable and manual

-- ── Auto-scriptable (form-based opt-out) ─────────────────────────────────────
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, active) VALUES
('advancedbackgroundchecks', 'Advanced Background Checks', 'https://www.advancedbackgroundchecks.com/removal', 'US', 'auto', 'advancedbackgroundchecks.js', 1),
('spydialer',    'SpyDialer',              'https://www.spydialer.com/optout.aspx',            'US', 'auto', 'spydialer.js',    1),
('usphonebook',  'USPhoneBook',            'https://www.usphonebook.com/opt-out',              'US', 'auto', 'usphonebook.js',  1),
('numlookup',    'NumLookup',              'https://www.numlookup.com/optout',                 'US', 'auto', 'numlookup.js',    1),
('okcaller',     'OkCaller',               'https://www.okcaller.com/opt-out.php',             'US', 'auto', 'okcaller.js',     1),
('peoplewhiz',   'PeopleWhiz',             'https://www.peoplewhiz.com/remove-my-info',        'US', 'auto', 'peoplewhiz.js',   1),
('smartbackgroundchecks', 'Smart Background Checks', 'https://www.smartbackgroundchecks.com/optout', 'US', 'auto', 'smartbackgroundchecks.js', 1),
('socialcatfish', 'Social Catfish',        'https://socialcatfish.com/opt-out/',               'US', 'auto', 'socialcatfish.js', 1),
('staterecords', 'StateRecords',           'https://staterecords.org/optout.php',              'US', 'auto', 'staterecords.js', 1),
('searchquarry', 'SearchQuarry',           'https://www.searchquarry.com/optout/',             'US', 'auto', 'searchquarry.js', 1),
('recordsfinder', 'RecordsFinder',         'https://www.recordsfinder.com/optout/',            'US', 'auto', 'recordsfinder.js', 1),
('cocofinder',   'CocoFinder',             'https://cocofinder.com/opt-out',                   'US', 'auto', 'cocofinder.js',   1),
('officialusa',  'OfficialUSA',            'https://www.officialusa.com/optout/',              'US', 'auto', 'officialusa.js',  1),
('nationalpublicdata', 'National Public Data', 'https://www.npdbreach.com/opt-out',           'US', 'auto', 'nationalpublicdata.js', 1),
('freepeopledirectory', 'FreePeopleDirectory', 'https://www.freepeopledirectory.com/optout',  'US', 'auto', 'freepeopledirectory.js', 1),
('freebackgroundcheck', 'FreeBackgroundCheck', 'https://freebackgroundcheck.org/optout',      'US', 'auto', 'freebackgroundcheck.js', 1),
('clustrmaps',   'ClustRMaps',             'https://clustrmaps.com/bl/opt-out',               'US', 'auto', 'clustrmaps.js',   1),
('addresses',    'Addresses.com',          'https://www.addresses.com/optout.php',             'US', 'auto', 'addresses.js',    1),
('privatereports','PrivateReports',        'https://www.privatereports.com/opt-out',           'US', 'auto', 'privatereports.js', 1),
('peoplesearchnow', 'PeopleSearchNow',     'https://www.peoplesearchnow.com/opt-out',          'US', 'auto', 'peoplesearchnow.js', 1);

-- ── Manual / semi-manual brokers ──────────────────────────────────────────────
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, manual_guide, active) VALUES

('arrests', 'Arrests.org', 'https://arrests.org/', 'US', 'manual', NULL,
'## Arrests.org

1. Envoie un email à : removal@arrests.org
2. Objet : "Request for Record Removal"
3. Inclus : ton nom complet, date de naissance, lien vers ta fiche
4. Ou utilise le formulaire sur le site
5. Délai : 2-7 jours.', 1),

('mugshots', 'Mugshots.com', 'https://mugshots.com/', 'US', 'manual', NULL,
'## Mugshots.com

1. Va sur https://mugshots.com/
2. Recherche ta fiche
3. Clique "Remove" sur ta fiche
4. Envoie un email à : removal@mugshots.com
5. Note : ce site demande parfois un paiement pour la suppression. Si c''est le cas, signale-le à tes autorités locales — cette pratique est illégale dans certains États US.', 1),

('arrestfacts', 'ArrestFacts', 'https://www.arrestfacts.com/', 'US', 'manual', NULL,
'## ArrestFacts

1. Va sur https://www.arrestfacts.com/optout
2. Recherche ton nom
3. Sélectionne ta fiche et clique "Opt-Out"
4. Confirme via email
5. Délai : 24-72 heures.', 1),

('blockshopper', 'BlockShopper', 'https://blockshopper.com/', 'US', 'manual', NULL,
'## BlockShopper (property records)

1. Va sur https://blockshopper.com/
2. Recherche ton nom ou ton adresse
3. Sur ta fiche : clique "Flag" ou utilise le formulaire de contact
4. Email : info@blockshopper.com
5. Objet : "Remove my personal information"', 1),

('homemetry', 'HomeMetry', 'https://homemetry.com/', 'US', 'manual', NULL,
'## HomeMetry (property data)

1. Va sur https://homemetry.com/
2. Recherche ton adresse
3. Sur la fiche, clique "Opt-Out"
4. Ou envoie un email à : support@homemetry.com
5. Objet : "Opt-out request - remove my home data"', 1),

('ownerly', 'Ownerly', 'https://www.ownerly.com/', 'US', 'manual', NULL,
'## Ownerly (property/people search)

1. Va sur https://www.ownerly.com/opt-out
2. Remplis le formulaire avec ton nom et email
3. Confirme via le lien envoyé par email
4. Délai : 24-48 heures.', 1),

('rehold', 'Rehold', 'https://rehold.com/', 'US', 'manual', NULL,
'## Rehold (address/property lookup)

1. Va sur https://rehold.com/
2. Recherche ton adresse
3. Clique "Remove this address" sur la fiche
4. Ou contact : admin@rehold.com', 1),

('privateeye', 'PrivateEye', 'https://www.privateeye.com/', 'US', 'manual', NULL,
'## PrivateEye

1. Va sur https://www.privateeye.com/
2. Recherche ton nom
3. Sélectionne ta fiche
4. Clique "Remove" et suis les instructions
5. Confirmation par email requise.', 1),

('sagestream', 'SageStream', 'https://www.sagestream.com/', 'US', 'manual', NULL,
'## SageStream (credit/risk data)

1. Envoie une demande écrite à :
   SageStream, LLC
   Attn: Consumer Privacy
   2 Technology Drive, Suite 100
   Irvine, CA 92618
2. Ou utilise le formulaire en ligne sur leur site
3. Inclus : nom, adresse, SSN (4 derniers chiffres), date de naissance
4. Délai : 30 jours.', 1),

('apollo', 'Apollo.io', 'https://www.apollo.io/', 'US', 'manual', NULL,
'## Apollo.io (B2B data)

1. Va sur https://www.apollo.io/privacy-policy
2. Cherche la section "Data Removal" ou "Do Not Sell"
3. Ou envoie un email à : privacy@apollo.io
4. Objet : "Data Removal Request - CCPA/GDPR"
5. Délai : 30 jours.', 1),

('peopledatalabs', 'People Data Labs', 'https://www.peopledatalabs.com/', 'US', 'manual', NULL,
'## People Data Labs (B2B enrichment)

1. Va sur https://www.peopledatalabs.com/privacy-center
2. Clique "Submit a Data Request"
3. Sélectionne "Delete" et remplis le formulaire
4. Ou email : privacy@peopledatalabs.com
5. Délai : 30 jours.', 1),

('yasni', 'Yasni', 'https://www.yasni.de/', 'DE', 'manual', NULL,
'## Yasni (Germany/Europe people search)

1. Va sur https://www.yasni.de/
2. Recherche ton nom
3. Sur ta fiche, clique "Daten löschen" (Supprimer données)
4. Ou envoie un email à : datenschutz@yasni.de
5. Objet : "Löschantrag DSGVO Art. 17"
6. Délai : 30 jours.', 1),

('ancestry', 'Ancestry', 'https://www.ancestry.com/', 'US', 'manual', NULL,
'## Ancestry.com

1. Connecte-toi sur https://www.ancestry.com/
2. Va dans Paramètres → Confidentialité → Gérer mes informations
3. Pour supprimer un arbre public : rends-le privé ou supprime-le
4. Pour l''opt-out CCPA : va sur https://www.ancestry.com/cs/legal/ccpa-opt-out
5. Email : privacy@ancestry.com pour les demandes RGPD
6. Délai : 30-45 jours.', 1),

('idstrong', 'IDStrong', 'https://www.idstrong.com/', 'US', 'manual', NULL,
'## IDStrong (data breach monitoring + people search)

1. Va sur https://www.idstrong.com/opt-out
2. Remplis le formulaire de suppression
3. Confirmation par email
4. Délai : 24-72 heures.', 1),

('corporationwiki', 'CorporationWiki', 'https://www.corporationwiki.com/', 'US', 'manual', NULL,
'## CorporationWiki (business/director data)

1. Va sur https://www.corporationwiki.com/
2. Recherche ton nom ou ta société
3. Sur ta fiche, clique "Flag this info" ou "Request removal"
4. Email : info@corporationwiki.com
5. Délai : 3-7 jours.', 1);
