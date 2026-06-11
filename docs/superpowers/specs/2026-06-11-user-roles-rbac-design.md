# Design — Rework des rôles utilisateurs (RBAC hiérarchique + partage de profils)

**Date** : 2026-06-11
**Statut** : approuvé (design), spec en relecture
**Branche** : `feat/gdpr-email-engine`

## Problème

Le modèle actuel n'a que deux rôles (`admin`, `user`) :
- `users.role TEXT CHECK(role IN ('admin','user'))`.
- Partout le contrôle d'accès est dupliqué : `req.user.role !== 'admin' && profile.user_id !== req.user.id` (≈ 8 routes).
- Un `user` est limité à **1 profil** (`profiles.ts`).
- Les invitations créent toujours un `user`.

L'utilisateur veut des grades distincts : un administrateur (tous droits), un rôle
qui crée des profils, et un rôle qui peut seulement **consulter un profil précis**.

## Décisions validées

- **4 rôles hiérarchiques** (rangés). Un seul rôle par utilisateur ; un rang donne
  tous les droits des rangs inférieurs (pas de multi-rôle).
- **Table de partage `profile_access`** : partage d'un profil à un utilisateur
  `viewer`/`editor`, par le **propriétaire du profil** ou un **admin**.
- Observateur = **lecture seule** (statuts + historique), aucune action.
- **Contrainte zero-knowledge** : la PII est chiffrée avec le mot de passe maître du
  propriétaire. Un viewer/editor ne peut pas déchiffrer la PII (pas de mot de passe) ;
  il voit le label, les statuts d'opt-out, l'historique de scans, les rapports par
  broker et les captures. Lancer un scan (editor) exige le mot de passe maître saisi
  au moment du scan.

## 1. Rôles & capacités

| Rôle | Rang | Capacités (cumulatives) |
|---|---|---|
| `viewer` | 0 | Lire les profils qui lui sont **partagés** : label, statuts opt-out, historique scans, rapports broker, captures. Aucune action. |
| `editor` | 1 | + Lancer des scans et gérer le planning sur les profils **accessibles** (partagés). |
| `manager` | 2 | + Créer/posséder des profils (**plusieurs**), éditer/supprimer **ses** profils, partager **ses** profils. Ne voit/édite QUE ses propres profils (n'est pas destinataire de partages). |
| `admin` | 3 | + Voir/éditer/gérer **tous** les profils, gérer utilisateurs & invitations, partager n'importe quel profil. |

**Règle d'accès à un profil** (`canAccessProfile`) :
- `admin` → accès à tout.
- propriétaire (`profile.user_id === user.id`) → accès.
- sinon, existence d'une ligne `profile_access(profile_id, user_id)` → accès.

**Capacité par action sur un profil accessible** :
- Lecture (profil, opt-outs, scans, screenshots) : `viewer`+.
- Lancer un scan / gérer le planning : `editor`+.
- **Éditer (PATCH) / supprimer un profil** : **propriétaire ou admin uniquement** (jamais un editor partagé — l'édition suppose le mot de passe maître).
- Créer un profil : `manager`+.
- Partager un profil (`profile_access`) : **propriétaire du profil ou admin**.
- Gérer utilisateurs / invitations : `admin`.

> Les cibles de partage sont des utilisateurs `viewer` ou `editor`. Un `manager`
> n'est pas destinataire de partage : son périmètre = ses profils possédés.

## 2. Schéma — migration `024_user_roles_rbac.sql`

SQLite ne permet pas d'altérer une contrainte CHECK en place → rebuild de table en
12 étapes (PRAGMA foreign_keys off, table temporaire, copie, drop, rename).

- Reconstruire `users` avec `role TEXT NOT NULL CHECK(role IN ('admin','manager','editor','viewer'))`.
- Migration des données : `'user'` → `'manager'` ; `'admin'` inchangé.
- Nouvelle table :
  ```sql
  CREATE TABLE profile_access (
    id         TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    granted_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    UNIQUE(profile_id, user_id)
  );
  ```
- `invitations` : ajouter `role TEXT NOT NULL DEFAULT 'manager' CHECK(role IN ('manager','editor','viewer'))`.

## 3. Couche d'accès centralisée — `api/src/auth/access.ts`

Remplace les tests dupliqués. Contenu :
- `export const ROLE_RANK = { viewer: 0, editor: 1, manager: 2, admin: 3 }` et type `Role`.
- `hasRank(user, min): boolean`.
- `requireRole(min)` : middleware Fastify (capacités globales — create profile, admin).
- `canAccessProfile(db, user, profileId): boolean` (admin || owner || grant).
- `isOwnerOrAdmin(db, user, profileId): boolean`.
- `requireProfileRead` / `requireProfileAction` : helpers renvoyant 403 sinon, factorisant le pattern actuel.

Les ≈ 8 routes (`profiles`, `scans`, `schedules`, `opt-outs`, `email-configs`,
`screenshots`, `ws`) migrent vers ces helpers.

## 4. Routes

### Partage (nouveau fichier `routes/shares.ts`)
- `POST /profiles/:id/shares` `{ email, role? }` → crée/garantit l'utilisateur cible
  (doit exister), insère `profile_access`. Autorisé : propriétaire ou admin. La cible
  doit être un `viewer`/`editor`.
- `GET /profiles/:id/shares` → liste les partages (email + rôle). Propriétaire ou admin.
- `DELETE /profiles/:id/shares/:userId` → révoque. Propriétaire ou admin.

### Profils
- `GET /profiles` : admin → tous ; sinon → profils **possédés ∪ partagés** (jointure `profile_access`).
- `POST /profiles` : `requireRole('manager')`. Limite à 1 profil **retirée**.
- `GET /profiles/:id`, opt-outs, scans, screenshots : `requireProfileRead` (viewer+).
- `POST /scans`, schedules : `requireProfileAction` (editor+ ou owner).
- `PATCH`/`DELETE /profiles/:id`, `/profiles/:id/decrypt` : `isOwnerOrAdmin`.

### Invitations
- `POST /invitations` `{ email, role }` (role ∈ viewer/editor/manager, défaut manager) — admin.
- L'inscription via invitation applique `invitations.role`.

### Auth
- JWT & `auth/routes.ts` : type `role` élargi aux 4 valeurs ; premier utilisateur = `admin`.

## 5. Frontend

- `store/auth.ts` + `types.ts` : type `Role = 'admin'|'manager'|'editor'|'viewer'` + helper `hasRank`.
- Gating UI :
  - « New profile » : manager+.
  - « Scan now » / « Edit » : Edit = owner/admin ; Scan = editor+ (sur profil accessible).
  - Gestion utilisateurs / invitations : admin.
- **ProfileDetail** : section « Partage » (propriétaire/admin) — ajouter un utilisateur
  par email + rôle d'accès, lister, révoquer.
- **Invitation** : sélecteur de rôle.
- Liste des profils : badge « partagé » vs « possédé » pour les non-admin.

## Flux de données

```
Admin/Manager ── POST /profiles/:id/shares {email,role} ──> profile_access
                                                                 │
Viewer/Editor login ── GET /profiles ──> owned ∪ shared (jointure profile_access)
                                                                 │
            requireProfileRead / requireProfileAction (rang + accès)
                                                                 │
        lecture statuts (viewer)   |   lancer scan (editor, + mot de passe)
```

## 6. Tests (TDD, ≥ 80 %)

- **`access.ts`** : `ROLE_RANK`/`hasRank` ; `canAccessProfile` (admin/owner/grant/refus) ; `isOwnerOrAdmin`.
- **Migration 024** : `user→manager` ; `admin` conservé ; CHECK rejette un rôle invalide ; `profile_access` créée ; cascade delete (supprimer profil ⇒ supprime ses partages).
- **Partage** : owner partage ; admin partage n'importe quel profil ; un editor/viewer ne peut pas partager ; viewer voit un profil partagé mais 404/403 sur un non-partagé ; révocation coupe l'accès.
- **Profils** : manager crée plusieurs profils ; viewer/editor ne peuvent pas créer (403) ; editor lance un scan sur profil partagé, viewer non (403) ; PATCH par non-owner non-admin → 403.
- **Invitations** : rôle stocké et appliqué à l'inscription.
- **Frontend** : gating des boutons par rôle ; section partage (ajout/révocation) ; sélecteur de rôle d'invitation.

## Risques / points ouverts

- **Rebuild de table `users`** : opération sensible (FK, données). La migration doit
  désactiver/réactiver `foreign_keys`, recréer les index, et préserver `invited_by`.
  Couverte par un test de migration sur données existantes.
- **Compat ascendante** : tout `user` existant devient `manager` (conserve la création
  de profils) ; aucun accès perdu. Les profils restent possédés par leur `user_id`.
- **Cibles de partage** : un utilisateur cible doit déjà exister (créé via invitation).
  Pas de création implicite d'utilisateur au moment du partage.
