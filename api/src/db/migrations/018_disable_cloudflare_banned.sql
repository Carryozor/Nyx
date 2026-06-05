-- Brokers returning 403 (IP ban) — convert to manual with email contacts
UPDATE brokers SET type = 'manual', manual_guide =
'## Advanced Background Checks

IP du serveur banni par Cloudflare. Opt-out manuel depuis votre navigateur.

1. Va sur https://www.advancedbackgroundchecks.com/removal
2. Remplis : prénom, nom, état, email
3. Clique "Opt Out"
4. Confirme via email
5. Ou email : privacy@advancedbackgroundchecks.com'
WHERE id = 'advancedbackgroundchecks';

UPDATE brokers SET type = 'manual', manual_guide =
'## Smart Background Checks

IP du serveur banni par Cloudflare. Opt-out manuel depuis votre navigateur.

1. Va sur https://www.smartbackgroundchecks.com/optout depuis ton navigateur
2. Recherche ton nom et sélectionne ta fiche
3. Clique "Opt Out" et entre ton email
4. Confirme via email
5. Ou email : privacy@smartbackgroundchecks.com'
WHERE id = 'smartbackgroundchecks';

UPDATE brokers SET type = 'manual', manual_guide =
'## Social Catfish

IP du serveur banni par Cloudflare. Opt-out manuel depuis votre navigateur.

1. Va sur https://socialcatfish.com/opt-out/ depuis ton navigateur
2. Remplis le formulaire avec ton nom et email
3. Clique "Submit"
4. Confirme via email reçu
5. Délai : 24-72 heures.'
WHERE id = 'socialcatfish';

UPDATE brokers SET type = 'manual', manual_guide =
'## USPhoneBook

IP du serveur banni par Cloudflare. Opt-out manuel depuis votre navigateur.

1. Va sur https://www.usphonebook.com/opt-out depuis ton navigateur
2. Remplis le formulaire
3. Confirme via email
4. Ou email : info@usphonebook.com'
WHERE id = 'usphonebook';

UPDATE brokers SET type = 'manual', manual_guide =
'## PeopleSearchNow

IP du serveur banni par Cloudflare. Opt-out manuel depuis votre navigateur.

1. Va sur https://www.peoplesearchnow.com/opt-out depuis ton navigateur
2. Remplis : prénom, nom, ville, email
3. Confirme via email
4. Délai : 24-72 heures.'
WHERE id = 'peoplesearchnow';

-- officialusa — URL opt-out invalide (DNS error), désactiver
UPDATE brokers SET active = 0 WHERE id = 'officialusa';

-- numlookup et okcaller — URLs 404, désactiver
UPDATE brokers SET active = 0 WHERE id IN ('numlookup', 'okcaller');

-- Corriger les opt_out_requests failed existants
UPDATE opt_out_requests SET
  status = 'manual',
  notes = 'IP du serveur banni par Cloudflare — opt-out manuel requis depuis votre navigateur'
WHERE status = 'failed'
  AND broker_id IN ('advancedbackgroundchecks', 'smartbackgroundchecks', 'socialcatfish', 'usphonebook', 'peoplesearchnow');

UPDATE opt_out_requests SET status = 'manual', notes = 'Site inaccessible (DNS error) — désactivé'
WHERE status = 'failed' AND broker_id = 'officialusa';

-- MyLife: all URLs return 403, convert to manual
UPDATE brokers SET type = 'manual', manual_guide =
'## MyLife

MyLife bloque les IP serveur. Opt-out manuel depuis votre navigateur.

1. Va sur https://www.mylife.com/privacy/remove depuis ton navigateur
2. Connecte-toi ou crée un compte
3. Va dans Privacy → Remove My Information
4. Ou envoie un email à : privacy@mylife.com
5. Objet : "Remove My Information - CCPA/GDPR Request"
6. Délai : 7-30 jours.'
WHERE id = 'mylife';

UPDATE opt_out_requests SET status = 'manual', notes = 'IP serveur bloquée (Cloudflare 403) — opt-out manuel requis'
WHERE broker_id = 'mylife' AND status = 'failed';
