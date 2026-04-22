# CLAUDE.md — Lead Detection App (Post-LinkedIn Scraping)

## 🧠 Vue d'ensemble du projet

Cette application permet de détecter et qualifier des opportunités de leads après scraping LinkedIn (via Phantombuster). Elle enrichit, score et priorise les contacts et entreprises pour les équipes commerciales Digilityx.

**Stack technique :**
- **Backend / BDD :** Supabase **exclusivement** (PostgreSQL + Auth + Realtime + Edge Functions)
- **Frontend :** React 18 + Vite + Tailwind CSS + shadcn/ui (SPA statique)
- **IA / LLM :** Claude API (Anthropic) — appelé uniquement via Supabase Edge Functions
- **Intégrations :** Phantombuster, Slack, Google Sheets
- **Déploiement :** GitHub Pages (site statique)

---

## 🚨 Contrainte absolue — GitHub Pages = site 100% statique

> **Cette règle prime sur toutes les autres décisions d'architecture.**

L'application est déployée sur **GitHub Pages**, qui ne sert que des fichiers statiques. Cela impose des contraintes strictes :

### ❌ Ce qui est INTERDIT
- Toute logique serveur dans le frontend (pas de Next.js API Routes, pas de SSR, pas de Server Components)
- Appeler directement l'API Anthropic depuis le frontend (exposition de clés secrètes)
- Appeler l'API Slack depuis le frontend
- Utiliser `@supabase/ssr` ou tout package lié au rendu serveur
- Stocker `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN` ou `SUPABASE_SERVICE_ROLE_KEY` dans les variables d'environnement frontend

### ✅ Ce qui est AUTORISÉ côté frontend
- Appels à Supabase via `supabase-js` (clé `anon` uniquement)
- Appels aux **Supabase Edge Functions** (qui elles, détiennent les secrets)
- Authentification Supabase Auth
- Temps réel via Supabase Realtime

### ✅ Toute logique serveur → Supabase Edge Functions
| Besoin | Solution |
|--------|----------|
| Appel Claude API (qualification LLM) | Edge Function `qualify-with-llm` |
| Envoi de notifications Slack | Edge Function `send-slack-notification` |
| Réception webhook Phantombuster | Edge Function `process-phantombuster` |
| Import/sync Google Sheets | Edge Function `sync-google-sheets` |
| Calcul scoring complexe | Edge Function `score-contact` ou trigger SQL |

### Variables d'environnement

**Frontend (`.env`) — uniquement les clés publiques :**
```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Supabase Edge Functions (secrets Supabase Dashboard) — jamais dans le frontend :**
```
ANTHROPIC_API_KEY=<claude-api-key>
SLACK_BOT_TOKEN=<slack-bot-token>
SLACK_CHANNEL_ID=<slack-channel-id>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Pour définir les secrets Edge Functions :
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set SLACK_BOT_TOKEN=xoxb-...
```

---

## ⚙️ Règles de travail pour Claude Code

### Mode Plan obligatoire
Avant toute implémentation, **passe systématiquement en mode Plan** (`/plan`) pour :
- Les nouvelles fonctionnalités complexes (scoring, qualification LLM, sync Google Sheets)
- Toute modification de schéma Supabase
- Les intégrations tierces (Slack, Phantombuster)
- La mise en place de Edge Functions

Présente le plan à l'utilisateur et attends sa validation avant de coder.

### Utilisation des Skills
- Pour tout fichier `.xlsx` ou `.csv` (import Google Sheets) → utilise le skill `/mnt/skills/public/xlsx/SKILL.md`
- Pour tout fichier `.docx` (export rapport) → utilise le skill `/mnt/skills/public/docx/SKILL.md`
- Pour lire des fichiers uploadés → utilise le skill `/mnt/skills/public/file-reading/SKILL.md`
- Pour les interfaces frontend → utilise le skill `/mnt/skills/public/frontend-design/SKILL.md`

### Conventions de code
- TypeScript strict partout
- Nommage snake_case pour les colonnes Supabase, camelCase pour le TS
- Toujours typer les réponses Supabase avec les interfaces générées (`database.types.ts`)
- Utiliser uniquement `supabase-js` v2 avec la clé `anon` côté frontend — **jamais `@supabase/ssr`**
- Les variables d'environnement frontend sont préfixées `VITE_` et ne contiennent **aucun secret**
- Tout appel à une API tierce (Claude, Slack, Google) passe **obligatoirement** par une Edge Function
- Ne jamais créer de fichier `api/` ou de route serveur dans le projet frontend

---

## 🗄️ ÉTAPE 1 — Créer la base de données Supabase

### 1.1 Création du projet Supabase

**Instructions pour l'utilisateur :**
1. Va sur [supabase.com](https://supabase.com) → "New project"
2. Nomme le projet : `digilityx-leads`
3. Choisis une région proche (ex : `eu-west-1`)
4. Dans le fichier `.env` à la racine (les seules variables frontend autorisées) :

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

> ⚠️ Les autres secrets (ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY) ne vont **pas** dans ce fichier. Ils sont définis uniquement comme secrets Supabase Edge Functions (voir section contraintes).

### 1.2 Connexion MCP Supabase

**Instructions pour connecter le MCP Supabase à Claude Code :**

1. Dans ton terminal, installe le MCP Supabase :
```bash
npx @supabase/mcp-server-supabase@latest
```

2. Dans le fichier `.mcp.json` à la racine du projet, ajoute :
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<ton-access-token-supabase>",
        "SUPABASE_PROJECT_REF": "<ton-project-ref>"
      }
    }
  }
}
```

3. L'access token se trouve dans : Supabase Dashboard → Account → Access Tokens
4. Redémarre Claude Code pour activer le MCP

> ⚠️ Une fois connecté, utilise le MCP Supabase pour exécuter les migrations SQL directement depuis Claude Code.

### 1.3 Schéma SQL — Tables principales

Exécute ce script SQL via le MCP Supabase ou dans l'éditeur SQL Supabase :

```sql
-- =============================================
-- TABLE: entreprises
-- =============================================
CREATE TABLE IF NOT EXISTS entreprises (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name              TEXT NOT NULL,
  company_website           TEXT,
  company_domain            TEXT,
  company_id_linkedin       TEXT UNIQUE,
  company_employee_count    INTEGER,
  company_employee_range    TEXT,
  company_location          TEXT,
  company_typology          TEXT, -- Grand Groupe, ETI, PME, etc.
  secteur_digi              TEXT,
  icp                       BOOLEAN DEFAULT FALSE,
  scoring_icp               INTEGER DEFAULT 0,
  justification             TEXT,
  owner                     UUID REFERENCES membres_digilityx(id),
  tier                      TEXT CHECK (tier IN ('Tier 1', 'Tier 2', 'Tier 3', 'Hors-Tier')),
  statut_entreprise         TEXT CHECK (statut_entreprise IN (
                              'Qualifiée', 'A démarcher', 'En cours', 
                              'Bon Vivant', 'Actuellement client', 
                              'Deal en cours'
                            )),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLE: membres_digilityx
-- =============================================
CREATE TABLE IF NOT EXISTS membres_digilityx (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  full_name                 TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLE: account_managers
-- =============================================
CREATE TABLE IF NOT EXISTS account_managers (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  full_name                 TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLE: contacts
-- =============================================
CREATE TABLE IF NOT EXISTS contacts (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  linkedin_url              TEXT UNIQUE,
  first_name                TEXT,
  last_name                 TEXT,
  full_name                 TEXT GENERATED ALWAYS AS (
                              COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
                            ) STORED,
  position                  TEXT,
  email                     TEXT,
  location                  TEXT,
  company_name              TEXT,
  company_id_linkedin       TEXT,
  entreprise_id             UUID REFERENCES entreprises(id),
  years_in_position         NUMERIC,
  months_in_position        NUMERIC,
  years_in_company          NUMERIC,
  months_in_company         NUMERIC,
  id_url_linkedin           TEXT,

  -- Qualification LLM
  persona                   TEXT CHECK (persona IN (
                              'Dirigeant', 'Marketing', 'Produit', 
                              'Design', 'Commercial', 'Hors expertise Digi'
                            )),
  hierarchie                TEXT CHECK (hierarchie IN (
                              'COMEX', 'Directeur', 'Responsable', 'Opérationnel'
                            )),
  priorite                  TEXT CHECK (priorite IN ('Priorité 1', 'Priorité 2', 'Priorité 3')),

  -- Statut
  contact_digi              BOOLEAN DEFAULT FALSE,
  statut_contact            TEXT CHECK (statut_contact IN (
                              'A contacter', 'A surveiller', 
                              'En Discussion', 'Bon Vivant', 
                              'Pas intéressant', 'A relancer'
                            )),
  niveau_de_relation        TEXT CHECK (niveau_de_relation IN (
                              'Ami', 'Cercle familial', 'Ancien collègue', 
                              'Alumni', 'Partenaire business', 'Connaissance', 'Inconnu'
                            )),

  -- Scoring
  scoring                   INTEGER DEFAULT 0,
  nb_personnes_digi_relation INTEGER DEFAULT 0,
  query                     TEXT,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLE: notifications
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description_notification  TEXT,
  scoring_notification      INTEGER,
  first_name                TEXT,
  last_name                 TEXT,
  full_name                 TEXT GENERATED ALWAYS AS (
                              COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
                            ) STORED,
  position                  TEXT,
  company_name              TEXT,
  statut_notification       TEXT CHECK (statut_notification IN ('Envoyée', 'Lue', 'En attente')),
  contact_id                UUID REFERENCES contacts(id),
  entreprise_id             UUID REFERENCES entreprises(id),
  slack_message_ts          TEXT, -- timestamp message Slack pour mise à jour statut
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TRIGGERS: updated_at automatique
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_entreprises_updated_at
  BEFORE UPDATE ON entreprises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE entreprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE membres_digilityx ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Politique de lecture pour les utilisateurs authentifiés
CREATE POLICY "Authenticated users can read all"
  ON entreprises FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all"
  ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert"
  ON entreprises FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert"
  ON contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update"
  ON entreprises FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can update"
  ON contacts FOR UPDATE TO authenticated USING (true);
```

---

## 📊 ÉTAPE 2 — Import des données Google Sheets

### 2.1 Préparation des Google Sheets

L'utilisateur doit exporter (ou connecter via API) les feuilles suivantes en `.xlsx` ou `.csv` :
- `entreprises.xlsx`
- `contacts.xlsx`
- `membres_digilityx.xlsx`

### 2.2 Script d'import

> ⚠️ Avant d'implémenter, utilise le skill `/mnt/skills/public/xlsx/SKILL.md` pour lire les fichiers correctement.

Crée un script `scripts/import-google-sheets.ts` :

```typescript
// scripts/import-google-sheets.ts
// Importe les données des exports Google Sheets vers Supabase
// Usage: npx ts-node scripts/import-google-sheets.ts --file=entreprises.xlsx --table=entreprises

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function importSheet(filePath: string, tableName: string) {
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet)

  console.log(`📦 Import de ${rows.length} lignes vers ${tableName}...`)

  // Batch insert par chunks de 100
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from(tableName).upsert(chunk as any[])
    if (error) {
      console.error(`❌ Erreur à la ligne ${i}:`, error.message)
    } else {
      console.log(`✅ Chunk ${i / chunkSize + 1} importé`)
    }
  }
}

// Lancer l'import
const args = process.argv.slice(2)
const file = args.find(a => a.startsWith('--file='))?.split('=')[1]
const table = args.find(a => a.startsWith('--table='))?.split('=')[1]

if (!file || !table) {
  console.error('Usage: --file=fichier.xlsx --table=nom_table')
  process.exit(1)
}

importSheet(path.resolve(file), table)
```

### 2.3 Connexion directe Google Sheets (optionnel)

Si l'utilisateur préfère une sync temps réel via API Google Sheets, crée une Edge Function Supabase :

```typescript
// supabase/functions/sync-google-sheets/index.ts
// Sync automatique depuis Google Sheets API v4
// Déclencher manuellement ou via cron Supabase
```

---

## 🤖 ÉTAPE 3 — Qualification & Scoring par LLM

### 3.1 Qualification LLM des entreprises

Crée `lib/llm/qualify-company.ts` :

```typescript
// Qualifie une entreprise selon :
// - Typology_Taille
// - Secteur_Digi  
// - ICP_Typology x Secteur Digi
// - Scoring_ICP
// - Tier_Secteur Digi x Secteur x Typology
// - Statut_Tier

export async function qualifyCompany(company: Entreprise): Promise<QualificationResult>
```

**Prompt système à utiliser :**
```
Tu es un expert en qualification de comptes B2B pour Digilityx, une agence de design et digital.
Analyse l'entreprise fournie et retourne UNIQUEMENT un JSON avec :
{
  "icp": boolean,
  "scoring_icp": number (0-100),
  "tier": "Tier 1" | "Tier 2" | "Tier 3" | "Hors-Tier",
  "statut_entreprise": string,
  "justification": string (max 200 chars)
}

Critères ICP Digilityx :
- Secteurs cibles (16 valeurs, CHECK constraint en base) : Pharma/Santé, BAF, Éducation & Formation, Tourisme Hôtellerie & Loisirs, Technologie & IT, Prestations aux entreprises, Media & Communication, Recrutement, Commerce de Détail, Luxe, Services aux Consommateurs, Industrie & Énergie, Transports & Logistique, Immobilier & Construction, Public & Administrations, Concurrent
- Taille : ETI / Grand Groupe prioritaires
- Tier 1 : score ICP > 70
- Tier 2 : score ICP 40-70
- Tier 3 : score ICP < 40
```

### 3.2 Scoring des contacts

Implémente `lib/scoring/score-contact.ts` avec la logique suivante :

```typescript
// RÈGLES DE SCORING (max 100 points)

// 1. Priorité du compte entreprise (max 40 pts)
//    Tier 1 → 40 pts | Tier 2 → 25 pts | Tier 3 → 10 pts | Hors-Tier → 0 pt

// 2. Niveau de hiérarchie (max 20 pts)
//    COMEX → 20 pts | Directeur → 15 pts | Responsable → 10 pts | Opérationnel → 5 pts

// 3. Persona (max 15 pts)
//    Dirigeant, Marketing, Produit, Design, Commercial → 15 pts | Hors expertise → 0 pt

// 4. Niveau de relation (max 15 pts)
//    Ami → 15 pts | Cercle familial, Ancien collègue, Alumni, Partenaire → 10 pts
//    Connaissance → 5 pts | Inconnu → 0 pt

// 5. Nb personnes Digi en relation (max 10 pts)
//    0 → 0 pt | 1 → 3 pts | 2 → 6 pts | 3+ → 10 pts
```

### 3.3 Règles de statut automatique

```typescript
// Statut automatique "A surveiller" :
// → Entreprise Tier 1 ET Priorité contact Priorité 1 ou 2

// Statut automatique "A contacter" :
// → Lorsque le statut de la notification sur le contact = "Envoyée"
```

---

## 🔔 ÉTAPE 4 — Système de notifications Slack

### 4.1 Déclenchement

Une notification est créée et envoyée sur Slack quand :
- Le scoring d'un contact > 7 (après analyse Phantombuster x LLM)
- Via une Edge Function Supabase ou un webhook

### 4.2 Edge Function : `send-slack-notification`

```typescript
// supabase/functions/send-slack-notification/index.ts

// Payload Slack :
// - Nom du contact
// - Entreprise
// - Poste
// - Score
// - Lien LinkedIn
// - Bouton "Marquer comme lu" (emoji réaction)

// Pour mettre à jour le statut notification :
// → Écouter les réactions emoji Slack via Slack Events API
// → Mettre à jour statut_notification dans Supabase
```

### 4.3 Connexion Slack Events API (pour lecture des emojis)

```
Slack App Settings → Event Subscriptions → 
  URL: https://<project-ref>.supabase.co/functions/v1/slack-events
  Events: reaction_added, reaction_removed
```

---

## 🖥️ ÉTAPE 5 — Interface / Vues

### Vues à construire (selon le MCD) :

| Vue | Description |
|-----|-------------|
| `/dashboard` | KPIs : nb entreprises à démarcher, démarchées, deals en cours, ventilation par statut/owner |
| `/entreprises` | Liste filtrée par tier, statut, owner, secteur |
| `/contacts` | Liste avec scoring, statut, qualification LLM |
| `/notifications` | Centre de notifications avec statut Slack |
| `/import` | Upload Google Sheets / déclenchement Phantombuster |

### Composants prioritaires :

```
components/
  entreprises/
    EntrepriseCard.tsx
    EntrepriseTable.tsx
    QualificationBadge.tsx
    TierBadge.tsx
  contacts/
    ContactCard.tsx
    ContactScoreBar.tsx
    StatusDropdown.tsx
  notifications/
    NotificationFeed.tsx
    SlackStatusBadge.tsx
  dashboard/
    KPICard.tsx
    StatutRepartitionChart.tsx
    OwnerPipelineView.tsx
```

> ⚠️ Pour les composants visuels, utilise le skill `/mnt/skills/public/frontend-design/SKILL.md`

---

## 🔄 ÉTAPE 6 — Flux Phantombuster → App

```
1. Phantombuster scrape les profils LinkedIn des contacts "A surveiller"
2. Résultat JSON envoyé en webhook → Edge Function `process-phantombuster`
3. Edge Function :
   a. Parse le JSON Phantombuster
   b. Appelle Claude API pour qualifier/scorer l'activité LinkedIn
   c. Met à jour le scoring du contact dans Supabase
   d. Si score > 7 → crée une notification → envoie sur Slack
4. L'interface affiche la notification en temps réel (Supabase Realtime)
```

### Structure du webhook Phantombuster :

```typescript
// Phantombuster envoie les résultats vers une Edge Function (pas une API route frontend) :
// POST https://<project-ref>.supabase.co/functions/v1/process-phantombuster
// Body: { contactLinkedinUrl, recentActivity, connections, ... }
// → L'Edge Function mappe les données vers la table contacts
// → Lance la qualification LLM via Claude API (secret côté Edge Function)
// → Met à jour le scoring et déclenche la notification Slack si score > 7
```

---

## 📁 Structure du projet

```
digilityx-leads/
├── src/
│   ├── pages/           # Vues principales (Dashboard, Entreprises, Contacts…)
│   ├── components/      # Composants React réutilisables
│   ├── lib/
│   │   ├── supabase.ts  # Client Supabase (anon key uniquement)
│   │   └── types.ts     # Types générés depuis database.types.ts
│   └── main.tsx
├── supabase/
│   ├── functions/       # Edge Functions (LLM, Slack, Phantombuster, Sheets)
│   └── migrations/      # SQL migrations
├── scripts/
│   └── import-google-sheets.ts
├── .env                 # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY uniquement
├── .env.example         # Template sans valeurs secrètes
├── .github/
│   └── workflows/
│       └── deploy.yml   # GitHub Actions → GitHub Pages
├── vite.config.ts       # base: '/<nom-du-repo>/'
├── .mcp.json            # Config MCP Supabase
└── CLAUDE.md            # Ce fichier
```

### `vite.config.ts` — configuration GitHub Pages

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/<nom-du-repo-github>/', // ← obligatoire pour GitHub Pages
})
```

### `.github/workflows/deploy.yml` — déploiement automatique

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

> ⚠️ Ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les **Secrets GitHub** du repository (Settings → Secrets and variables → Actions). Ces deux valeurs sont publiques par nature (clé anon), mais c'est une bonne pratique de les gérer via secrets GitHub.

---

## ✅ Ordre d'implémentation recommandé

1. [ ] Créer le projet Supabase + configurer `.env` (clés publiques uniquement)
2. [ ] Connecter le MCP Supabase dans `.mcp.json`
3. [ ] Exécuter les migrations SQL (schéma complet)
4. [ ] Définir les secrets Supabase (Anthropic, Slack) via `supabase secrets set`
5. [ ] Importer les données Google Sheets via le script d'import
6. [ ] Implémenter les Edge Functions (LLM, Slack, Phantombuster)
7. [ ] Implémenter le scoring dans une Edge Function ou trigger SQL
8. [ ] Construire les vues frontend (dashboard → contacts → notifications)
9. [ ] Configurer `vite.config.ts` avec le bon `base` pour GitHub Pages
10. [ ] Configurer le workflow GitHub Actions (`deploy.yml`)
11. [ ] Activer GitHub Pages sur la branche `gh-pages` (Settings → Pages)
12. [ ] Configurer Slack Events API avec l'URL de l'Edge Function
13. [ ] Tests end-to-end du flux Phantombuster → Score → Slack

---

## ⚡ Commandes utiles

```bash
# Démarrer le projet en local
npm run dev

# Build statique (vérifier avant push)
npm run build && npm run preview

# Générer les types Supabase
npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

# Lancer les migrations
npx supabase db push

# Définir les secrets Edge Functions (jamais dans .env frontend)
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set SLACK_BOT_TOKEN=xoxb-...
npx supabase secrets set SLACK_CHANNEL_ID=C...

# Importer les données Google Sheets
npx ts-node scripts/import-google-sheets.ts --file=data/entreprises.xlsx --table=entreprises
npx ts-node scripts/import-google-sheets.ts --file=data/contacts.xlsx --table=contacts

# Déployer les Edge Functions
npx supabase functions deploy qualify-with-llm
npx supabase functions deploy send-slack-notification
npx supabase functions deploy process-phantombuster
npx supabase functions deploy sync-google-sheets
```
