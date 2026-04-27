-- 1) Backfill contacts_membres_relations.niveau_de_relation from
-- contacts.niveau_de_relation, but ONLY for contacts that have exactly one
-- member relation (unambiguous attribution). Multi-relation contacts are
-- left blank — members will re-qualify via the UI.
UPDATE contacts_membres_relations r
SET niveau_de_relation = c.niveau_de_relation
FROM contacts c
WHERE r.contact_id = c.id
  AND c.niveau_de_relation IS NOT NULL
  AND c.niveau_de_relation <> 'Non renseigné'
  AND (r.niveau_de_relation IS NULL OR r.niveau_de_relation = 'Non renseigné')
  AND (SELECT COUNT(*) FROM contacts_membres_relations r2 WHERE r2.contact_id = c.id) = 1;

-- 2) Rewrite get_contacts_for_membre to return the per-member relation
-- level (rel.niveau_de_relation) instead of the global scalar
-- (c.niveau_de_relation). This is what the inline select on the Contacts
-- page now displays.
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
  WITH rel AS MATERIALIZED (
    SELECT contact_id, niveau_de_relation
    FROM contacts_membres_relations
    WHERE membre_id = p_membre_id
  )
  SELECT
    c.id, c.first_name, c.last_name, c."position", c.company_name, c.location,
    c.linkedin_url, c.id_url_linkedin, c.email, c.persona, c.hierarchie,
    c.statut_contact, rel.niveau_de_relation, c.scoring,
    c.nb_personnes_digi_relation, c.contact_digi, c.entreprise_id,
    c.owner_membre_id, e.tier
  FROM rel
  JOIN contacts c ON c.id = rel.contact_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  WHERE
    (p_tier IS NULL OR e.tier = p_tier)
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
    CASE WHEN p_order_asc THEN c.scoring END ASC,
    CASE WHEN NOT p_order_asc THEN c.scoring END DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, boolean, int, int) TO authenticated, anon;
