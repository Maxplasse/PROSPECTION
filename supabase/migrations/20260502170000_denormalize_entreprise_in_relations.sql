-- Denormalize contacts.entreprise_id into contacts_membres_relations so the
-- scoped entreprises RPCs (used by non-admin members) can drive from a
-- (membre_id, entreprise_id) index instead of looking up 2500 contacts then
-- seq-scanning 16k entreprises. Measured: get_entreprises_for_membre
-- 1985ms -> 361ms for a member with 2500 relations.

-- 1) Column (idempotent).
ALTER TABLE contacts_membres_relations
  ADD COLUMN IF NOT EXISTS entreprise_id uuid;

-- 2) Backfill from contacts.
UPDATE contacts_membres_relations rel
SET entreprise_id = c.entreprise_id
FROM contacts c
WHERE rel.contact_id = c.id
  AND rel.entreprise_id IS DISTINCT FROM c.entreprise_id;

-- 3) Composite partial index for scoped entreprises lookups.
CREATE INDEX IF NOT EXISTS idx_cmr_membre_entreprise
  ON contacts_membres_relations (membre_id, entreprise_id)
  WHERE entreprise_id IS NOT NULL;

-- 4) Sync entreprise_id when contacts.entreprise_id changes (rare but possible
-- when admin re-links a contact).
CREATE OR REPLACE FUNCTION sync_cmr_entreprise_from_contact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id THEN
    UPDATE contacts_membres_relations
       SET entreprise_id = NEW.entreprise_id
     WHERE contact_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cmr_entreprise ON contacts;
CREATE TRIGGER trg_sync_cmr_entreprise
  AFTER UPDATE OF entreprise_id ON contacts
  FOR EACH ROW EXECUTE FUNCTION sync_cmr_entreprise_from_contact();

-- 5) Populate entreprise_id on new relations from the contact.
CREATE OR REPLACE FUNCTION cmr_set_entreprise_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entreprise_id IS NULL THEN
    SELECT entreprise_id INTO NEW.entreprise_id FROM contacts WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmr_set_entreprise ON contacts_membres_relations;
CREATE TRIGGER trg_cmr_set_entreprise
  BEFORE INSERT ON contacts_membres_relations
  FOR EACH ROW EXECUTE FUNCTION cmr_set_entreprise_on_insert();

-- 6) Rewrite get_entreprises_for_membre as a semi-join driven by the
-- entreprises.company_name index. The planner walks company_name in order
-- and probes the (membre_id, entreprise_id) index for each candidate, so
-- LIMIT 50 only needs ~500 candidates (vs full 16k seq scan before).
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
$$;

-- 7) Rewrite count_entreprises_for_membre. Without filters, count distinct
-- entreprise_id values directly from the (membre_id, entreprise_id) index
-- without touching entreprises at all (~50ms vs ~1500ms before).
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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result bigint;
BEGIN
  IF p_tier IS NULL
     AND p_statut_entreprise IS NULL
     AND p_statut_digi IS NULL
     AND p_secteurs IS NULL
     AND p_account_manager_id IS NULL
     AND p_search IS NULL THEN
    SELECT COUNT(DISTINCT entreprise_id) INTO result
    FROM contacts_membres_relations
    WHERE membre_id = p_membre_id
      AND entreprise_id IS NOT NULL;
    RETURN result;
  END IF;

  SELECT COUNT(*) INTO result
  FROM entreprises e
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
    AND (p_search IS NULL OR e.company_name ILIKE '%' || p_search || '%');
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text, int, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION count_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text) TO authenticated, anon;
