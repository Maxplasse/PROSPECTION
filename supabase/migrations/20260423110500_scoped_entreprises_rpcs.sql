-- Server-side paginated + filtered list and count of entreprises scoped to
-- the set of entreprises linked to the membre's contacts.

CREATE OR REPLACE FUNCTION get_entreprises_for_membre(
  p_membre_id uuid,
  p_tier text DEFAULT NULL,
  p_statut_entreprise text DEFAULT NULL,
  p_statut_digi text DEFAULT NULL,
  p_secteurs text[] DEFAULT NULL,
  p_include_null_secteur boolean DEFAULT false,
  p_account_manager_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  company_name text,
  company_domain text,
  company_location text,
  company_employee_count int,
  company_employee_range text,
  company_typology text,
  secteur_digi text,
  tier text,
  statut_entreprise text,
  statut_digi text,
  account_manager_id uuid,
  account_manager_name text,
  parent_company_id uuid,
  parent_company_name text,
  is_subsidiary boolean,
  is_parent_entity boolean,
  is_digi_client boolean,
  is_placeholder boolean,
  icp boolean,
  scoring_icp int,
  company_id_linkedin text,
  linkedin_industry text
)
LANGUAGE sql
STABLE
AS $$
  WITH scoped AS (
    SELECT DISTINCT c.entreprise_id AS ent_id
    FROM contacts c
    JOIN contacts_membres_relations r ON r.contact_id = c.id
    WHERE r.membre_id = p_membre_id
      AND c.entreprise_id IS NOT NULL
  )
  SELECT
    e.id, e.company_name, e.company_domain, e.company_location,
    e.company_employee_count, e.company_employee_range, e.company_typology,
    e.secteur_digi, e.tier, e.statut_entreprise, e.statut_digi,
    e.account_manager_id, am.full_name AS account_manager_name,
    e.parent_company_id, p.company_name AS parent_company_name,
    e.is_subsidiary, e.is_parent_entity, e.is_digi_client, e.is_placeholder,
    e.icp, e.scoring_icp, e.company_id_linkedin, e.linkedin_industry
  FROM entreprises e
  JOIN scoped s ON s.ent_id = e.id
  LEFT JOIN membres_digilityx am ON am.id = e.account_manager_id
  LEFT JOIN entreprises p ON p.id = e.parent_company_id
  WHERE (p_tier IS NULL OR e.tier = p_tier)
    AND (p_statut_entreprise IS NULL OR e.statut_entreprise = p_statut_entreprise)
    AND (p_statut_digi IS NULL OR e.statut_digi = p_statut_digi)
    AND (p_account_manager_id IS NULL OR e.account_manager_id = p_account_manager_id)
    AND (
      p_secteurs IS NULL
      OR (p_include_null_secteur AND e.secteur_digi IS NULL)
      OR e.secteur_digi = ANY(p_secteurs)
    )
    AND (p_search IS NULL OR e.company_name ILIKE '%' || p_search || '%')
  ORDER BY e.company_name ASC
  OFFSET p_offset
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION count_entreprises_for_membre(
  p_membre_id uuid,
  p_tier text DEFAULT NULL,
  p_statut_entreprise text DEFAULT NULL,
  p_statut_digi text DEFAULT NULL,
  p_secteurs text[] DEFAULT NULL,
  p_include_null_secteur boolean DEFAULT false,
  p_account_manager_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH scoped AS (
    SELECT DISTINCT c.entreprise_id AS ent_id
    FROM contacts c
    JOIN contacts_membres_relations r ON r.contact_id = c.id
    WHERE r.membre_id = p_membre_id
      AND c.entreprise_id IS NOT NULL
  )
  SELECT COUNT(*)::bigint
  FROM entreprises e
  JOIN scoped s ON s.ent_id = e.id
  WHERE (p_tier IS NULL OR e.tier = p_tier)
    AND (p_statut_entreprise IS NULL OR e.statut_entreprise = p_statut_entreprise)
    AND (p_statut_digi IS NULL OR e.statut_digi = p_statut_digi)
    AND (p_account_manager_id IS NULL OR e.account_manager_id = p_account_manager_id)
    AND (
      p_secteurs IS NULL
      OR (p_include_null_secteur AND e.secteur_digi IS NULL)
      OR e.secteur_digi = ANY(p_secteurs)
    )
    AND (p_search IS NULL OR e.company_name ILIKE '%' || p_search || '%');
$$;

GRANT EXECUTE ON FUNCTION get_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text, int, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION count_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text) TO authenticated, anon;
