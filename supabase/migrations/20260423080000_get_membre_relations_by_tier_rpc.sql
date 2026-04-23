-- Aggregate count of contacts (via contacts_membres_relations) per membre per tier.
-- Used by the "Vue Tier" tab in /membres to visualize each Digi's network by tier.

CREATE OR REPLACE FUNCTION get_membre_relations_by_tier()
RETURNS TABLE(membre_id uuid, tier text, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.membre_id,
    COALESCE(e.tier, 'Sans tier') AS tier,
    COUNT(*)::bigint AS cnt
  FROM contacts_membres_relations r
  JOIN contacts c ON c.id = r.contact_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  GROUP BY r.membre_id, COALESCE(e.tier, 'Sans tier');
$$;

GRANT EXECUTE ON FUNCTION get_membre_relations_by_tier() TO authenticated, anon;
