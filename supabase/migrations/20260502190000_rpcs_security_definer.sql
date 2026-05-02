-- The RLS policy on entreprises (and contacts) for authenticated non-admin
-- users contains a correlated subquery that JOINs contacts and
-- contacts_membres_relations. With SECURITY INVOKER (default), this gets
-- evaluated for every row returned, blowing up a 11ms DB query to a 3.6s
-- API call.
--
-- These RPCs already enforce access by filtering on p_membre_id, so we run
-- them as SECURITY DEFINER and bypass the per-row policy. search_path is
-- pinned to mitigate the standard SECURITY DEFINER injection risk.

ALTER FUNCTION get_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text, int, int)
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION count_entreprises_for_membre(uuid, text, text, text, text[], boolean, uuid, text)
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION get_contacts_for_membre(uuid, text, text, text, text, text, uuid, text, boolean, int, int)
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION count_contacts_for_membre(uuid, text, text, text, text, text, uuid, text)
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION get_dashboard_stats()
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION get_secteur_stats()
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION contact_counts_for_entreprises(uuid[])
  SECURITY DEFINER SET search_path = public, pg_temp;
