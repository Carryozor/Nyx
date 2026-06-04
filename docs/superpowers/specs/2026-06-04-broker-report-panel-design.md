# Broker Report Panel — Design Spec

**Date:** 2026-06-04  
**Status:** Approved  

---

## Contexte

Actuellement, les résultats d'opt-out par broker sont affichés en lignes simples (nom + badge statut) sans aucune possibilité de voir le détail : raison d'échec, screenshots Playwright, pattern email attendu, guide manuel. Cette spec décrit le composant `BrokerReportPanel` et les modifications nécessaires pour l'intégrer dans les 3 surfaces existantes.

---

## Décisions de design

- **Panneau latéral (slide-over)** : s'ouvre à droite de la liste quand on clique un broker. La liste reste visible. Cohérent avec le pattern déjà établi dans `Brokers.tsx`.
- **Scope** : ScanDetail, Brokers, ProfileDetail.
- **Screenshots** : affichés dans le panneau via un endpoint dédié.

---

## Architecture

### Principe général

Chaque page gère `selectedOptOut: OptOutRequest | null` localement avec `useState`. Le composant `BrokerReportPanel` est purement présentationnel — il reçoit l'`OptOutRequest` déjà chargée et fetche les screenshots lazily. Pas de contexte global.

### Flux de données

```
User clique un broker row
  → setSelectedOptOut(optOut)
  → BrokerReportPanel reçoit optOut
  → fetch GET /api/opt-outs/:id/screenshots (lazy, au montage)
  → affichage du panneau
User clique ✕ ou autre broker
  → setSelectedOptOut(null | newOptOut)
```

---

## Composant `BrokerReportPanel`

**Fichier :** `frontend/src/components/BrokerReportPanel.tsx`

**Props :**
```typescript
interface BrokerReportPanelProps {
  optOut: OptOutRequest | null
  onClose: () => void
}
```

**Sections affichées :**

| Section | Condition |
|---|---|
| Résultat (statut, tentatives, dates) | Toujours |
| Raison / Notes | Si `notes` non null |
| Email de confirmation attendu | Si `status === 'awaiting_email'` et `confirmation_pattern` |
| Screenshots | Si screenshots disponibles (fetché via API) |
| Guide manuel | Si `manual_guide` non null |
| Infos broker (type, pays, URL) | Toujours |

**Layout :** panneau fixe 360px à droite, superposé. Se ferme avec ✕ ou Échap.

---

## Modifications API

### 1. `broker-runner.ts` — stocker le job_id dans screenshot

Après chaque run de script, écrire le `jobId` dans la colonne `screenshot` de `opt_out_requests` (colonne existante, actuellement inutilisée). Cela permet de localiser les captures : `{SCREENSHOT_DIR}/{jobId}/{brokerId}/*.png`.

```typescript
// Dans broker-runner.ts, au moment du UPDATE opt_out_requests
// Ajouter : screenshot = COALESCE(screenshot, ?) avec jobId
```

### 2. `GET /api/opt-outs/:id/screenshots`

Retourne la liste des fichiers PNG disponibles pour cet opt-out.

```typescript
// Réponse
[{ filename: "form-filled.png", url: "/api/opt-outs/:id/screenshot/form-filled.png" }]
// Retourne [] si screenshot IS NULL ou dossier inexistant
```

Requiert auth. Vérifie que le profil appartient à l'utilisateur courant (ou admin).

### 3. `GET /api/opt-outs/:id/screenshot/:filename`

Sert le fichier PNG depuis le disque.  
Path résolu : `{SCREENSHOT_DIR}/{screenshot_job_id}/{broker_id}/{filename}`  
Validation : `filename` doit matcher `/^[a-z0-9_-]+\.png$/i` (pas de path traversal).  
Content-Type : `image/png`. Requiert auth.

---

## Modifications frontend

### `types.ts`

Ajouter `confirmation_pattern` dans `OptOutRequest` :

```typescript
export interface OptOutRequest {
  // ... champs existants ...
  confirmation_pattern?: string | null  // à ajouter
}
```

### `ScanDetail.tsx`

- Layout passe de `max-w-4xl` centré à `flex` (liste + panneau).
- Broker rows deviennent des `<button>` clickables avec `onClick={() => setSelectedOptOut(oo)}`.
- Ligne active : highlighted avec `bg-slate-800/60 ring-1 ring-brand-500/40`.
- `BrokerReportPanel` monté à droite si `selectedOptOut !== null`.
- Fermeture : ✕ ou clic sur un autre broker (setSelectedOptOut(newOo)).

### `Brokers.tsx`

- Le contenu existant du panneau droit (`w-96`) est remplacé par `<BrokerReportPanel optOut={...} onClose={...} />`.
- L'`optOut` est trouvée via `optOuts.find(o => o.broker_id === selected?.id)`.

### `ProfileDetail.tsx`

- Ajout d'une section **"Opt-out status"** après le scan history, visible uniquement si `optOuts.length > 0`.
- Liste flat triée par statut (failed → manual → awaiting_email → submitted → confirmed).
- Rows clickables → `BrokerReportPanel` superposé.

### `api/client.ts`

Ajouter dans `optOuts` :

```typescript
screenshots: (id: string) =>
  req<{ filename: string; url: string }[]>('GET', `/opt-outs/${id}/screenshots`),
```

---

## Standards ECC appliqués

### TDD (workflow obligatoire)

Pour chaque unité :
1. **RED** — écrire le test qui échoue
2. **GREEN** — implémenter le minimum pour passer
3. **IMPROVE** — refactorer, vérifier couverture ≥ 80 %

Tests à écrire (dans l'ordre) :
- `GET /api/opt-outs/:id/screenshots` — 200 avec liste, 200 vide si pas de screenshots, 404 si opt-out inexistant, 403 si mauvais user
- `GET /api/opt-outs/:id/screenshot/:filename` — 200 sert le PNG, 400 si filename invalide (path traversal), 404 si fichier absent
- `BrokerReportPanel` — render avec `optOut=null` (vide), render statut failed (notes visibles), render awaiting_email (pattern visible), render manual (guide visible)

### Sécurité

- Validation du `filename` avec regex stricte avant tout accès filesystem (`/^[a-z0-9_-]+\.png$/i`)
- Auth requise sur les 2 nouveaux endpoints (middleware `requireAuth`)
- Vérification ownership du profil avant de servir un screenshot
- Pas de `dangerouslySetInnerHTML` dans `BrokerReportPanel` (le `manual_guide` est rendu en `whitespace-pre-wrap`, pas en HTML)

### Immutabilité

- Toutes les mises à jour de state via spread ou fonctions pures
- `setSelectedOptOut` ne mute jamais l'objet existant

### Code quality

- `BrokerReportPanel` < 150 lignes (extraire `ScreenshotGallery` si besoin)
- Fonctions focalisées < 50 lignes
- Pas de `console.log` en production

### Code review

Après implémentation : lancer l'agent **code-reviewer** puis **security-reviewer** (endpoint filesystem + auth).

---

## Ordre d'implémentation (phases)

| Phase | Tâche | Dépend de |
|---|---|---|
| 1 | Stocker `jobId` dans `screenshot` (broker-runner) | — |
| 2 | Tests + endpoint `GET /screenshots` | Phase 1 |
| 3 | Tests + endpoint `GET /screenshot/:filename` | Phase 1 |
| 4 | `BrokerReportPanel` + tests unitaires | Phase 2, 3 |
| 5 | Intégration `ScanDetail` | Phase 4 |
| 6 | Intégration `Brokers` | Phase 4 |
| 7 | Intégration `ProfileDetail` | Phase 4 |
| 8 | Code review + security review | Phase 5, 6, 7 |

---

## Ce qui est hors scope

- Historique par tentative (plusieurs scans du même broker) — chaque opt-out est unique par `(profile_id, broker_id)`
- Suppression manuelle d'un opt-out depuis l'UI
- Rechargement du statut en temps réel dans le panneau (le WS existant suffit pour les mises à jour de la liste)
