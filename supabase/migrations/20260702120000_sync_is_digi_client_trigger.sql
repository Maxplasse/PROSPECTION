-- Synchronise is_digi_client avec statut_digi automatiquement.
-- is_digi_client = true si statut_digi IN ('Client Digi - pas de mission', 'Client Digi - mission en cours')
-- is_digi_client = false sinon (Pas client Digi, Client Digileads, NULL)

CREATE OR REPLACE FUNCTION sync_is_digi_client()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_digi_client := NEW.statut_digi IN ('Client Digi - pas de mission', 'Client Digi - mission en cours');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_entreprises_sync_is_digi_client ON entreprises;
CREATE TRIGGER trigger_entreprises_sync_is_digi_client
  BEFORE INSERT OR UPDATE OF statut_digi
  ON entreprises
  FOR EACH ROW EXECUTE FUNCTION sync_is_digi_client();

-- Recalcul immédiat pour les lignes existantes
UPDATE entreprises
SET is_digi_client = statut_digi IN ('Client Digi - pas de mission', 'Client Digi - mission en cours');
