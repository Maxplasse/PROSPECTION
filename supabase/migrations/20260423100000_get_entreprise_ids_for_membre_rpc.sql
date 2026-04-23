-- Returns the set of entreprise UUIDs linked to contacts that the given membre
-- has a relation with. Used to scope the Entreprises page to a non-admin user.
CREATE OR REPLACE FUNCTION get_entreprise_ids_for_membre(p_membre_id uuid)
RETURNS TABLE(entreprise_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.entreprise_id
  FROM contacts c
  JOIN contacts_membres_relations r ON r.contact_id = c.id
  WHERE r.membre_id = p_membre_id
    AND c.entreprise_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_entreprise_ids_for_membre(uuid) TO authenticated, anon;
