# Design — Audience privé/pro des brokers

**Date** : 2026-06-11
**Statut** : approuvé (design), spec en relecture
**Branche** : `feat/gdpr-email-engine`

## Problème

Certains brokers ne renvoient que des données d'entreprises (B2B) — typiquement
Altares (Altares D&B). Les inclure dans un opt-out « particulier » est inutile :
sans n° SIREN/SIRET ni raison sociale, la demande RGPD n'a pas de sens pour eux.

Aujourd'hui :
- La table `brokers` n'a aucune notion d'audience (privé / pro).
- 7 brokers B2B français (`societe-com`, `verif-com`, `kompass-fr`, `infogreffe`,
  `pappers`, `manageo`, `nomination`) sont traités comme tous les autres.
- La PII du profil ne contient ni société ni SIREN/SIRET ni forme juridique.
- `POST /scans` ne filtre pas par audience (il prend tous les brokers `auto`/`semi`
  actifs, ou un `brokerIds[]` explicite).

## Objectif

1. Classer chaque broker par **audience** : `private`, `professional`, ou `both`.
2. Ajouter un **bloc entreprise optionnel** à la PII du profil (chiffré).
3. Permettre de choisir, **au lancement du scan**, l'audience ciblée
   (privé / pro / les deux) + un **mode expert** pour cocher des brokers
   individuellement, chacun avec une **vignette de type**.
4. Enrichir le **mail RGPD** des brokers pro avec les données société.

Non-objectifs (YAGNI) :
- Pas de colonne `profiles.type` séparée : l'audience est choisie au scan ; la
  présence (ou non) du bloc entreprise dans la PII suffit côté profil.
- Pas de refonte de la sélection de brokers existante (le `brokerIds[]` reste).

## 1. Schéma — migration `023_broker_audience.sql`

```sql
ALTER TABLE brokers
  ADD COLUMN audience TEXT NOT NULL DEFAULT 'private'
  CHECK(audience IN ('private','professional','both'));
```

Reclassement des brokers français :

| Audience | Brokers |
|---|---|
| `private` (défaut, inchangé) | pagesblanches, annuaire-laposte, hoodspot, copainsdavant, trombi + tous les brokers non-FR (US, DE, …) |
| `both` | pagesjaunes, 118712, annuaire-118000 (annuaires universels) ; societe-com, verif-com, infogreffe, pappers (société **+ dirigeant personne physique**) |
| `professional` | kompass-fr, manageo, nomination (B2B pur) ; **altares** (nouveau) |

### Nouveau broker : Altares

```sql
INSERT INTO brokers (id, name, url, country, type, audience, active, opt_out_email, gdpr_lang)
VALUES ('altares', 'Altares D&B', 'https://www.altares.com', 'FR',
        <'auto' si adresse DPO confirmée, sinon 'manual'>, 'professional', 1,
        <adresse DPO à confirmer>, 'fr');
```

> **À confirmer pendant l'implémentation** : l'adresse opt-out RGPD réelle d'Altares.
> Si elle ne peut pas être confirmée, le broker est créé en `type='manual'`
> (guide manuel) plutôt qu'en `auto`, pour ne pas envoyer un mail à une adresse erronée.

## 2. PII profil — bloc entreprise optionnel

`DecryptedPII` (worker `worker/src/scripts/_types.ts`) et l'encodage côté API
gagnent un champ optionnel :

```ts
export interface CompanyInfo {
  name: string
  siren?: string
  siret?: string
  legalForm?: string
}

export interface DecryptedPII {
  // … champs existants …
  company?: CompanyInfo
}
```

- Champ **optionnel** : un profil privé le laisse absent.
- Chiffré dans `encrypted_pii` au même titre que le reste (aucun changement de
  schéma DB sur `profiles` ; le bloc vit dans le JSON chiffré).
- Validation : si présent, `name` requis ; `siren` (9 chiffres) / `siret`
  (14 chiffres) validés par regex côté API si renseignés.

## 3. Sélecteur au lancement du scan

`POST /scans` (`api/src/routes/scans.ts`) :

```ts
audience: z.enum(['private','professional','both']).default('both'),
brokerIds: z.array(z.string()).min(1).max(100).optional(), // existant — mode expert
```

Sélection des brokers (chemin par défaut, quand `brokerIds` absent) :

| `audience` | Brokers inclus (parmi `active=1 AND type IN ('auto','semi')`) |
|---|---|
| `private` | `audience IN ('private','both')` |
| `professional` | `audience IN ('professional','both')` |
| `both` | tous |

Si `brokerIds[]` est fourni → **mode expert**, il prime (comportement actuel
inchangé), `audience` est ignoré.

## 4. Worker — mail RGPD enrichi

`buildGdprEmail(broker, pii)` (`worker/src/gdpr-templates.ts`) :

- Si `broker.audience ∈ {professional, both}` **et** `pii.company` présent →
  injecter un bloc localisé :
  ```
  Données concernant l'entreprise associée :
  - Raison sociale : <name>
  - SIREN : <siren>
  - SIRET : <siret>
  - Forme juridique : <legalForm>
  ```
- Sinon → bloc omis (comportement actuel).
- `buildGdprEmail` doit donc recevoir `broker.audience` (ajouter le champ au type
  `GdprBroker` et le sélectionner dans `broker-runner.ts`).

## 5. Frontend

- **Formulaire profil** : section repliable « Professionnel » (société, SIREN,
  SIRET, forme juridique). Vide = profil privé.
- **Écran de lancement de scan** :
  - Sélecteur 3 valeurs : 🟢 Privé / 🔵 Professionnel / 🟣 Les deux.
  - Toggle « Mode expert » → liste des brokers cochables, chacun avec une
    **vignette de type** (🟢 privé / 🔵 pro / 🟣 les 2). Envoie `brokerIds[]`.
  - L'API expose `audience` sur chaque broker (route liste brokers) pour les badges.

## Flux de données

```
Profil (frontend) ──chiffré──> encrypted_pii { …, company? }
                                      │
Lancement scan (frontend) ── audience | brokerIds[] ──> POST /scans
                                      │
                       filtre brokers par audience (ou brokerIds)
                                      │
                          scan_jobs + opt_out_requests
                                      │
Worker ─ broker.audience + pii.company ─> buildGdprEmail (bloc société si pro)
                                      │
                       envoi Brevo (From=privacy@vidar.fr)
```

## Tests (TDD, ≥ 80 %)

- **Migration** : audience par défaut `private` ; reclassement correct ;
  contrainte CHECK rejette une valeur invalide ; Altares présent.
- **API `/scans`** : filtre `private` exclut les `professional` ; `professional`
  exclut les `private` ; `both` prend tout ; `private`/`professional` incluent les
  `both` ; `brokerIds[]` prime sur `audience`.
- **API profil** : validation SIREN/SIRET ; bloc company round-trip
  chiffrement/déchiffrement.
- **`buildGdprEmail`** : bloc société présent pour broker pro avec company ;
  absent pour broker privé ; absent pour broker pro sans company.
- **Worker** : `broker-runner` passe bien `audience` au template.
- **Frontend** : section pro affichée/masquée ; sélecteur audience envoie le bon
  paramètre ; mode expert envoie `brokerIds[]` ; badges de type rendus.

## Risques / points ouverts

- **Adresse DPO Altares** : à confirmer, sinon `manual` (cf. §1).
- **Classement `both` vs `professional`** : validé par l'utilisateur ; ajustable
  par simple `UPDATE` dans la migration.
- **Compat ascendante** : les scans existants sans `audience` → défaut `both`
  (comportement identique à aujourd'hui).
