-- detect-parent-subsidiaries.sql
--
-- Détecte les entreprises qui sont probablement filiales d'un groupe
-- déjà présent dans la table `entreprises`.
--
-- Critères :
--  - Parent = company_typology 'Grand Groupe' OU is_parent_entity = TRUE
--  - Parent en 2+ mots (pour éviter les matches sur des noms génériques)
--  - Parent.name >= 5 caractères
--  - Enfant non déjà rattaché (parent_company_id IS NULL)
--  - Match sur word-boundary : début, milieu, fin, ou "Groupe X"
--
-- Usage :
--  1. Exécuter cette requête (Supabase SQL editor ou MCP).
--  2. Revoir les candidats (colonne `parent_name` -> `child_name`).
--  3. Pour appliquer sur un parent validé, voir le bloc "APPLIQUER" en bas.

WITH candidates AS (
  SELECT
    parent.id            AS parent_id,
    parent.company_name  AS parent_name,
    parent.is_parent_entity AS parent_flagged,
    parent.company_typology AS parent_typology,
    child.id             AS child_id,
    child.company_name   AS child_name,
    child.company_typology AS child_typology,
    child.secteur_digi   AS child_secteur,
    ROW_NUMBER() OVER (
      PARTITION BY child.id ORDER BY LENGTH(parent.company_name) DESC
    ) AS rn
  FROM entreprises parent
  JOIN entreprises child
    ON child.id != parent.id
   AND child.parent_company_id IS NULL
   AND (
         child.company_name ILIKE parent.company_name || ' %'
      OR child.company_name ILIKE '% ' || parent.company_name || ' %'
      OR child.company_name ILIKE '% ' || parent.company_name
      OR child.company_name ILIKE 'Groupe ' || parent.company_name || '%'
      OR child.company_name ILIKE parent.company_name || ', %'
   )
  WHERE (parent.company_typology = 'Grand Groupe' OR parent.is_parent_entity)
    AND LENGTH(parent.company_name) >= 5
    AND (parent.company_name ~ ' ' OR parent.is_parent_entity)
    AND LOWER(parent.company_name) NOT IN (
      'impact', 'board', 'square', 'pulse', 'comet', 'bright',
      'independent', 'indépendant', 'self-employed', 'self employed',
      'freelance', 'consultant', 'other', 'n/a', 'beyond',
      'immersive', 'positive', 'private bank'
    )
)
SELECT
  parent_name,
  parent_typology,
  child_name,
  child_typology,
  child_secteur,
  parent_id,
  child_id
FROM candidates
WHERE rn = 1
ORDER BY parent_name, child_name;

-- ───────────────────────────────────────────────────────────────
-- DÉTECTION DES MAUVAIS PARENTS (cluster mis-parented)
-- ───────────────────────────────────────────────────────────────
-- Pour chaque is_parent_entity, compare son score au meilleur candidat
-- dans son cluster (filiales courantes + entités matchant le stem).
-- Règle de score :
--   +10 si nom commence par 'Groupe '
--   +3  si company_typology = 'Grand Groupe'
--   +5  si nom == stem (cluster match exact)
--   +min(5, employees / 10_000)
-- ATTENTION : bruité. À utiliser comme signal, revue manuelle obligatoire.

/*
WITH parents AS (
  SELECT id, company_name, company_typology, company_employee_count,
    (CASE WHEN company_name ILIKE 'Groupe %' THEN 10 ELSE 0 END)
    + (CASE WHEN company_typology = 'Grand Groupe' THEN 3 ELSE 0 END)
    + LEAST(5, (COALESCE(company_employee_count, 0) / 10000)::int)
    AS current_score
  FROM entreprises
  WHERE is_parent_entity
),
children_prefix AS (
  SELECT p.id AS parent_id, p.company_name AS parent_name, p.current_score,
    array_to_string((string_to_array(trim(c.company_name), ' '))[1:2], ' ') AS child_prefix
  FROM parents p
  JOIN entreprises c ON c.parent_company_id = p.id
),
stems AS (
  SELECT parent_id, parent_name, current_score,
    MODE() WITHIN GROUP (ORDER BY child_prefix) AS stem,
    COUNT(*) AS nb_children
  FROM children_prefix
  GROUP BY parent_id, parent_name, current_score
)
SELECT s.parent_name AS current_parent, s.current_score AS cur_score,
       s.nb_children, s.stem,
       e.company_name AS better_candidate,
       (CASE WHEN e.company_name ILIKE 'Groupe %' THEN 10 ELSE 0 END)
       + (CASE WHEN e.company_typology = 'Grand Groupe' THEN 3 ELSE 0 END)
       + (CASE WHEN e.company_name = s.stem THEN 5 ELSE 0 END)
       + LEAST(5, (COALESCE(e.company_employee_count, 0) / 10000)::int) AS cand_score
FROM stems s
JOIN entreprises e ON (
     e.company_name = s.stem
  OR e.company_name ILIKE s.stem || ' %'
  OR e.company_name ILIKE 'Groupe ' || s.stem || '%'
)
WHERE e.id != s.parent_id
  AND ((CASE WHEN e.company_name ILIKE 'Groupe %' THEN 10 ELSE 0 END)
       + (CASE WHEN e.company_typology = 'Grand Groupe' THEN 3 ELSE 0 END)
       + (CASE WHEN e.company_name = s.stem THEN 5 ELSE 0 END)
       + LEAST(5, (COALESCE(e.company_employee_count, 0) / 10000)::int)) > s.current_score
ORDER BY s.nb_children DESC, s.parent_name;
*/

-- ───────────────────────────────────────────────────────────────
-- APPLIQUER pour UN parent validé (remplacer le nom) :
-- ───────────────────────────────────────────────────────────────
/*
WITH parent AS (
  SELECT id FROM entreprises
  WHERE company_name = 'BNP Paribas'  -- <-- à remplacer
),
targets AS (
  SELECT child.id
  FROM entreprises child, parent
  WHERE child.id != parent.id
    AND child.parent_company_id IS NULL
    AND (
         child.company_name ILIKE (SELECT company_name FROM entreprises WHERE id = parent.id) || ' %'
      OR child.company_name ILIKE '% ' || (SELECT company_name FROM entreprises WHERE id = parent.id) || ' %'
      OR child.company_name ILIKE '% ' || (SELECT company_name FROM entreprises WHERE id = parent.id)
      OR child.company_name ILIKE 'Groupe ' || (SELECT company_name FROM entreprises WHERE id = parent.id) || '%'
      OR child.company_name ILIKE (SELECT company_name FROM entreprises WHERE id = parent.id) || ', %'
    )
)
UPDATE entreprises
   SET is_parent_entity = TRUE
 WHERE id = (SELECT id FROM parent);

UPDATE entreprises
   SET parent_company_id = (SELECT id FROM parent),
       is_subsidiary = TRUE
 WHERE id IN (SELECT id FROM targets);
*/
