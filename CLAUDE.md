# CLAUDE.md — DigiLeads (état au 03/09/2026)

## Vue d'ensemble

Application web interne Digilityx pour détecter, qualifier et prioriser des leads B2B après scraping LinkedIn (Phantombuster). Elle enrichit, score et priorise les contacts et entreprises pour les équipes commerciales.

**Stack technique :**
- **Frontend :** React 19 + Vite + Tailwind CSS v4 + shadcn/ui + Recharts
- **Backend / BDD :** Supabase exclusivement (PostgreSQL + Auth + Realtime + Edge Functions)
- **IA / LLM :** Claude API — appelé uniquement via Supabase Edge Functions
- **Déploiement :** GitHub Pages (GitHub Actions → branche `gh-pages`) + `vercel.json` présent pour routing SPA si Vercel utilisé

---

## Contrainte absolue — Site 100% statique

L'application est déployée sur **GitHub Pages** (fichiers statiques uniquement).

### Interdit côté frontend
- Logique serveur (pas de Next.js API Routes, SSR, Server Components)
- Appel direct à l'API Anthropic (exposition de clés)
- Appel direct à l'API Slack
- `@supabase/ssr` ou tout package lié au rendu serveur
- `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` dans les variables frontend

### Autorisé côté frontend
- Appels Supabase via `supabase-js` (clé `anon` uniquement)
- Appels aux **Supabase Edge Functions** (qui détiennent les secrets)
- Authentification Supabase Auth
- Temps réel via Supabase Realtime

### Variables d'environnement

**Frontend (`.env`) — uniquement les clés publiques :**
```env
VITE_SUPABASE_URL=https://pcxcdhhxnqbxfrqxnikj.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Supabase Edge Functions (secrets Dashboard — jamais dans le frontend) :**
```
ANTHROPIC_API_KEY
SLACK_BOT_TOKEN
SLACK_CHANNEL_ID
SUPABASE_SERVICE_ROLE_KEY
```

---

## Rôles utilisateurs

Les rôles sont portés par le champ `role` sur `membres_digilityx` (pas une table séparée).

| Rôle | Accès |
|------|-------|
| `admin` | Toutes les pages : Dashboard, Entreprises, Contacts, Membres, Notifications, Import |
| `account_manager` | Contacts + Entreprises uniquement (même accès que membre) |
| `membre` | Contacts + Entreprises uniquement |

**Règle d'accès :** un membre doit avoir `partager_contacts = true` pour pouvoir se connecter. Si `partager_contacts = false`, la connexion est refusée même avec des identifiants valides.

**Connexion liée à `membres_digilityx` :** le champ `auth_user_id` lie un compte Supabase Auth à un membre. Le rôle est lu au moment de la connexion et stocké dans le contexte React (`AuthProvider`).

---

## Schéma de la base de données

### Table : `membres_digilityx`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `first_name` / `last_name` | TEXT | |
| `full_name` | TEXT (généré) | `first_name || ' ' || last_name` |
| `role` | TEXT | `'membre'` \| `'account_manager'` \| `'admin'` |
| `email` | TEXT | |
| `slack_user_id` | TEXT | |
| `auth_user_id` | UUID | Lien vers Supabase Auth |
| `actif` | BOOLEAN | `true` par défaut — membre encore présent chez Digi |
| `partager_contacts` | BOOLEAN | `true` par défaut — ses contacts exclusifs sont visibles des autres |
| `consent` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

**Règle :** quand `actif` passe à `false`, `partager_contacts` est forcé à `false` automatiquement (trigger `sync_partager_contacts_on_depart`).

---

### Table : `entreprises`

Colonnes principales :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `company_name` | TEXT NOT NULL | |
| `company_website` / `company_domain` | TEXT | |
| `company_id_linkedin` | TEXT UNIQUE | |
| `company_employee_count` | INTEGER | Effectif exact |
| `company_employee_range` | TEXT | Range textuel Phantombuster |
| `company_location` | TEXT | |
| `company_typology` | TEXT | `Grand Groupe` \| `ETI` \| `PME` \| `TPE` \| `Startup` |
| `secteur_digi` | TEXT | Voir liste des 16 secteurs ci-dessous |
| `linkedin_industry` | TEXT | Secteur brut LinkedIn |
| `icp` | BOOLEAN | Calculé automatiquement par trigger |
| `tier` | TEXT | `Tier 1` \| `Tier 2` \| `Tier 3` \| `Hors-Tier` — calculé par trigger |
| `statut_entreprise` | TEXT | `À démarcher` \| `Activement démarché` \| `Deal en cours` \| `Devenu client Digileads` |
| `statut_digi` | TEXT | `Client Digi - pas de mission` \| `Client Digi - mission en cours` \| `Pas client Digi` \| `Client Digileads` |
| `is_digi_client` | BOOLEAN | Calculé automatiquement depuis `statut_digi` |
| `owner` | UUID → `membres_digilityx.id` | Propriétaire de l'entreprise |
| `account_manager_id` | UUID → `membres_digilityx.id` | AM affecté (peut être auto-assigné) |
| `is_placeholder` | BOOLEAN | Entreprise temporaire sans données réelles |
| `is_subsidiary` / `is_parent_entity` | BOOLEAN | Hiérarchie groupe/filiale |
| `parent_company_id` | UUID → `entreprises.id` | |
| `company_website_from_linkedin` | TEXT | |
| `company_description` / `company_specialties` | TEXT | |
| `source_acquisition` | TEXT | |
| `justification` | TEXT | |
| `scoring_icp` | INTEGER | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**16 secteurs `secteur_digi` :**
Pharma/Santé, BAF, Éducation & Formation, Tourisme Hôtellerie & Loisirs, Technologie & IT, Prestations aux entreprises, Media & Communication, Recrutement, Commerce de Détail, Luxe, Services aux Consommateurs, Industrie & Énergie, Transports & Logistique, Immobilier & Construction, Public & Administrations, Concurrent

---

### Table : `contacts`

Colonnes principales :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `linkedin_url` | TEXT UNIQUE | |
| `id_url_linkedin` | TEXT | |
| `first_name` / `last_name` / `full_name` (généré) | TEXT | |
| `position` | TEXT | Poste actuel |
| `email` / `location` | TEXT | |
| `company_name` | TEXT | Nom brut LinkedIn |
| `company_id_linkedin` | TEXT | |
| `entreprise_id` | UUID → `entreprises.id` | Rattachement entreprise |
| `years_in_position` / `months_in_position` | NUMERIC | |
| `years_in_company` / `months_in_company` | NUMERIC | |
| `summary` / `title_description` | TEXT | Profil LinkedIn |
| `connection_degree` | TEXT | |
| `is_premium` / `is_open_link` | BOOLEAN | |
| `shared_connections_count` | INTEGER | |
| `profile_image_url` / `default_profile_url` | TEXT | |
| `last_scraped_at` | TIMESTAMPTZ | |
| `persona` | TEXT | `Dirigeant` \| `Marketing` \| `Produit` \| `Design` \| `Commercial` \| `Acheteur` \| `Hors expertise Digi` |
| `hierarchie` | TEXT | `COMEX` \| `Directeur` \| `Manager` \| `Opérationnel` \| `Stagiaire/Alternant` |
| `contact_digi` | BOOLEAN | Contact interne Digilityx |
| `statut_contact` | TEXT | `À contacter` \| `Contacté` \| `Intéressé` \| `Pas intéressé` \| `Client` |
| `niveau_de_relation` | TEXT | Valeur cache — maintenue par trigger depuis `contacts_membres_relations` |
| `scoring` | INTEGER | Calculé automatiquement par trigger (max 100) |
| `nb_personnes_digi_relation` | INTEGER | Cache — maintenu par trigger |
| `owner_membre_id` | UUID → `membres_digilityx.id` | |
| `masque` | BOOLEAN | `true` si tous les membres liés ont `partager_contacts = false` |
| `query` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### Table : `contacts_membres_relations`

Relation many-to-many entre contacts et membres.

| Colonne | Type |
|---------|------|
| `contact_id` | UUID → `contacts.id` |
| `membre_id` | UUID → `membres_digilityx.id` |
| `niveau_de_relation` | TEXT (par membre) |
| `connection_degree` | `'1st'` \| `'2nd'` \| `'3rd'` |
| `notes` | TEXT |
| `scoring` | INTEGER (dénormalisé) |
| `company_name` | TEXT (dénormalisé) |
| `entreprise_id` | UUID (dénormalisé) |

---

## Règles de scoring et de qualification

### Tier / ICP (calculé automatiquement par trigger)

| Condition | Tier | ICP |
|-----------|------|-----|
| `company_typology` NULL, TPE ou Startup | Hors-Tier | Non |
| `secteur_digi = 'Concurrent'` | Hors-Tier | Non |
| Typologie éligible × secteur NULL | Tier 3 | Non spécifié |
| Secteur = Pharma/Santé ou BAF | **Tier 1** | Oui |
| Autres secteurs ICP | **Tier 2** | Oui |

**Dérivation de la typologie depuis l'effectif :**
- ≥ 5000 → Grand Groupe
- ≥ 250 → ETI
- ≥ 10 → PME
- ≥ 1 → TPE

---

### Scoring contact (max 100 pts, calculé automatiquement par trigger)

| Dimension | Valeur | Points |
|-----------|--------|--------|
| **Hiérarchie** | COMEX | 30 |
| | Directeur | 20 |
| | Manager | 15 |
| | Opérationnel | 5 |
| **Persona** | Tout sauf "Hors expertise Digi" | 20 |
| **Niveau de relation** | Ami | 30 |
| | Ancien collègue / Alumni / Partenaire business / Cercle familial | 20 |
| | Connaissance | 5 |
| **Nb personnes Digi en relation** | ≥ 3 | 20 |
| | 2 | 10 |
| | 1 | 5 |

---

### Affectation automatique des Account Managers

Trigger `auto_assign_account_manager` — s'exécute sur INSERT/UPDATE de `secteur_digi`, `company_typology`, `is_placeholder` sur `entreprises`.

**Règles :**
- Ne jamais écraser un `account_manager_id` déjà renseigné
- Ne pas affecter les lignes `is_placeholder = true`
- Tirage aléatoire parmi le pool du secteur

| Secteur | Typologie | Pool AM |
|---------|-----------|---------|
| **Pharma/Santé** | toutes | François Coulon, Clément Guichard, Alexandre Koch, Alexandra Martin |
| **BAF** | Grand Groupe | Julien Bechkri, Cindy Renard, Emmanuel Utard, Clément Maria |
| **BAF** | ETI / PME / TPE / null | Christophe Pelletier, Yanis Sif |
| Autres | — | Aucune affectation automatique |

---

## Fonctions SQL (triggers et RPCs)

### Triggers (s'exécutent automatiquement)

| Fonction | Déclencheur | Rôle |
|----------|-------------|------|
| `compute_entreprise_tier_icp` | BEFORE INSERT/UPDATE `company_typology`, `secteur_digi` sur `entreprises` | Calcule `tier` et `icp` |
| `auto_assign_account_manager` | BEFORE INSERT/UPDATE `secteur_digi`, `company_typology`, `is_placeholder` sur `entreprises` | Affecte un AM selon les règles sectorielles |
| `sync_is_digi_client` | BEFORE INSERT/UPDATE `statut_digi` sur `entreprises` | Synchronise `is_digi_client` |
| `compute_contact_scoring` | BEFORE INSERT/UPDATE `hierarchie`, `persona`, `niveau_de_relation`, `nb_personnes_digi_relation` sur `contacts` | Calcule le scoring |
| `sync_partager_contacts_on_depart` | BEFORE UPDATE `actif` sur `membres_digilityx` | Force `partager_contacts = false` si `actif → false` |
| `recompute_contact_masque` | AFTER INSERT/UPDATE/DELETE sur `contacts_membres_relations` | Recalcule `masque` sur le contact |
| `trg_membre_partager_recompute_masque` | AFTER UPDATE `partager_contacts` sur `membres_digilityx` | Recalcule `masque` sur tous les contacts du membre |

### RPCs (appelées depuis le frontend)

| Fonction | Rôle |
|----------|------|
| `get_contacts_for_membre(p_membre_id, filtres…, p_offset, p_limit)` | Liste paginée/filtrée des contacts d'un membre (exclut `masque` et `contact_digi`) |
| `count_contacts_for_membre(p_membre_id, filtres…)` | Comptage avec les mêmes filtres (fast path si aucun filtre) |
| `get_entreprises_for_membre(p_membre_id, filtres…, p_offset, p_limit)` | Liste paginée/filtrée des entreprises liées aux contacts d'un membre |
| `count_entreprises_for_membre(p_membre_id, filtres…)` | Comptage avec les mêmes filtres |
| `get_entreprise_ids_for_membre(p_membre_id)` | UUIDs des entreprises scoped à un membre |
| `get_membre_relations_by_tier()` | Répartition réseau par tier et par membre (membres actifs, contacts non masqués) |
| `get_membre_contact_count()` | Nb de contacts par membre (actifs, partageant, non masqués) |
| `get_membre_tier1_unqualified_count()` | Nb de contacts Tier 1 sans niveau de relation renseigné par membre |
| `contact_counts_for_entreprises(ids)` | Nb de contacts agrégé par `entreprise_id` |
| `get_dashboard_stats()` | 9 compteurs pour le dashboard en un seul appel |
| `get_secteur_stats()` | Nb d'entreprises par secteur |

---

## Edge Functions Supabase

Une seule Edge Function déployée : **`send-slack-notification`**

Envoie une notification Slack quand un contact atteint un score suffisant.

Les autres fonctions prévues initialement (qualify-with-llm, process-phantombuster, sync-google-sheets) **ne sont pas encore implémentées**.

---

## Vues frontend (routes)

| Route | Rôle requis | Description |
|-------|-------------|-------------|
| `/` | admin | Dashboard — KPIs globaux |
| `/entreprises` | tous | Liste filtrée par tier, statut, secteur, AM |
| `/contacts` | tous | Liste avec scoring, statut, qualification |
| `/membres` | admin | Stats par membre, gestion du réseau |
| `/notifications` | admin | Centre de notifications Slack |
| `/import` | admin | Upload xlsx/csv Phantombuster, enrichissement |

Les rôles `membre` et `account_manager` sont redirigés vers `/contacts` à la connexion.

---

## Conventions de code

- TypeScript strict partout
- `snake_case` pour les colonnes Supabase, `camelCase` pour le TypeScript
- Alias `@/` → `src/` (configuré dans `vite.config.ts`)
- Client Supabase : `supabase-js` v2 avec clé `anon` uniquement — **jamais `@supabase/ssr`**
- Variables frontend préfixées `VITE_` — aucun secret
- Tout appel à une API tierce passe **obligatoirement** par une Edge Function
- Pas de fichier `api/` ni de route serveur dans le frontend

---

## Déploiement

### GitHub Pages (déploiement principal)

```bash
# Push sur main → GitHub Actions build + deploy automatiquement
git push origin main
```

GitHub Actions (`deploy.yml`) : build Vite → publie `./dist` sur la branche `gh-pages`.
Secrets GitHub requis : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Commandes utiles

```bash
# Dev local
npm run dev

# Build + preview local
npm run build && npm run preview

# Générer les types Supabase
npx supabase gen types typescript --project-id pcxcdhhxnqbxfrqxnikj > src/lib/database.types.ts

# Déployer les Edge Functions
npx supabase functions deploy send-slack-notification

# Définir les secrets Edge Functions
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set SLACK_BOT_TOKEN=xoxb-...
```

---

---

## 👥 Membres Digilityx — règles réelles

### Schéma complet de `membres_digilityx` (après migrations)

```sql
id                  UUID PRIMARY KEY (généré automatiquement — ne jamais modifier)
first_name          TEXT NOT NULL
last_name           TEXT NOT NULL
full_name           TEXT GENERATED (first_name || ' ' || last_name)
email               TEXT
auth_user_id        UUID  -- lié à auth.users.id de Supabase Auth
role                TEXT  -- 'admin' | 'account_manager' | 'membre'
actif               BOOLEAN DEFAULT true
partager_contacts   BOOLEAN DEFAULT true
slack_user_id       TEXT   -- identifiant Slack format U... (ex: U017Z701THU)
last_slack_nudge_at TIMESTAMPTZ  -- dernière relance Slack envoyée à ce membre
created_at          TIMESTAMPTZ
```

### Règles importantes
- `auth_user_id` = UUID du compte Supabase Auth (Authentication → Users). C'est le lien entre le login et le membre. **Différent du `id` interne de la table.**
- Si `actif = false` → `partager_contacts` est automatiquement passé à `false` (trigger SQL)
- Si `partager_contacts = false` → le membre ne peut **pas se connecter** à l'app (accès refusé dans `auth.tsx`)
- Pour ajouter un membre : créer le compte dans Supabase Auth d'abord (Authentication → Users → Create user), récupérer son UUID, puis INSERT dans `membres_digilityx` avec `auth_user_id` = cet UUID

### Ajouter un membre (SQL)
```sql
INSERT INTO membres_digilityx (first_name, last_name, email, actif, partager_contacts, slack_user_id, auth_user_id, role)
VALUES ('Prénom', 'Nom', 'email@digilityx.com', true, true, 'UXXXXXXXX', '<UUID-Auth>', 'membre');
```

---

## 📥 Import des contacts — règles complètes

### Table clé : `contacts_membres_relations`
Chaque contact peut appartenir au réseau de **plusieurs membres** Digi. La relation est stockée dans `contacts_membres_relations` :
```sql
contact_id          UUID REFERENCES contacts(id)
membre_id           UUID REFERENCES membres_digilityx(id)
niveau_de_relation  TEXT  -- 'Ami', 'Cercle familial', 'Ancien collègue', 'Alumni',
                          --  'Partenaire business', 'Connaissance', 'Non renseigné'
-- Contrainte UNIQUE : (contact_id, membre_id)
```
Le `niveau_de_relation` est **par membre** — un même contact peut avoir une relation différente selon chaque membre Digi.

### Champ `masque` sur `contacts`
Un contact est masqué (`masque = true`) quand **toutes** ses relations membres ont `partager_contacts = false`. Il redevient visible dès qu'un membre actif partageant le pointe.

### Règles de déduplication contacts

| Priorité | Critère | Fiabilité |
|----------|---------|-----------|
| 1 | `id_url_linkedin` (ACw...) | ✅ Permanent, ne change jamais |
| 2 | `linkedin_url` | ⚠️ Peut changer si la personne renomme son profil |
| 3 | Ni l'un ni l'autre | → INSERT (nouveau contact) |

**Ne jamais écraser** sur un contact existant : `scoring`, `statut_contact`, `persona`, `hierarchie`, `priorite`, `contact_digi`, `niveau_de_relation`.

**Mettre à jour uniquement si changé** : `position`, `company_name`, `company_id_linkedin`, `location`.

### Règles de déduplication entreprises

| Priorité | Critère |
|----------|---------|
| 1 | `company_id_linkedin` (ID numérique LinkedIn) |
| 2 | Nom normalisé (minuscules, sans accents, sans ponctuation) |
| Si déjà en base | → skip, pas d'écrasement |

### Règles de création de relation
- `niveau_de_relation = 'Non renseigné'` par défaut à l'import
- `ignoreDuplicates: true` → n'écrase jamais une relation existante
- Après chaque import → recalculer `nb_personnes_digi_relation` sur les contacts concernés

### Scripts d'import selon le format

| Format source | Script | Commande |
|---------------|--------|----------|
| Export Pronto / Sales Navigator | `import-pronto.mjs` | `node scripts/import-pronto.mjs --file=fichier.xlsx --membre=<uuid>` |
| Export LinkedIn natif (connexions) | `import-linkedin-connections.mjs` | `node scripts/import-linkedin-connections.mjs --file=fichier.xlsx --membre=<uuid>` |
| Phantombuster CSV (scraping mensuel) | `monthly-import.mjs` | `node scripts/monthly-import.mjs --file=fichier.csv` |
| Entreprises Phantombuster | `import-phantombuster-companies.mjs` | `node scripts/import-phantombuster-companies.mjs --file=fichier.csv` |

> ⚠️ Toujours lancer avec `--dry-run` d'abord pour vérifier le résumé avant d'appliquer.

### Limites par format

**Export LinkedIn natif** : pas de `company_id_linkedin`, pas de `company_name`, pas de `location`, pas d'`id_url_linkedin`. Les contacts arrivent sans rattachement entreprise. Attendre un export Pronto enrichi ou enrichir via Phantombuster.

**Export Pronto** : 3 variantes de colonnes gérées automatiquement par `normalizeRow()` dans le script.

---

## 🔧 Scripts utilitaires

| Script | Usage |
|--------|-------|
| `classify-persona-hierarchie.mjs` | Classifie automatiquement `persona` et `hierarchie` depuis le poste (Tier 1 en priorité). Lancer après chaque import. |
| `import-niveau-relation.mjs` | Met à jour `niveau_de_relation` depuis un fichier Excel fourni par un membre. |
| `detect-merge-duplicates.mjs` | Détecte les doublons contacts (même prénom + nom) et propose une fusion. |
| `merge-from-xlsx.mjs` | Fusionne les doublons validés manuellement dans un xlsx. |
| `enrich-apollo.mjs` | Enrichit les entreprises sans taille via API Apollo.io. |
| `enrich-entreprises-enrichies.mjs` | Applique les données du fichier `ENTREPRISES_ENRICHIES.xlsx` en base. |
| `find-tier1-sans-relation-dans-xlsx.mjs` | Trouve les contacts Tier 1 sans relation membre dans les xlsx existants. |
| `map-industry-to-secteur.mjs` | Mappe les industries LinkedIn vers `secteur_digi`. |
| `verify-classification.mjs` | Vérifie la cohérence des classifications en base vs les règles du script. |

---

## Règles pour Claude Code

- Avant toute implémentation complexe (nouveau schéma, Edge Function, nouvelle logique de scoring), passer en mode Plan et attendre validation
- Toute modification des règles AM → nouvelle migration SQL dans `supabase/migrations/` avec timestamp `YYYYMMDDHHMMSS_description.sql`
- Le trigger `compute_entreprise_tier_icp` et la fonction `computeTier` dans `src/lib/scoring/compute-tier.ts` doivent rester synchronisés
- Le trigger `compute_contact_scoring` et la fonction `scoreContact` dans `src/lib/scoring/score-contact.ts` doivent rester synchronisés
