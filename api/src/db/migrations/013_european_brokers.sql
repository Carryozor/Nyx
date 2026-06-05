-- European data brokers — GDPR right to erasure applies to all

-- ── Automatable (form-based opt-out) ───────────────────────────────────────
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, active) VALUES
('truecaller',     'Truecaller',        'https://www.truecaller.com/unlisting',                  'EU', 'auto', 'truecaller.js',     1),
('pagesblanches',  'Pages Blanches',    'https://www.pagesjaunes.fr/pagesblanches',               'FR', 'auto', 'pagesblanches.js',  1),
('infobel',        'Infobel',           'https://www.infobel.com/fr/world/data_removal',          'EU', 'semi', 'infobel.js',        1);

-- ── Manual / GDPR request ──────────────────────────────────────────────────
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, manual_guide, active) VALUES

('pagesjaunes', 'Pages Jaunes', 'https://www.pagesjaunes.fr/', 'FR', 'manual', NULL,
'## Pages Jaunes (France)

1. Va sur https://www.pagesjaunes.fr/
2. Recherche ton nom et ta ville dans l''annuaire
3. Sur ta fiche, clique sur "Signaler une erreur" ou "Supprimer cette fiche"
4. Ou envoie un email à : donnees-personnelles@solocal.com avec objet "Demande de suppression RGPD"
5. Joindre une copie de pièce d''identité
6. Traitement sous 30 jours.', 1),

('annuaire-laposte', 'Annuaire La Poste', 'https://www.laposte.fr/', 'FR', 'manual', NULL,
'## Annuaire La Poste (France)

1. Envoie un email à : dpd.courriers@laposte.fr
2. Objet : "Demande de suppression de données personnelles - RGPD Article 17"
3. Indique : nom, prénom, adresse, numéro de téléphone
4. Joindre une copie de pièce d''identité
5. Traitement sous 30 jours.', 1),

('dastelefonbuch', 'Das Telefonbuch', 'https://www.dastelefonbuch.de/', 'DE', 'manual', NULL,
'## Das Telefonbuch (Allemagne)

1. Va sur https://www.dastelefonbuch.de/Datenschutz
2. Utilise le formulaire de suppression en ligne
3. Ou envoie un email à : datenschutz@dastelefonbuch.de
4. Sujet : "Löschantrag nach Art. 17 DSGVO" (demande de suppression RGPD)
5. Traitement sous 30 jours.', 1),

('gelbeseiten', 'Gelbe Seiten', 'https://www.gelbeseiten.de/', 'DE', 'manual', NULL,
'## Gelbe Seiten (Allemagne)

1. Va sur https://www.gelbeseiten.de/
2. Recherche ta fiche
3. Clique sur "Eintrag melden" (signaler une entrée)
4. Ou envoie un email à : datenschutz@gelbeseiten.de
5. Objet : "Löschantrag DSGVO"
6. Traitement sous 30 jours.', 1),

('telefonbuch-de', '11880.com', 'https://www.11880.com/', 'DE', 'manual', NULL,
'## 11880.com (Allemagne)

1. Va sur https://www.11880.com/impressum/datenschutz
2. Envoie un email à : datenschutz@11880.com
3. Objet : "Löschantrag Art. 17 DSGVO"
4. Indique : nom, adresse, numéro de téléphone à supprimer
5. Traitement sous 30 jours.', 1),

('192dotcom', '192.com', 'https://www.192.com/', 'UK', 'manual', NULL,
'## 192.com (Royaume-Uni)

1. Va sur https://www.192.com/atoz/
2. Recherche ton nom
3. Clique sur "Remove my details" sur ta fiche
4. Ou envoie un email à : privacy@192.com
5. Objet : "Data removal request"
6. Joindre une preuve d''identité
7. Traitement sous 30 jours (UK GDPR).', 1),

('yell', 'Yell.com', 'https://www.yell.com/', 'UK', 'manual', NULL,
'## Yell (Royaume-Uni)

1. Va sur https://www.yell.com/helpcentre/
2. Cherche "remove my listing"
3. Ou envoie un email à : privacy@yell.com
4. Objet : "Data erasure request under UK GDPR"
5. Traitement sous 30 jours.', 1),

('paginas-amarillas', 'Páginas Amarillas', 'https://www.paginasamarillas.es/', 'ES', 'manual', NULL,
'## Páginas Amarillas (Espagne)

1. Va sur https://www.paginasamarillas.es/
2. Recherche ta fiche
3. Clique sur "Eliminar datos"
4. Ou envoie un email à : protecciondedatos@hibu.com
5. Objet : "Solicitud de supresión RGPD - Art. 17"
6. Traitement sous 30 jours.', 1),

('paginebianche', 'Pagine Bianche', 'https://www.paginebianche.it/', 'IT', 'manual', NULL,
'## Pagine Bianche (Italie)

1. Va sur https://www.paginebianche.it/
2. Recherche ta fiche
3. Clique sur "Segnala un errore" ou "Rimuovi scheda"
4. Ou envoie un email à : privacy@seat.it
5. Objet : "Richiesta di cancellazione dati - GDPR Art. 17"
6. Traitement sous 30 jours.', 1),

('pipl', 'Pipl', 'https://pipl.com/', 'EU', 'manual', NULL,
'## Pipl

1. Va sur https://pipl.com/personal-information-removal-request/
2. Recherche ton nom et clique sur ta fiche
3. Clique sur "Remove this profile"
4. Confirme par email
5. Traitement sous 7 jours.', 1),

('datatilsynet', 'Bisnode / Ratsit', 'https://www.ratsit.se/', 'SE', 'manual', NULL,
'## Ratsit (Suède)

1. Va sur https://www.ratsit.se/
2. Recherche ton nom
3. Clique sur "Spärra uppgifter" (bloquer mes données) sur ta fiche
4. Tu recevras un code par courrier pour confirmer
5. Traitement sous 7 jours.', 1);
