-- Disable brokers with persistent CAPTCHA or invalid SSL (cannot automate)
UPDATE brokers SET active = 0 WHERE id IN (
  'cyberbackgroundchecks',  -- Cloudflare hard block
  'fastbackgroundcheck',    -- Cloudflare hard block
  'searchpeoplefree',       -- Cloudflare hard block
  'voterrecords',           -- CAPTCHA on every attempt
  'usapeoplesearch'         -- SSL certificate invalid
);

-- familytreenow: downgrade to semi (CAPTCHA required for email step)
UPDATE brokers SET type = 'semi' WHERE id = 'familytreenow';

-- Update MyLife URL (their privacy page moved)
UPDATE brokers SET url = 'https://www.mylife.com/privacy/remove' WHERE id = 'mylife';

-- ── Brokers français supplémentaires ───────────────────────────────────────

-- Semi-auto (formulaire web, parfois CAPTCHA)
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, active) VALUES
('118712',   '118712',        'https://www.118712.fr/',                             'FR', 'semi', '118712.js',       1),
('hoodspot', 'Hoodspot',      'https://www.hoodspot.fr/suppression-profil',         'FR', 'auto', 'hoodspot.js',     1);

-- Manual / RGPD uniquement
INSERT OR IGNORE INTO brokers (id, name, url, country, type, script_file, manual_guide, active) VALUES

('societe-com', 'Societe.com', 'https://www.societe.com/', 'FR', 'manual', NULL,
'## Societe.com (France)

Societe.com publie des données sur les dirigeants et associés de sociétés.

1. Va sur https://www.societe.com/
2. Recherche ta fiche (via ton nom ou le nom de ta société)
3. Sur la fiche, clique sur "Signaler une erreur" ou cherche le lien RGPD
4. Ou envoie un email à : rgpd@scores-decisions.com
5. Objet : "Demande de suppression de données personnelles - Article 17 RGPD"
6. Précise : nom, prénom, SIREN si applicable
7. Délai : 30 jours.', 1),

('verif-com', 'Verif.com', 'https://www.verif.com/', 'FR', 'manual', NULL,
'## Verif.com (France)

Verif.com publie des informations sur les entreprises et leurs dirigeants.

1. Va sur https://www.verif.com/
2. Recherche ton nom
3. Clique sur "Signaler" ou "Demande RGPD"
4. Ou contacte : dpo@verif.com
5. Objet : "Demande de suppression Article 17 RGPD"
6. Délai : 30 jours.', 1),

('manageo', 'Manageo', 'https://www.manageo.fr/', 'FR', 'manual', NULL,
'## Manageo (France)

Manageo est une base de données B2B incluant des données personnelles sur les dirigeants.

1. Va sur https://www.manageo.fr/
2. Envoie un email à : contact@manageo.fr
3. Objet : "Exercice droit à l''effacement - RGPD Art. 17"
4. Indique : nom, prénom, poste, société
5. Délai : 30 jours.', 1),

('copainsdavant', 'Copains d''Avant', 'https://www.copainsdavant.com/', 'FR', 'manual', NULL,
'## Copains d''Avant (France)

1. Connecte-toi sur https://www.copainsdavant.com/
2. Va dans Paramètres → Confidentialité → Supprimer mon compte
3. Ou contacte : privacy@copainsdavant.com
4. Objet : "Demande de suppression de compte et données RGPD"
5. Délai : 30 jours.', 1),

('trombi', 'Trombi.com', 'https://www.trombi.com/', 'FR', 'manual', NULL,
'## Trombi.com (France)

1. Va sur https://www.trombi.com/
2. Connecte-toi ou crée un compte pour accéder à ta fiche
3. Dans les paramètres : Supprimer mon compte
4. Ou envoie un email à : contact@trombi.com
5. Objet : "Demande de suppression de données - RGPD"
6. Délai : 30 jours.', 1),

('kompass-fr', 'Kompass France', 'https://fr.kompass.com/', 'FR', 'manual', NULL,
'## Kompass France

Kompass publie des données sur les entreprises et leurs dirigeants.

1. Va sur https://fr.kompass.com/
2. Envoie un email à : privacy@kompass.com
3. Objet : "Data erasure request - GDPR Article 17"
4. Indique : nom, prénom, entreprise, URL de la fiche
5. Délai : 30 jours.', 1),

('infogreffe', 'Infogreffe', 'https://www.infogreffe.fr/', 'FR', 'manual', NULL,
'## Infogreffe (France)

Infogreffe publie les données du registre du commerce (Kbis, dirigeants).

1. Va sur https://www.infogreffe.fr/
2. Recherche ta société
3. Pour les données personnelles : contacte le Greffe du Tribunal de Commerce compétent
4. Ou contacte : dpo@infogreffe.fr
5. Note : certaines données sont des données légalement publiables (Kbis) — la suppression n''est pas garantie
6. Délai : 30 jours pour réponse.', 1),

('pappers', 'Pappers', 'https://www.pappers.fr/', 'FR', 'manual', NULL,
'## Pappers (France)

Pappers est un annuaire d''entreprises exposant les données des dirigeants.

1. Va sur https://www.pappers.fr/
2. Recherche ta fiche
3. Clique sur "Signaler" sur ta fiche
4. Ou envoie un email à : contact@pappers.fr
5. Objet : "Demande de suppression RGPD - Article 17"
6. Délai : 30 jours.', 1),

('nomination', 'Nomination', 'https://www.nomination.fr/', 'FR', 'manual', NULL,
'## Nomination (France)

Nomination est une base de données de contacts professionnels.

1. Va sur https://www.nomination.fr/
2. Recherche ta fiche
3. Clique sur "Me désabonner" ou "Supprimer mes données"
4. Ou envoie un email à : rgpd@nomination.fr
5. Objet : "Droit à l''effacement - RGPD Article 17"
6. Délai : 30 jours.', 1),

('annuaire-118000', '118 000', 'https://www.118000.fr/', 'FR', 'manual', NULL,
'## 118 000 (France)

1. Va sur https://www.118000.fr/
2. Recherche ton numéro
3. Clique sur "Supprimer ma fiche" ou utilise le formulaire de contact
4. Ou contacte SFR / Opérateur responsable via le formulaire de désabonnement de l''annuaire universel
5. Délai : 30 jours.', 1);
