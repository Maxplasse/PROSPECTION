-- Indexes for the two non-indexed filter columns on entreprises.
-- Without them, COUNT(*) WHERE secteur_digi = X seq-scans all 16k rows
-- (~700ms cold). Index turns this into a ~30ms index scan.

CREATE INDEX IF NOT EXISTS idx_entreprises_secteur_digi
  ON entreprises USING btree (secteur_digi);

CREATE INDEX IF NOT EXISTS idx_entreprises_statut_digi
  ON entreprises USING btree (statut_digi);
