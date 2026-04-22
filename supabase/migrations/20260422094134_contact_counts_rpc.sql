-- Aggregated contact counts for a list of entreprise ids.
-- Replaces N+1 per-entreprise count queries from the Contacts page.

CREATE OR REPLACE FUNCTION contact_counts_for_entreprises(ids uuid[])
RETURNS TABLE(entreprise_id uuid, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT entreprise_id, COUNT(*)::bigint
  FROM contacts
  WHERE entreprise_id = ANY(ids)
  GROUP BY entreprise_id;
$$;

GRANT EXECUTE ON FUNCTION contact_counts_for_entreprises(uuid[]) TO authenticated, anon;
