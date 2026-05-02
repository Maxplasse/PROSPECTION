-- B-tree index on entreprises.company_name to make ORDER BY company_name LIMIT N
-- (used by the Entreprises list page) an indexed top-N instead of a 16k seq scan + sort.
-- The existing trigram GIN index supports ILIKE search but cannot serve ORDER BY.

CREATE INDEX IF NOT EXISTS idx_entreprises_company_name
  ON entreprises USING btree (company_name);
