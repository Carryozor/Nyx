# Design — Filtre par pays / région au lancement du scan

**Date** : 2026-06-11
**Statut** : approuvé (design)
**Branche** : `feat/gdpr-email-engine`

## Problème

L'utilisateur veut choisir **où** sont envoyées les demandes d'opt-out : des pays
précis (ex. FR + PL) ou des régions (Union Européenne, Europe géographique, US).
Aujourd'hui un scan cible tous les brokers actifs (filtrés seulement par audience).

## Données

Aucune migration. La colonne `brokers.country` existe déjà. Valeurs présentes :
`FR, DE, ES, IT, NL, BE, PL, SE, CH, UK, EU, US` (`EU` = brokers pan-européens).
« Classé par langue » = classé par pays ; `gdpr_lang` en découle.

## Sémantique des régions (frontend)

| Bouton | Codes pays inclus |
|---|---|
| **Union Européenne** | BE, DE, ES, FR, IT, NL, PL, SE + `EU` |
| **Europe** (géographique) | UE ci-dessus **+ CH + UK** + `EU` |
| **US** | US |
| **Tout** (défaut) | aucun filtre → tous les pays |

Règle validée : sélectionner des pays précis cible **exactement** ces pays. Les
brokers `country='EU'` ne sont inclus **que** lorsqu'un bouton région ajoute le
code `EU` à la sélection — un FR + PL manuel ne les prend pas.

Constantes (`frontend/src/lib/regions.ts`) :
- `EU_COUNTRIES = ['BE','DE','ES','FR','IT','NL','PL','SE']`
- `EUROPE_COUNTRIES = [...EU_COUNTRIES, 'CH','UK']`
- Le code pan-européen `'EU'` est ajouté par les boutons UE et Europe.
- Les boutons n'activent que les pays réellement présents dans la liste des brokers
  (intersection), pour rester robustes si un pays est ajouté/retiré.

## API — `POST /scans`

Nouveau champ optionnel `countries?: string[]` (codes pays). Sélection des brokers,
chemin par défaut (hors mode expert) :

```sql
SELECT * FROM brokers
WHERE active = 1 AND type IN ('auto','semi')
  AND audience IN (<scopes audience>)      -- inchangé
  AND (<countries vide> OR country IN (<countries>))
```

- `countries` absent ou vide → aucun filtre pays (compat = comportement actuel).
- Le **mode expert** (`brokerIds[]`) prime sur audience ET countries (inchangé).
- L'API filtre par codes exacts. L'expansion région→codes vit côté frontend ;
  l'API reste minimale et testable. Le code `EU` n'entre dans la liste que si un
  bouton région l'y met → la règle « pays précis n'inclut pas les pan-EU » tient
  sans logique spéciale côté serveur.
- Validation Zod : `z.array(z.string()).max(20).optional()`.

## Frontend — `ScanModal`

Sous le sélecteur d'audience, un bloc **Pays** :
- Boutons rapides : **Tout / Union Européenne / Europe / US** (togglent les groupes).
- Cases à cocher par pays disponible (dérivées de `api.brokers.list()`), avec le code pays.
- Envoie `countries` à `api.scans.create` (vide = Tout). Se combine avec l'audience
  et le mode expert déjà en place.

## Tests (TDD, ≥ 80 %)

- **API `/scans`** :
  - `countries=['FR','PL']` → opt-outs uniquement pour des brokers FR/PL ; aucun broker `EU`.
  - `countries=['FR','PL','EU']` → inclut aussi les brokers pan-européens.
  - `countries=['US']` → uniquement US.
  - vide / absent → tous les pays (= comportement par défaut).
  - combiné avec `audience='professional'` → intersection pays ∩ audience.
  - `brokerIds` fourni → prime, `countries` ignoré.
- **Frontend** : typecheck ; un bouton région coche exactement les bons pays présents.

## Périmètre / risques

- Ajout symétrique au filtre d'audience ; pas de migration ni de changement de schéma.
- `country='EU'` est un tag pan-européen, pas un pays — géré explicitement (n'apparaît
  pas comme une case « pays » individuelle dans l'UI ; inclus via les boutons région).
