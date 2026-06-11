# Design — Redirection des réponses + Compteur/quota Brevo

**Date** : 2026-06-11
**Statut** : approuvé (design)
**Branche** : `feat/gdpr-email-engine`
**Ordre d'implémentation** : B (quota) d'abord, puis A (redirection).

---

## Feature B — Compteur d'emails + quota Brevo (hybride, blocage)

### Problème
Brevo gratuit = 300 mails/jour. Rien ne mesure les envois ni n'empêche un scan de
dépasser le quota (les mails au-delà échouent silencieusement).

### Conception
1. **Table `mail_log`** (migration) : une ligne par mail RGPD envoyé.
   ```sql
   CREATE TABLE mail_log (
     id         TEXT PRIMARY KEY,
     profile_id TEXT,
     broker_id  TEXT,
     sent_at    TEXT NOT NULL
   );
   CREATE INDEX idx_mail_log_sent_at ON mail_log(sent_at);
   ```
   Le worker insère une ligne à chaque envoi RGPD réussi (`gdpr-email` /
   `broker-runner`, après `sender()` OK).
2. **Compteur** : `countSentSince(db, isoTimestamp)` = nombre de `mail_log` sur les
   dernières 24 h (fenêtre glissante).
3. **Plafond** `MAIL_DAILY_CAP` (config, défaut **300**). Clé API Brevo optionnelle
   `BREVO_API_KEY` (`xkeysib-…`) : si fournie, on expose aussi le quota réel Brevo
   (info). **Source de vérité du blocage = compteur local** (pas de dépendance
   réseau au moment du scan).
4. **Gate pré-scan** dans `POST /scans` : `estimate` = nombre de courtiers
   sélectionnés ayant un `opt_out_email`. Si `sentLast24h + estimate > cap` →
   **409** `{ error, sentToday, cap, remaining, estimate }`. Sinon, scan créé.
5. **Endpoint `GET /mail-quota`** (auth) : `{ sent_today, cap, remaining, brevo? }`.
   `brevo` présent uniquement si `BREVO_API_KEY` configurée.
6. **Frontend** : badge « budget restant N/300 » ; au lancement du scan, message
   d'erreur clair si 409 (budget insuffisant).

### Tests
- `mail_log` insérée à l'envoi ; `countSentSince` correct sur la fenêtre.
- `/scans` : 409 quand `estimate` dépasse le budget ; 201 sinon ; estimation =
  courtiers avec `opt_out_email` parmi l'ensemble résolu.
- `/mail-quota` renvoie `sent_today/cap/remaining` ; `brevo` seulement si clé.

---

## Feature A — Redirection des réponses vers une adresse déléguée

### Contrainte
Le worker ne lit que `from_`/`subject` via l'API SimpleLogin (jamais le corps).
Pour qu'un **mail complet** parvienne au délégué, c'est **SimpleLogin** qui doit
router l'alias vers la mailbox du délégué. Modèle visé : broker → `privacy@vidar.fr`
→ forward vers `autre@autre.fr`.

### Conception
1. **Routage par défaut = l'alias** (comportement actuel : l'alias forwarde vers la
   Proton du propriétaire). Aucune redirection par défaut.
2. **Champ `profiles.redirect_email`** (nouvelle colonne, en clair — adresse de
   routage, pas de PII sensible). Optionnel. Pré-rempli dans le profil.
3. **Permissions** : régler/modifier `redirect_email` et la config de routage mail
   est réservé aux rangs **editor / manager / admin** (= `requireProfileAction`,
   editor+ avec accès). **L'observateur (viewer) ne peut pas.** Plus de flexibilité
   et d'use-cases (ex. un editor qui gère les opt-outs d'un client route les
   réponses vers ce client).
4. **Au lancement du scan** : champ pré-rempli depuis le profil, **modifiable** par
   editor+. Si renseigné, l'alias du scan est **assigné à la mailbox SimpleLogin**
   de cette adresse → le délégué reçoit le mail entier et peut agir lui-même.
5. **Autonomie (sans admin Nyx)** : proxy SimpleLogin étendu —
   `GET /simplelogin/mailboxes`, `POST /simplelogin/mailboxes {email}` (déclenche la
   vérification SimpleLogin). Création d'alias (`/simplelogin/alias`) accepte un
   `mailboxEmail`/`mailboxId` cible. Si l'adresse n'est pas encore une mailbox
   vérifiée, l'UI affiche « vérification envoyée à `<email>` » ; **le délégué clique
   le lien une fois** (validation self-service par le délégué, pas par l'admin).
6. **Auto-confirmation préservée** : l'email-checker lit les activités de l'alias via
   l'API quelle que soit la mailbox de destination → `confirmed` continue de marcher.

> Friction incompressible : la vérification SimpleLogin de l'adresse déléguée (une
> fois, self-service). Exigence de sécurité SimpleLogin, pas un choix Nyx.

### Tests
- Colonne `redirect_email` (round-trip create/patch profil) ; lecture par editor+,
  modification refusée au viewer (403).
- Proxy mailboxes : list/add (mockés) ; création d'alias avec mailbox ciblée passe
  le bon `mailbox_id`.
- ScanModal (typecheck) : champ pré-rempli depuis le profil, éditable, masqué pour
  viewer.

---

## Périmètre / risques
- B : autonome, aucune dépendance externe. Migration + worker log + gate + endpoint.
- A : touche au proxy SimpleLogin (mailboxes) et dépend de la vérification mailbox
  côté délégué. Colonne `redirect_email` en clair (assumé : routage, non sensible).
- Compat : sans `redirect_email`, comportement identique à aujourd'hui (alias par
  défaut). Sans `BREVO_API_KEY`, le quota fonctionne en local seul.
