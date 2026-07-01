-- Index sur id_url_linkedin pour accélérer les lookups de dédup lors des imports
CREATE INDEX IF NOT EXISTS idx_contacts_id_url_linkedin ON contacts (id_url_linkedin);
