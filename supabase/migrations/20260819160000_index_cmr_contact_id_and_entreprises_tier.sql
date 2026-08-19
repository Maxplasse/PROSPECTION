-- get_membre_relations_by_tier JOINs contacts_membres_relations → contacts →
-- entreprises but had no index on the join columns, causing a full seq-scan
-- that times out via the REST API in production.

CREATE INDEX IF NOT EXISTS idx_cmr_contact_id
  ON contacts_membres_relations(contact_id);

CREATE INDEX IF NOT EXISTS idx_contacts_entreprise_id
  ON contacts(entreprise_id);

CREATE INDEX IF NOT EXISTS idx_entreprises_tier
  ON entreprises(tier);
