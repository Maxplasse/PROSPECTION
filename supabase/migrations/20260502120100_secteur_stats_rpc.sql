-- Aggregated secteur stats RPC.
-- Replaces a paginated client loop that fetched all 16k entreprises in 1000-row batches
-- just to GROUP BY secteur_digi in JS.

CREATE OR REPLACE FUNCTION get_secteur_stats()
RETURNS TABLE(secteur_digi text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(secteur_digi, 'Non classé') AS secteur_digi,
         COUNT(*)::bigint                     AS count
  FROM entreprises
  GROUP BY COALESCE(secteur_digi, 'Non classé')
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_secteur_stats() TO authenticated, anon;
