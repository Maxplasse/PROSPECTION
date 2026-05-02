-- Fast path for count_contacts_for_membre when no contact-side filter is set:
-- skip the join to contacts/entreprises entirely and count straight from the
-- (membre_id, scoring) index. Measured: 1159ms -> 10ms for 2500 relations.

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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result bigint;
BEGIN
  IF p_tier IS NULL
     AND p_statut IS NULL
     AND p_hierarchie IS NULL
     AND p_persona IS NULL
     AND p_entreprise_link IS NULL
     AND p_entreprise_id IS NULL
     AND p_search IS NULL THEN
    SELECT COUNT(*) INTO result
    FROM contacts_membres_relations
    WHERE membre_id = p_membre_id;
    RETURN result;
  END IF;

  SELECT COUNT(*) INTO result
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
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION count_contacts_for_membre(uuid, text, text, text, text, text, uuid, text) TO authenticated, anon;
