-- ============================================================
-- Membres inactifs + contacts non partageables
--
-- Deux flags sur membres_digilityx :
--   actif             : membre encore présent chez Digi
--   partager_contacts : ses contacts exclusifs sont visibles des autres
--
-- Flag masque sur contacts :
--   true si TOUTES les relations du contact pointent vers des membres
--   avec partager_contacts = false (contact invisible pour tout le monde)
--   false dès qu'au moins un membre partageant est lié au contact
-- ============================================================

-- ------------------------------------------------------------
-- 1. Flags sur membres_digilityx
-- ------------------------------------------------------------
ALTER TABLE membres_digilityx
  ADD COLUMN IF NOT EXISTS actif             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS partager_contacts boolean NOT NULL DEFAULT true;

-- Quand un membre part (actif → false), on force partager_contacts → false
CREATE OR REPLACE FUNCTION sync_partager_contacts_on_depart()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actif = false THEN
    NEW.partager_contacts := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_partager_contacts ON membres_digilityx;
CREATE TRIGGER trigger_sync_partager_contacts
  BEFORE UPDATE OF actif ON membres_digilityx
  FOR EACH ROW EXECUTE FUNCTION sync_partager_contacts_on_depart();

-- ------------------------------------------------------------
-- 2. Flag masque sur contacts
-- ------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS masque boolean NOT NULL DEFAULT false;

-- Fonction de recompute pour un contact donné
CREATE OR REPLACE FUNCTION recompute_contact_masque(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE contacts
  SET masque = (
    -- a des relations ET aucune ne pointe vers un membre partageant
    EXISTS (
      SELECT 1 FROM contacts_membres_relations
      WHERE contact_id = p_contact_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM contacts_membres_relations r
      JOIN membres_digilityx m ON m.id = r.membre_id
      WHERE r.contact_id = p_contact_id
        AND m.partager_contacts = true
    )
  )
  WHERE id = p_contact_id;
END;
$$;

-- Trigger sur contacts_membres_relations (ajout / suppression d'une relation)
CREATE OR REPLACE FUNCTION trg_cmr_recompute_masque()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_contact_masque(OLD.contact_id);
  ELSE
    PERFORM recompute_contact_masque(NEW.contact_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cmr_masque ON contacts_membres_relations;
CREATE TRIGGER trigger_cmr_masque
  AFTER INSERT OR UPDATE OR DELETE ON contacts_membres_relations
  FOR EACH ROW EXECUTE FUNCTION trg_cmr_recompute_masque();

-- Trigger sur membres_digilityx (changement de partager_contacts)
-- Recompute le masque de tous les contacts liés à ce membre
CREATE OR REPLACE FUNCTION trg_membre_partager_recompute_masque()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recompute_contact_masque(r.contact_id)
  FROM contacts_membres_relations r
  WHERE r.membre_id = NEW.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_membre_partager_masque ON membres_digilityx;
CREATE TRIGGER trigger_membre_partager_masque
  AFTER UPDATE OF partager_contacts ON membres_digilityx
  FOR EACH ROW EXECUTE FUNCTION trg_membre_partager_recompute_masque();

-- ------------------------------------------------------------
-- 3. Backfill initial (tous les contacts existants)
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM contacts LOOP
    PERFORM recompute_contact_masque(r.id);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 4. Mise à jour des RPCs — ajouter AND NOT c.masque
-- ------------------------------------------------------------

-- get_contacts_for_membre
DROP FUNCTION IF EXISTS get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, text, boolean, int, int);

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
  p_limit            int     DEFAULT 50
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
    CASE WHEN p_order_asc     THEN rel.scoring END ASC,
    CASE WHEN NOT p_order_asc THEN rel.scoring END DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

-- count_contacts_for_membre
DROP FUNCTION IF EXISTS count_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, text);

CREATE OR REPLACE FUNCTION count_contacts_for_membre(
  p_membre_id        uuid,
  p_tier             text DEFAULT NULL,
  p_statut           text DEFAULT NULL,
  p_hierarchie       text DEFAULT NULL,
  p_persona          text DEFAULT NULL,
  p_entreprise_link  text DEFAULT NULL,
  p_entreprise_id    uuid DEFAULT NULL,
  p_niveau_relation  text DEFAULT NULL,
  p_search           text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result bigint;
BEGIN
  -- Fast path : aucun filtre actif → on exclut juste les masqués
  IF p_tier IS NULL
     AND p_statut IS NULL
     AND p_hierarchie IS NULL
     AND p_persona IS NULL
     AND p_entreprise_link IS NULL
     AND p_entreprise_id IS NULL
     AND p_niveau_relation IS NULL
     AND p_search IS NULL THEN
    SELECT COUNT(*) INTO result
    FROM contacts_membres_relations rel
    JOIN contacts c ON c.id = rel.contact_id
    WHERE rel.membre_id = p_membre_id
      AND NOT c.masque;
    RETURN result;
  END IF;

  SELECT COUNT(*) INTO result
  FROM contacts_membres_relations rel
  JOIN contacts c ON c.id = rel.contact_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  WHERE rel.membre_id = p_membre_id
    AND NOT c.masque
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
    );
  RETURN result;
END;
$$;

-- get_membre_relations_by_tier : exclure membres inactifs et contacts masqués
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
  JOIN membres_digilityx m ON m.id = r.membre_id
  LEFT JOIN entreprises e ON e.id = c.entreprise_id
  WHERE m.actif = true
    AND NOT c.masque
  GROUP BY r.membre_id, COALESCE(e.tier, 'Sans tier');
$$;

-- ------------------------------------------------------------
-- 5. Grants
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, text, boolean, int, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION count_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_membre_relations_by_tier() TO authenticated, anon;
