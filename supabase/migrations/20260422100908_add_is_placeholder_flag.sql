-- Flag generic LinkedIn placeholder employers (Freelance, Consultant, etc.)
-- so they can be excluded from targeting and scoring.

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE entreprises
   SET is_placeholder = TRUE
 WHERE company_name IN (
   'Freelance', 'Confidential', 'Indépendant', 'Freelancer',
   'Independent Consultant', 'Self-Employed', 'Consultant',
   'Auto-entrepreneur', 'Freelance (à mon compte)', 'Freelance Designer'
 );

CREATE INDEX IF NOT EXISTS idx_entreprises_is_placeholder
  ON entreprises(is_placeholder) WHERE is_placeholder;
