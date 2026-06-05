# Logo + Scheduling UI — Design Spec

**Date:** 2026-06-05
**Status:** Approved

---

## Périmètre

Deux features frontend indépendantes implémentées dans le même cycle :

1. **Logo** — remplacement de l'icône Moon + texte "Nyx" par un SVG custom avec typographie Outfit gradient
2. **Scheduling UI** — interface de planification automatique des scans (backend déjà 100% opérationnel)

---

## Feature 1 — Logo

### Décision de design

- **Direction :** Œil A2 — mystique néon — contour gradient violet → lavande, iris indigo profond, pupille noire, reflet blanc
- **Typographie :** Outfit 700, texte gradient CSS `#818cf8 → #c4b5fd` (reprend les couleurs de l'œil)
- **Implémentation :** SVG inline dans les composants React — zéro fichier image externe

### Composants modifiés

**`frontend/src/components/Sidebar.tsx`**

Remplace le bloc header actuel :
```tsx
// Actuel
<div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
  <Moon size={16} className="text-white" />
</div>
<span className="text-white font-semibold tracking-wide">Nyx</span>
```

Par :
```tsx
// Nouveau
<NyxLogo />
<span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15,
  background: 'linear-gradient(90deg, #818cf8, #c4b5fd)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  letterSpacing: '.04em' }}>NYX</span>
```

Le composant `NyxLogo` est un SVG inline 32×32 :
- `rect` 64×64 rx=12 fill=`#030712`
- Ellipse de halo indigo `#1e1b4b` opacity=0.4
- Path de l'œil : contour gradient linéaire `#4f46e5 → #a78bfa → #4f46e5`
- Cercle iris : radial gradient `#7c3aed → #4338ca`
- Cercle pupille `#030712`
- Cercle reflet blanc opacity=0.7
- Deux points aux coins (gauche/droite de l'œil) `#818cf8` opacity=0.5

**`frontend/src/components/NyxLogo.tsx`** — nouveau fichier

Composant pur exportant le SVG avec ses `<defs>` (gradients). Accepte `size?: number` (défaut 32). Génère des IDs de gradient uniques par instance pour éviter les conflits SVG.

**`frontend/index.html`** — favicon

Remplace le favicon emoji `🌙` par le même SVG inline encodé :
```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
  <rect width='64' height='64' rx='12' fill='%23030712'/>
  <path d='M8 32C8 32 18 16 32 16C46 16 56 32 56 32C56 32 46 48 32 48C18 48 8 32 8 32Z'
        stroke='%23818cf8' stroke-width='2' fill='none'/>
  <circle cx='32' cy='32' r='10' fill='%235b21b6'/>
  <circle cx='32' cy='32' r='4.5' fill='%23030712'/>
  <circle cx='35' cy='29' r='2' fill='white' opacity='.6'/>
</svg>" />
```

**`frontend/package.json`** — ajouter Outfit comme Google Font

Via `index.html` `<link>` tag (pas de npm package) :
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&display=swap" rel="stylesheet">
```

### Suppression

- Import `Moon` dans `Sidebar.tsx` retiré si plus utilisé ailleurs

---

## Feature 2 — Scheduling UI

### Architecture

Le backend est entièrement opérationnel :
- Table `scan_schedules (id, profile_id, interval_days, next_run, last_run, enabled, encrypted_schedule_key)`
- Worker `scheduler.ts` : poll toutes les 60s, crée des `scan_jobs` pour les schedules dus
- Routes API existantes : `POST /api/profiles/:id/schedule` (password requis), `GET /api/profiles/:id/schedule`, `DELETE /api/profiles/:id/schedule`
- `api.schedule.get/set/delete` déjà dans `frontend/src/api/client.ts`

### Fichiers frontend à créer/modifier

| Fichier | Action |
|---|---|
| `frontend/src/pages/Schedules.tsx` | Créer — page centralisée |
| `frontend/src/pages/ProfileDetail.tsx` | Modifier — ajouter section schedule |
| `frontend/src/components/Sidebar.tsx` | Modifier — ajouter lien Schedules |
| `frontend/src/App.tsx` | Modifier — ajouter route `/schedules` |
| `frontend/src/types.ts` | Modifier — ajouter `ScanSchedule` si absent |

### 2a — Section Schedule dans `ProfileDetail`

Placée après les KPIs, avant l'historique des scans.

**Comportement :**
1. Au chargement : `api.schedule.get(profileId)` → affiche l'état courant
2. Toggle ON : ouvre `PasswordModal` → soumet `api.schedule.set(profileId, password, intervalDays)` → recharge
3. Toggle OFF : `api.schedule.delete(profileId)` sans mot de passe (DELETE ne demande pas de déchiffrement)
4. Changement d'intervalle quand actif : re-ouvre `PasswordModal` → `api.schedule.set(...)` avec nouvelle valeur

**Intervalles disponibles :** 7 / 14 / 30 / 60 / 90 jours

**UI :**
```tsx
<div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
      <Calendar size={14} /> Planning automatique
    </h2>
    <Toggle enabled={schedule?.enabled} onToggle={handleToggle} />
  </div>
  {schedule?.enabled && (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Scanner tous les</span>
        <IntervalSelect value={schedule.interval_days} onChange={handleIntervalChange} />
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Prochain scan : {formatDate(schedule.next_run)}
        {schedule.last_run && ` · Dernier : ${formatDate(schedule.last_run)}`}
      </p>
    </>
  )}
</div>
```

### 2b — Page `Schedules.tsx`

Route : `/schedules`

**Données chargées :** liste des profils + pour chaque profil, son schedule via `api.schedule.get(profile.id)`

**Affichage :** une carte par profil avec :
- Nom du profil
- État : badge `Actif` (violet) ou `Inactif` (gris)
- Si actif : intervalle + prochain scan + dernier scan
- Toggle (activate → PasswordModal, deactivate → DELETE direct)
- Lien "Voir profil" → `/profiles/:id`

**État vide :** si aucun profil, message "Aucun profil — créez un profil pour configurer un planning."

### 2c — Sidebar

Ajouter le lien entre Brokers et History :
```tsx
{ to: '/schedules', icon: Calendar, label: 'Schedules' }
```

Import `Calendar` depuis `lucide-react` (disponible).

### 2d — `App.tsx`

Ajouter la route :
```tsx
<Route path="/schedules" element={<Schedules />} />
```

### Gestion d'état

Chaque composant gère son état localement avec `useState` — pas de state global nécessaire. La `PasswordModal` existante est réutilisée telle quelle.

---

## Hors scope

- Modification du backend scheduling (déjà complet)
- Notification push quand un scan automatique démarre
- Historique par schedule (accessible via l'historique existant)
- Édition du schedule sans ré-authentification (la route API l'exige)

---

## Standards ECC

- TDD : tests frontend avec Vitest + @testing-library/react pour les nouveaux composants
- `NyxLogo` testé : render sans crash, SVG présent dans le DOM
- `Schedules.tsx` testé : affiche les profils, toggle call les bonnes APIs
- Code review après implémentation
- Build TypeScript vérifié avant commit
