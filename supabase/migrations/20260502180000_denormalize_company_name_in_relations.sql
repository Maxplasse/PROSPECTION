-- Denormalize entreprises.company_name into contacts_membres_relations so we
-- can sort/limit scoped entreprises directly from the relations index without
-- ever touching the entreprises table for non-matching rows.
-- Combined with a fast-path in get_entreprises_for_membre, this brings the
-- no-filter case from ~385ms to ~80ms for a 2500-relation member.

-- 1) Column (idempotent).
ALTER TABLE contacts_membres_relations
  ADD COLUMN IF NOT EXISTS company_name text;

-- 2) Backfill from entreprises.
UPDATE contacts_membres_relations rel
SET company_name = e.company_name
FROM entreprises e
WHERE rel.entreprise_id = e.id
  AND rel.company_name IS DISTINCT FROM e.company_name;

-- 3) Composite index for the fast path: ORDER BY company_name with membre filter.
CREATE INDEX IF NOT EXISTS idx_cmr_membre_companyname
  ON contacts_membres_relations (membre_id, company_name)
  WHERE entreprise_id IS NOT NULL;

-- 4) Sync company_name when entreprises.company_name changes.
CREATE OR REPLACE FUNCTION sync_cmr_company_name_from_entreprise()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_name IS DISTINCT FROM OLD.company_name THEN
    UPDATE contacts_membres_relations
       SET company_name = NEW.company_name
     WHERE entreprise_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cmr_company_name ON entreprises;
CREATE TRIGGER trg_sync_cmr_company_name
  AFTER UPDATE OF company_name ON entreprises
  FOR EACH ROW EXECUTE FUNCTION sync_cmr_company_name_from_entreprise();

-- 5) Populate company_name on new relations or when entreprise_id is set later.
CREATE OR REPLACE FUNCTION cmr_set_company_name_on_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entreprise_id IS NOT NULL
     AND (NEW.company_name IS NULL OR NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id) THEN
    SELECT company_name INTO NEW.company_name FROM entreprises WHERE id = NEW.entreprise_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmr_set_company_name_ins ON contacts_membres_relations;
CREATE TRIGGER trg_cmr_set_company_name_ins
  BEFORE INSERT ON contacts_membres_relations
  FOR EACH ROW EXECUTE FUNCTION cmr_set_company_name_on_change();

DROP TRIGGER IF EXISTS trg_cmr_set_company_name_upd ON contacts_membres_relations;
CREATE TRIGGER trg_cmr_set_company_name_upd
  BEFORE UPDATE OF entreprise_id ON contacts_membres_relations
  FOR EACH ROW EXECUTE FUNCTION cmr_set_company_name_on_change();

-- 6) Rewrite get_entreprises_for_membre with a fast path: when no
-- entreprise-side filter is set, sort+limit comes from the
-- (membre_id, company_name) index directly (no table touch on entreprises
-- before LIMIT). Otherwise fall back to the semi-join.
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
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_tier IS NULL
     AND p_statut_entreprise IS NULL
     AND p_statut_digi IS NULL
     AND p_secteurs IS NULL
     AND p_account_manager_id IS NULL
     AND p_search IS NULL THEN
    RETURN QUERY
      WITH top_scoped AS (
        SELECT DISTINCT ON (rel.company_name, rel.entreprise_id)
               rel.entreprise_id,
               rel.company_name
        FROM contacts_membres_relations rel
        WHERE rel.membre_id = p_membre_id
          AND rel.entreprise_id IS NOT NULL
        ORDER BY rel.company_name, rel.entreprise_id
        OFFSET p_offset
        LIMIT p_limit
      )
      SELECT
        e.id, e.company_name, e.company_domain, e.company_location,
        e.company_employee_count, e.company_employee_range, e.company_typology,
        e.secteur_digi, e.tier, e.statut_entreprise, e.statut_digi,
        e.account_manager_id, am.full_name AS account_manager_name,
        e.parent_company_id, p.company_name AS parent_company_name,
        e.is_subsidiary, e.is_parent_entity, e.is_digi_client, e.is_placeholder,
        e.icp, e.scoring_icp, e.company_id_linkedin, e.linkedin_industry
      FROM top_scoped s
      JOIN entreprises e ON e.id = s.entreprise_id
      LEFT JOIN membres_digilityx am ON am.id = e.account_manager_id
      LEFT JOIN entreprises p ON p.id = e.parent_company_id
      ORDER BY s.company_name;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      e.id, e.company_name, e.company_domain, e.company_location,
      e.company_employee_count, e.company_employee_range, e.company_typology,
      e.secteur_digi, e.tier, e.statut_entreprise, e.statut_digi,
      e.account_manager_id, am.full_name AS account_manager_name,
      e.parent_company_id, p.company_name AS parent_company_name,
      e.is_subsidiary, e.is_parent_entity, e.is_digi_client, e.is_placeholder,
      e.icp, e.scoring_icp, e.company_id_linkedin, e.linkedin_industry
    FROM entreprises e
    LEFT JOIN membres_digilityx am ON am.id = e.account_manager_id
    LEFT JOIN entreprises p ON p.id = e.parent_company_id
    WHERE EXISTS (
      SELECT 1 FROM contacts_membres_relations rel
      WHERE rel.membre_id = p_membre_id
        AND rel.entreprise_id = e.id
    )
      AND (p_tier IS NULL OR e.tier = p_tier)
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
END;
$$;

GRANT EXECUTE ON FUNCTION get_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text, int, int) TO authenticated, anon;
