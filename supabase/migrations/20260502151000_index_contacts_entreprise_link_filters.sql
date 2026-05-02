-- Partial indexes for the "Sans entreprise" and "Non rattachée" filters on
-- the Contacts page. Without them, COUNT(*) WHERE company_name IS NULL
-- seq-scans the 30k contacts table (~3.8s cold), and the AND-combination
-- with entreprise_id IS NULL did a heap-fetch detour (~3.3s). With the
-- partial indexes, both counts drop to a few milliseconds.

-- "Sans entreprise" filter: company_name IS NULL
CREATE INDEX IF NOT EXISTS idx_contacts_company_name_null
  ON contacts (id) WHERE company_name IS NULL;

-- "Non rattachée" filter: company_name IS NOT NULL AND entreprise_id IS NULL
CREATE INDEX IF NOT EXISTS idx_contacts_unlinked
  ON contacts (id) WHERE entreprise_id IS NULL AND company_name IS NOT NULL;
