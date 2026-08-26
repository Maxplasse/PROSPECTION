-- Exclure les contacts Digi (contact_digi = true) du compteur Tier 1 non qualifiés.
-- La fonction précédente ne joinait pas la table contacts, donc impossible de filtrer.
-- On ajoute un JOIN contacts pour accéder à contact_digi et masque.

CREATE OR REPLACE FUNCTION get_membre_tier1_unqualified_count()
RETURNS TABLE(membre_id uuid, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.membre_id, COUNT(*)::bigint AS cnt
  FROM contacts_membres_relations r
  JOIN entreprises e ON e.id = r.entreprise_id
  JOIN contacts c ON c.id = r.contact_id
  WHERE e.tier = 'Tier 1'
    AND (r.niveau_de_relation IS NULL OR r.niveau_de_relation = 'Non renseigné')
    AND NOT c.masque
    AND NOT c.contact_digi
  GROUP BY r.membre_id;
$$;

ALTER FUNCTION get_membre_tier1_unqualified_count()
  SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION get_membre_tier1_unqualified_count() TO authenticated, anon;
