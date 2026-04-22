-- Automatically assign an account_manager_id when an entreprise has no AM
-- and matches one of the sectoral rules:
--   Pharma/Santé           → random(François Coulon, Clément Guichard, Alexandre Koch)
--   BAF + Grand Groupe     → random(Julien Bechkri, Cindy Renard, Emmanuel Utard, Clément Maria)
--   BAF + ETI|PME|TPE|null → random(Christophe Pelletier, Yanis Sif)
-- Never overwrites an existing account_manager_id. Skips is_placeholder rows.

CREATE OR REPLACE FUNCTION auto_assign_account_manager()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ams uuid[];
BEGIN
  IF NEW.account_manager_id IS NOT NULL OR NEW.is_placeholder THEN
    RETURN NEW;
  END IF;

  IF NEW.secteur_digi = 'Pharma/Santé' THEN
    SELECT array_agg(id) INTO ams FROM membres_digilityx
     WHERE full_name IN ('François Coulon', 'Clément Guichard', 'Alexandre Koch');
  ELSIF NEW.secteur_digi = 'BAF' AND NEW.company_typology = 'Grand Groupe' THEN
    SELECT array_agg(id) INTO ams FROM membres_digilityx
     WHERE full_name IN ('Julien Bechkri', 'Cindy Renard', 'Emmanuel Utard', 'Clément Maria');
  ELSIF NEW.secteur_digi = 'BAF'
    AND (NEW.company_typology IN ('ETI', 'PME', 'TPE') OR NEW.company_typology IS NULL) THEN
    SELECT array_agg(id) INTO ams FROM membres_digilityx
     WHERE full_name IN ('Christophe Pelletier', 'Yanis Sif');
  END IF;

  IF ams IS NOT NULL AND array_length(ams, 1) > 0 THEN
    NEW.account_manager_id := ams[floor(random() * array_length(ams, 1)) + 1];
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_assign_am ON entreprises;
CREATE TRIGGER trigger_auto_assign_am
  BEFORE INSERT OR UPDATE OF secteur_digi, company_typology, is_placeholder
  ON entreprises
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_account_manager();
