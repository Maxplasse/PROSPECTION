-- Recompute entreprises.tier and entreprises.icp from company_typology + secteur_digi
-- using the same rules as src/lib/scoring/compute-tier.ts.
-- Installs a BEFORE INSERT/UPDATE trigger so that code and DB stay consistent
-- whenever typology or secteur_digi changes.

CREATE OR REPLACE FUNCTION compute_entreprise_tier_icp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_typology IS NULL
     OR NEW.company_typology IN ('TPE', 'Startup')
     OR NEW.secteur_digi = 'Concurrent' THEN
    NEW.tier := 'Hors-Tier';
    NEW.icp := FALSE;
  ELSIF NEW.secteur_digi IS NULL THEN
    NEW.tier := 'Tier 3';
    NEW.icp := FALSE;
  ELSIF NEW.secteur_digi IN ('Pharma/Santé', 'BAF') THEN
    NEW.tier := 'Tier 1';
    NEW.icp := TRUE;
  ELSE
    NEW.tier := 'Tier 2';
    NEW.icp := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_entreprises_tier_icp ON entreprises;
CREATE TRIGGER trigger_entreprises_tier_icp
  BEFORE INSERT OR UPDATE OF company_typology, secteur_digi
  ON entreprises
  FOR EACH ROW
  EXECUTE FUNCTION compute_entreprise_tier_icp();

-- One-shot recompute for existing rows
UPDATE entreprises SET
  tier = CASE
    WHEN company_typology IS NULL
      OR company_typology IN ('TPE', 'Startup')
      OR secteur_digi = 'Concurrent'   THEN 'Hors-Tier'
    WHEN secteur_digi IS NULL          THEN 'Tier 3'
    WHEN secteur_digi IN ('Pharma/Santé', 'BAF') THEN 'Tier 1'
    ELSE 'Tier 2'
  END,
  icp = CASE
    WHEN company_typology IS NULL
      OR company_typology IN ('TPE', 'Startup')
      OR secteur_digi = 'Concurrent'   THEN FALSE
    WHEN secteur_digi IS NULL          THEN FALSE
    ELSE TRUE
  END;
