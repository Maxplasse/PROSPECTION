-- Returns, per membre, the number of Tier 1 contacts whose relation has not
-- been qualified yet (NULL or 'Non renseigné'). Used by the Vue Tier admin
-- table to surface members who need a Slack nudge.

CREATE OR REPLACE FUNCTION get_membre_tier1_unqualified_count()
RETURNS TABLE(membre_id uuid, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.membre_id,
    COUNT(*)::bigint AS cnt
  FROM contacts_membres_relations r
  JOIN contacts c ON c.id = r.contact_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  WHERE
    COALESCE(e.tier, 'Sans tier') = 'Tier 1'
    AND (r.niveau_de_relation IS NULL OR r.niveau_de_relation = 'Non renseigné')
  GROUP BY r.membre_id;
$$;

GRANT EXECUTE ON FUNCTION get_membre_tier1_unqualified_count() TO authenticated, anon;
