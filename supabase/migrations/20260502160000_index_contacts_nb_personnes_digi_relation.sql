-- Partial B-tree index for the Dashboard "Contacts les plus connectés"
-- section, which does ORDER BY nb_personnes_digi_relation DESC LIMIT 10.
-- Without it, the query seq-scans all 30k contacts and top-N sorts (~3s).
-- The partial WHERE > 0 keeps the index small (most rows are 0).

CREATE INDEX IF NOT EXISTS idx_contacts_nb_digi_relation
  ON contacts (nb_personnes_digi_relation DESC)
  WHERE nb_personnes_digi_relation > 0;
