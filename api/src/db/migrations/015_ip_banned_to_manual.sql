-- Brokers IP-banned by Cloudflare on this server — convert to manual with email contacts.
-- Direct HTTP requests return 403; FlareSolverr cannot bypass true IP bans.

UPDATE brokers SET
  type = 'manual',
  manual_guide = '## CyberBackgroundChecks

Le site bloque les IP serveur via Cloudflare. Opt-out manuel requis.

1. Va sur https://www.cyberbackgroundchecks.com/removal depuis ton navigateur
2. Remplis le formulaire avec ton nom, ville, état et email
3. Ou envoie un email à : privacy@cyberbackgroundchecks.com
4. Objet : "Opt-Out Request"
5. Confirme via l''email reçu.'
WHERE id = 'cyberbackgroundchecks';

UPDATE brokers SET
  type = 'manual',
  manual_guide = '## FastBackgroundCheck

Le site bloque les IP serveur via Cloudflare. Opt-out manuel requis.

1. Va sur https://www.fastbackgroundcheck.com/removal depuis ton navigateur
2. Recherche ton nom et sélectionne ta fiche
3. Clique "Opt Out" et entre ton email
4. Ou envoie un email à : privacy@fastbackgroundcheck.com
5. Objet : "Opt-Out Request - [Prénom Nom]"'
WHERE id = 'fastbackgroundcheck';

UPDATE brokers SET
  type = 'manual',
  manual_guide = '## SearchPeopleFREE

Le site bloque les IP serveur via Cloudflare. Opt-out manuel requis.

1. Va sur https://www.searchpeoplefree.com/opt-out depuis ton navigateur
2. Recherche ton nom et sélectionne ta fiche
3. Remplis le formulaire d''opt-out
4. Ou contacte : https://www.searchpeoplefree.com/contact'
WHERE id = 'searchpeoplefree';

UPDATE brokers SET
  type = 'manual',
  manual_guide = '## VoterRecords

VoterRecords publie des données de registres électoraux publics. Le site bloque les IP serveur.

1. Va sur https://voterrecords.com/faq depuis ton navigateur
2. Cherche la section "Opt-Out" ou "Remove My Information"
3. Ou contacte : support@voterrecords.com
4. Objet : "Opt-Out Request"
5. Note : les données électorales étant publiques, la suppression n''est pas garantie.'
WHERE id = 'voterrecords';

UPDATE brokers SET
  type = 'manual',
  manual_guide = '## FamilyTreeNow

Le formulaire d''opt-out requiert un reCAPTCHA que le serveur ne peut pas résoudre.

1. Va sur https://www.familytreenow.com/optout depuis ton navigateur
2. Recherche ton nom et ta ville
3. Clique "View" sur ta fiche puis "Opt-Out"
4. Entre ton email et résous le reCAPTCHA
5. Confirme via l''email reçu.'
WHERE id = 'familytreenow';

UPDATE brokers SET
  type = 'manual',
  manual_guide = '## USA People Search

Le certificat SSL du site est invalide et le serveur rejette la connexion.

1. Va sur https://www.usapeoplesearch.com/optout/ depuis ton navigateur
2. Recherche ton nom et ta ville
3. Sélectionne ta fiche et clique "Remove"
4. Ou contacte : privacy@usapeoplesearch.com'
WHERE id = 'usapeoplesearch';

-- Réactiver ces brokers (ils étaient disabled mais doivent apparaître en manual)
UPDATE brokers SET active = 1
WHERE id IN ('cyberbackgroundchecks','fastbackgroundcheck','searchpeoplefree','voterrecords','usapeoplesearch');

-- Corriger les opt_out_requests failed existants pour ces brokers
UPDATE opt_out_requests SET
  status = 'manual',
  notes = 'IP du serveur bannie par Cloudflare — opt-out manuel requis (voir guide dans le panneau broker)'
WHERE status = 'failed'
  AND broker_id IN ('cyberbackgroundchecks','fastbackgroundcheck','searchpeoplefree','voterrecords','usapeoplesearch','familytreenow');

-- addresssearch et publicrecords sont défunts — passer en manual avec explication
UPDATE brokers SET
  type = 'manual',
  active = 1,
  manual_guide = 'Ce site est défunt (erreur 404). Aucune action requise — vos données ne sont probablement plus accessibles.'
WHERE id IN ('addresssearch','publicrecords');

UPDATE opt_out_requests SET
  status = 'manual',
  notes = 'Site défunt (404) — aucune action requise'
WHERE status = 'failed'
  AND broker_id IN ('addresssearch','publicrecords');
