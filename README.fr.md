<div align="right"><a href="./README.md">🇬🇧 English version</a></div>

# Nyx

**Automatisation zero-knowledge, respectueuse de la vie privée, des demandes de
désinscription auprès des data brokers et des demandes d'effacement RGPD.**

Nyx vous aide à faire supprimer vos données personnelles des data brokers et annuaires de
personnes. Il automatise à la fois les **désinscriptions par formulaire web** (navigateur
headless) et les **e-mails d'effacement au titre de l'article 17 du RGPD**, suit chaque
demande jusqu'à la confirmation, et garde vos données personnelles chiffrées de bout en
bout — le serveur ne les voit jamais en clair.

> Statut : projet privé. Auto-hébergé via Docker Compose.

---

## Fonctionnalités clés

- **PII zero-knowledge** — les données personnelles sont chiffrées avec un mot de passe
  maître (dérivation argon2id, AES-GCM). Le serveur ne stocke que du chiffré et ne peut
  jamais le lire sans le mot de passe.
- **Deux moteurs de désinscription**
  - **Automatisation navigateur** (Playwright + furtivité) pour les brokers à formulaire
    web, avec résolution automatique des défis Cloudflare via FlareSolverr.
  - **Moteur e-mail RGPD** — envoie des demandes d'effacement (article 17) localisées
    (FR, EN, DE, ES, IT, NL, PL) aux adresses DPO des brokers via SMTP (Brevo) et suit les
    réponses.
- **Confirmation automatique** — la détection des réponses via la surveillance des alias
  SimpleLogin passe une demande en *confirmée* sans vérification manuelle.
- **Ciblage des brokers**
  - **Par audience** — `privé` / `professionnel` / `les deux`. Les brokers de données
    d'entreprise (Altares, Kompass, Infogreffe…) ne sont contactés que pour un scan pro.
  - **Par pays / région** — pays précis (ex. FR + PL) ou région : **Union Européenne**,
    **Europe** (avec CH/UK), **US**, ou tout.
  - **Mode expert** — sélection manuelle des brokers, chacun étiqueté par son type.
- **Profils professionnels** — bloc société optionnel (raison sociale, SIREN, SIRET, forme
  juridique) injecté dans les e-mails d'effacement adressés aux brokers B2B.
- **Redirection des réponses** — router les réponses des brokers d'un profil vers une
  boîte déléguée, pour qu'un tiers gère le suivi sans exposer votre propre boîte mail.
- **Garde-fou de budget e-mail** — un compteur quotidien (corrélé au quota Brevo) bloque un
  scan avant tout dépassement ; quota réel affiché si une clé API Brevo est configurée.
- **Contrôle d'accès par rôles** — quatre rôles hiérarchiques et partage par profil.
- **Planification, historique & preuves** — scans automatiques récurrents, historique
  complet, statut par broker, captures d'écran, et guides manuels pour les brokers non
  automatisables.

---

## Rôles & partage (RBAC)

Rôles hiérarchiques — chaque rang hérite des droits inférieurs :

| Rôle | Peut faire |
|------|-----------|
| **viewer** | Lire les profils partagés : statuts, historique de scans, rapports broker. Aucune action. |
| **editor** | + Lancer des scans et gérer les plannings sur les profils accessibles ; régler la redirection. |
| **manager** | + Créer / posséder / éditer / supprimer ses propres profils (plusieurs) ; les partager. |
| **admin** | + Accès total à tous les profils ; gestion des utilisateurs et invitations. |

Le propriétaire d'un profil (ou un admin) partage l'accès en lecture/action avec un
**viewer** ou un **editor** via une autorisation `profile_access`. L'édition et le
déchiffrement restent réservés au propriétaire ou à l'admin.

---

## Déroulé d'un scan

```
Profil (PII chiffrée) ──► Lancer un scan (audience + filtre pays / mode expert + redirection)
        │                            │
        │                  garde-fou budget e-mail (quota Brevo) — 409 si dépassement
        ▼                            ▼
  désinscription par broker     le worker prend le job
        │                            │
   ┌────┴─────────────┐              ▼
   │ broker formulaire│     automatisation navigateur (Playwright + FlareSolverr)
   │ broker e-mail    │     e-mail d'effacement RGPD (SMTP/Brevo, From = alias surveillé)
   └──────────────────┘              │
                          réponse broker ──► alias SimpleLogin ──► auto-confirmée
                                                  └► (option) transférée au délégué
```

---

## Architecture

| Composant | Stack |
|-----------|-------|
| **API** | Node.js, Fastify, better-sqlite3, Zod, JWT (cookies httpOnly), argon2id |
| **Worker** | Node.js, Playwright (+ furtivité), FlareSolverr, nodemailer, vitest |
| **Frontend** | React 19, Vite, Tailwind CSS, Zustand |
| **Base de données** | SQLite (fichier, pilotée par migrations) |
| **E-mail** | Brevo SMTP (envoi), SimpleLogin (alias + surveillance des réponses) |
| **Infra** | Docker Compose (api · worker · flaresolverr) |

Chiffrement : la PII des profils est chiffrée avec une clé dérivée du mot de passe maître
(argon2id) et AES-GCM. Les clés de job par scan sont enveloppées avec un `WORKER_SECRET`
serveur (HKDF) pour que le worker puisse déchiffrer la PII pendant un scan, puis purgées.

---

## Configuration

Variables d'environnement (définies dans le `.env` de déploiement, préfixées `NYX_` dans
Compose) :

| Variable | Rôle |
|----------|------|
| `JWT_SECRET`, `WORKER_SECRET` | Secrets de signature d'auth & d'enveloppe de clé PII (≥ 32 caractères) |
| `MAIL_FROM` | Adresse expéditrice des e-mails RGPD (un alias SimpleLogin surveillé) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Relais SMTP Brevo |
| `MAIL_DAILY_CAP` | Budget e-mail quotidien (défaut `300`, palier gratuit Brevo) |
| `BREVO_API_KEY` | *(optionnel)* Clé API Brevo pour afficher le quota réel |
| `WEBHOOK_SECRET` | Secret de signature des webhooks entrants |

La clé API SimpleLogin est stockée côté client et sert à créer les alias par scan et à lire
l'activité des réponses pour l'auto-confirmation.

---

## Développement

```bash
# API
cd api && npm install && npm run dev
npx vitest run          # tests

# Worker
cd worker && npm install && npm run dev
npx vitest run

# Frontend
cd frontend && npm install && npm run dev
npm run build           # build de production

# Stack complète (Docker)
docker compose build && docker compose up -d
```

Les migrations de base de données s'exécutent automatiquement au démarrage de l'API. Le
code suit une approche test-driven (unitaires + intégration avec vitest).

---

## Sécurité & confidentialité

- Les données personnelles ne sont jamais stockées ni journalisées en clair ; le serveur ne
  peut pas les déchiffrer sans le mot de passe maître de l'utilisateur.
- Les sessions utilisent des cookies httpOnly `SameSite=strict` ; les mots de passe sont
  hachés en argon2id.
- Les clés API (SimpleLogin, Brevo) sont tenues hors du dépôt et injectées via
  l'environnement.
- Les requêtes sortantes sont des demandes d'effacement RGPD (article 17) au nom de la
  personne concernée.

---

*Nyx est un outil personnel auto-hébergé. À utiliser uniquement pour agir sur vos propres
données personnelles ou des données pour lesquelles vous êtes autorisé à agir.*
