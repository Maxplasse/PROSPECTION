-- Fast substring ILIKE search on entreprises and contacts
-- via pg_trgm GIN indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS public.idx_entreprises_company_name;

CREATE INDEX IF NOT EXISTS idx_entreprises_company_name_trgm
  ON public.entreprises USING gin (company_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_first_name_trgm
  ON public.contacts USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_last_name_trgm
  ON public.contacts USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_company_name_trgm
  ON public.contacts USING gin (company_name gin_trgm_ops);
