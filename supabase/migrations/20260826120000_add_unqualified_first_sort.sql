-- Ajoute un paramètre p_unqualified_first à get_contacts_for_membre.
-- Quand true, les contacts sans niveau_de_relation ("Non renseigné" ou NULL)
-- remontent en premier, puis tri par scoring. Utilisé par défaut pour les
-- membres non-admin en vue Tier 1.

CREATE OR REPLACE FUNCTION get_contacts_for_membre(
  p_membre_id        uuid,
  p_tier             text    DEFAULT NULL,
  p_statut           text    DEFAULT NULL,
  p_hierarchie       text    DEFAULT NULL,
  p_persona          text    DEFAULT NULL,
  p_entreprise_link  text    DEFAULT NULL,
  p_entreprise_id    uuid    DEFAULT NULL,
  p_niveau_relation  text    DEFAULT NULL,
  p_search           text    DEFAULT NULL,
  p_order_asc        boolean DEFAULT false,
  p_offset           int     DEFAULT 0,
  p_limit            int     DEFAULT 50,
  p_unqualified_first boolean DEFAULT false
)
RETURNS TABLE (
  id                      uuid,
  first_name              text,
  last_name               text,
  "position"              text,
  company_name            text,
  location                text,
  linkedin_url            text,
  id_url_linkedin         text,
  email                   text,
  persona                 text,
  hierarchie              text,
  statut_contact          text,
  niveau_de_relation      text,
  scoring                 int,
  nb_personnes_digi_relation int,
  contact_digi            boolean,
  entreprise_id           uuid,
  owner_membre_id         uuid,
  tier                    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
    AND NOT c.masque
    AND NOT c.contact_digi
    AND (p_tier IS NULL OR e.tier = p_tier)
    AND (p_statut IS NULL OR c.statut_contact = p_statut)
    AND (p_hierarchie IS NULL OR c.hierarchie = p_hierarchie)
    AND (p_persona IS NULL OR c.persona = p_persona)
    AND (p_entreprise_id IS NULL OR c.entreprise_id = p_entreprise_id)
    AND (
      p_niveau_relation IS NULL
      OR COALESCE(rel.niveau_de_relation, 'Non renseigné') = p_niveau_relation
    )
    AND (
      p_entreprise_link IS NULL
      OR (p_entreprise_link = 'sans'         AND c.company_name IS NULL)
      OR (p_entreprise_link = 'avec'         AND c.company_name IS NOT NULL)
      OR (p_entreprise_link = 'non-rattache' AND c.company_name IS NOT NULL AND c.entreprise_id IS NULL)
    )
    AND (
      p_search IS NULL
      OR c.first_name  ILIKE '%' || p_search || '%'
      OR c.last_name   ILIKE '%' || p_search || '%'
      OR c.company_name ILIKE '%' || p_search || '%'
    )
  ORDER BY
    -- Non renseignés d'abord si demandé
    CASE WHEN p_unqualified_first AND (rel.niveau_de_relation IS NULL OR rel.niveau_de_relation = 'Non renseigné')
      THEN 0 ELSE 1
    END ASC,
    CASE WHEN p_order_asc     THEN rel.scoring END ASC,
    CASE WHEN NOT p_order_asc THEN rel.scoring END DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

ALTER FUNCTION get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, text, boolean, int, int, boolean)
  SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, text, boolean, int, int, boolean) TO authenticated, anon;
