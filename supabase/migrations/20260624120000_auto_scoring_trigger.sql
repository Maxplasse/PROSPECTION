-- Trigger qui recalcule automatiquement le scoring d'un contact
-- dès que hierarchie, persona, niveau_de_relation ou nb_personnes_digi_relation changent.

CREATE OR REPLACE FUNCTION compute_contact_scoring()
RETURNS TRIGGER AS $$
BEGIN
  NEW.scoring := (
    CASE NEW.hierarchie
      WHEN 'COMEX'        THEN 30
      WHEN 'Directeur'    THEN 20
      WHEN 'Manager'      THEN 15
      WHEN 'Opérationnel' THEN 5
      ELSE 0
    END
    +
    CASE
      WHEN NEW.persona IS NULL OR NEW.persona = 'Hors expertise Digi' THEN 0
      ELSE 20
    END
    +
    CASE NEW.niveau_de_relation
      WHEN 'Ami'                THEN 30
      WHEN 'Cercle familial'    THEN 20
      WHEN 'Ancien collègue'    THEN 20
      WHEN 'Alumni'             THEN 20
      WHEN 'Partenaire business' THEN 20
      WHEN 'Connaissance'       THEN 5
      ELSE 0
    END
    +
    CASE
      WHEN COALESCE(NEW.nb_personnes_digi_relation, 0) >= 3 THEN 20
      WHEN COALESCE(NEW.nb_personnes_digi_relation, 0) = 2  THEN 10
      WHEN COALESCE(NEW.nb_personnes_digi_relation, 0) = 1  THEN 5
      ELSE 0
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_contacts_auto_scoring
  BEFORE INSERT OR UPDATE OF hierarchie, persona, niveau_de_relation, nb_personnes_digi_relation
  ON contacts
  FOR EACH ROW EXECUTE FUNCTION compute_contact_scoring();

-- Recalcul immédiat de tous les contacts existants
UPDATE contacts
SET scoring = (
  CASE hierarchie
    WHEN 'COMEX'        THEN 30
    WHEN 'Directeur'    THEN 20
    WHEN 'Manager'      THEN 15
    WHEN 'Opérationnel' THEN 5
    ELSE 0
  END
  +
  CASE
    WHEN persona IS NULL OR persona = 'Hors expertise Digi' THEN 0
    ELSE 20
  END
  +
  CASE niveau_de_relation
    WHEN 'Ami'                THEN 30
    WHEN 'Cercle familial'    THEN 20
    WHEN 'Ancien collègue'    THEN 20
    WHEN 'Alumni'             THEN 20
    WHEN 'Partenaire business' THEN 20
    WHEN 'Connaissance'       THEN 5
    ELSE 0
  END
  +
  CASE
    WHEN COALESCE(nb_personnes_digi_relation, 0) >= 3 THEN 20
    WHEN COALESCE(nb_personnes_digi_relation, 0) = 2  THEN 10
    WHEN COALESCE(nb_personnes_digi_relation, 0) = 1  THEN 5
    ELSE 0
  END
);
