-- Denormalize contacts.scoring into contacts_membres_relations so the scoped
-- contacts RPCs can ORDER BY scoring on a covering composite index, instead of
-- joining 2500 contacts row-by-row to read scoring just to top-N sort.
-- Measured: get_contacts_for_membre 1138ms -> 121ms for a member with 2500 relations.

-- 1) Add the column (idempotent: noop if rerun).
ALTER TABLE contacts_membres_relations
  ADD COLUMN IF NOT EXISTS scoring int DEFAULT 0;

-- 2) Backfill from contacts.
UPDATE contacts_membres_relations rel
SET scoring = c.scoring
FROM contacts c
WHERE rel.contact_id = c.id
  AND rel.scoring IS DISTINCT FROM c.scoring;

-- 3) Composite index that drives the scoped list page: filter by membre,
-- pre-sorted by scoring so LIMIT 50 reads only 50 entries.
CREATE INDEX IF NOT EXISTS idx_cmr_membre_scoring
  ON contacts_membres_relations (membre_id, scoring DESC);

-- 4) Keep scoring in sync when contacts.scoring changes.
CREATE OR REPLACE FUNCTION sync_cmr_scoring_from_contact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scoring IS DISTINCT FROM OLD.scoring THEN
    UPDATE contacts_membres_relations
       SET scoring = NEW.scoring
     WHERE contact_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cmr_scoring ON contacts;
CREATE TRIGGER trg_sync_cmr_scoring
  AFTER UPDATE OF scoring ON contacts
  FOR EACH ROW EXECUTE FUNCTION sync_cmr_scoring_from_contact();

-- 5) Populate scoring on new relations from the contact's current scoring.
CREATE OR REPLACE FUNCTION cmr_set_scoring_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scoring IS NULL OR NEW.scoring = 0 THEN
    SELECT scoring INTO NEW.scoring FROM contacts WHERE id = NEW.contact_id;
    NEW.scoring := COALESCE(NEW.scoring, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmr_set_scoring ON contacts_membres_relations;
CREATE TRIGGER trg_cmr_set_scoring
  BEFORE INSERT ON contacts_membres_relations
  FOR EACH ROW EXECUTE FUNCTION cmr_set_scoring_on_insert();

-- 6) Rewrite get_contacts_for_membre. The previous version used a
-- MATERIALIZED CTE which forced reading all 2500 contacts before the top-N
-- sort. The new version drives from the (membre_id, scoring DESC) index so
-- the LIMIT can early-terminate after just 50 PK lookups when no filters
-- reduce the result set.
CREATE OR REPLACE FUNCTION get_contacts_for_membre(
  p_membre_id uuid,
  p_tier text DEFAULT NULL,
  p_statut text DEFAULT NULL,
  p_hierarchie text DEFAULT NULL,
  p_persona text DEFAULT NULL,
  p_entreprise_link text DEFAULT NULL,
  p_entreprise_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_order_asc boolean DEFAULT false,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  "position" text,
  company_name text,
  location text,
  linkedin_url text,
  id_url_linkedin text,
  email text,
  persona text,
  hierarchie text,
  statut_contact text,
  niveau_de_relation text,
  scoring int,
  nb_personnes_digi_relation int,
  contact_digi boolean,
  entreprise_id uuid,
  owner_membre_id uuid,
  tier text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id, c.first_name, c.last_name, c."position", c.company_name, c.location,
    c.linkedin_url, c.id_url_linkedin, c.email, c.persona, c.hierarchie,
    c.statut_contact, rel.niveau_de_relation, c.scoring,
    c.nb_personnes_digi_relation, c.contact_digi, c.entreprise_id,
    c.owner_membre_id, e.tier
  FROM contacts_membres_relations rel
  JOIN contacts c ON c.id = rel.contact_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  WHERE rel.membre_id = p_membre_id
    AND (p_tier IS NULL OR e.tier = p_tier)
    AND (p_statut IS NULL OR c.statut_contact = p_statut)
    AND (p_hierarchie IS NULL OR c.hierarchie = p_hierarchie)
    AND (p_persona IS NULL OR c.persona = p_persona)
    AND (p_entreprise_id IS NULL OR c.entreprise_id = p_entreprise_id)
    AND (
      p_entreprise_link IS NULL
      OR (p_entreprise_link = 'sans' AND c.company_name IS NULL)
      OR (p_entreprise_link = 'avec' AND c.company_name IS NOT NULL)
      OR (p_entreprise_link = 'non-rattache' AND c.company_name IS NOT NULL AND c.entreprise_id IS NULL)
    )
    AND (
      p_search IS NULL
      OR c.first_name ILIKE '%' || p_search || '%'
      OR c.last_name  ILIKE '%' || p_search || '%'
      OR c.company_name ILIKE '%' || p_search || '%'
    )
  ORDER BY
    CASE WHEN p_order_asc THEN rel.scoring END ASC,
    CASE WHEN NOT p_order_asc THEN rel.scoring END DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

-- 7) Rewrite count_contacts_for_membre without the materialized CTE so the
-- planner can use the parallel index-only scan path on contacts_membres_relations.
CREATE OR REPLACE FUNCTION count_contacts_for_membre(
  p_membre_id uuid,
  p_tier text DEFAULT NULL,
  p_statut text DEFAULT NULL,
  p_hierarchie text DEFAULT NULL,
  p_persona text DEFAULT NULL,
  p_entreprise_link text DEFAULT NULL,
  p_entreprise_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::bigint
  FROM contacts_membres_relations rel
  JOIN contacts c ON c.id = rel.contact_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  WHERE rel.membre_id = p_membre_id
    AND (p_tier IS NULL OR e.tier = p_tier)
    AND (p_statut IS NULL OR c.statut_contact = p_statut)
    AND (p_hierarchie IS NULL OR c.hierarchie = p_hierarchie)
    AND (p_persona IS NULL OR c.persona = p_persona)
    AND (p_entreprise_id IS NULL OR c.entreprise_id = p_entreprise_id)
    AND (
      p_entreprise_link IS NULL
      OR (p_entreprise_link = 'sans' AND c.company_name IS NULL)
      OR (p_entreprise_link = 'avec' AND c.company_name IS NOT NULL)
      OR (p_entreprise_link = 'non-rattache' AND c.company_name IS NOT NULL AND c.entreprise_id IS NULL)
    )
    AND (
      p_search IS NULL
      OR c.first_name ILIKE '%' || p_search || '%'
      OR c.last_name  ILIKE '%' || p_search || '%'
      OR c.company_name ILIKE '%' || p_search || '%'
    );
$$;

GRANT EXECUTE ON FUNCTION get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, boolean, int, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION count_contacts_for_membre(uuid, text, text, text, text, text, uuid, text) TO authenticated, anon;
