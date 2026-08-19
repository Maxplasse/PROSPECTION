-- get_membre_tier1_unqualified_count was timing out because the WHERE on
-- niveau_de_relation forced a sequential scan over the full relation table.
-- A partial index covering only unqualified rows makes the filter instant.

CREATE INDEX IF NOT EXISTS idx_cmr_unqualified_relations
  ON contacts_membres_relations(membre_id, contact_id)
  WHERE niveau_de_relation IS NULL OR niveau_de_relation = 'Non renseigné';

-- Rewrite: INNER JOIN on entreprises (safe since e.tier = 'Tier 1' already
-- excludes NULL-tier rows), and drop the COALESCE to let the planner use
-- the index on entreprises.tier if one exists.
CREATE OR REPLACE FUNCTION get_membre_tier1_unqualified_count()
RETURNS TABLE(membre_id uuid, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT r.membre_id, COUNT(*)::bigint AS cnt
  FROM contacts_membres_relations r
  JOIN contacts c ON c.id = r.contact_id
  JOIN entreprises e ON e.id = c.entreprise_id
  WHERE e.tier = 'Tier 1'
    AND (r.niveau_de_relation IS NULL OR r.niveau_de_relation = 'Non renseigné')
  GROUP BY r.membre_id;
$$;

ALTER FUNCTION get_membre_tier1_unqualified_count()
  SECURITY DEFINER SET search_path = public, pg_temp;
