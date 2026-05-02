-- Aggregated dashboard stats RPC.
-- Replaces 9 sequential count(*) round-trips from useDashboardStats with a single SQL call.

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE(
  total_entreprises      bigint,
  total_contacts         bigint,
  total_notifications    bigint,
  deals_en_cours         bigint,
  contacts_a_contacter   bigint,
  contacts_contactes     bigint,
  tier1                  bigint,
  tier2                  bigint,
  tier3                  bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM entreprises),
    (SELECT COUNT(*) FROM contacts),
    (SELECT COUNT(*) FROM notifications),
    (SELECT COUNT(*) FROM entreprises WHERE statut_entreprise = 'Deal en cours'),
    (SELECT COUNT(*) FROM contacts    WHERE statut_contact    = 'À contacter'),
    (SELECT COUNT(*) FROM contacts    WHERE statut_contact    = 'Contacté'),
    (SELECT COUNT(*) FROM entreprises WHERE tier = 'Tier 1'),
    (SELECT COUNT(*) FROM entreprises WHERE tier = 'Tier 2'),
    (SELECT COUNT(*) FROM entreprises WHERE tier = 'Tier 3');
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated, anon;
