-- get_membre_relations_by_tier and get_membre_tier1_unqualified_count join
-- contacts and entreprises, which have RLS policies with correlated subqueries.
-- Running as SECURITY DEFINER bypasses per-row policy evaluation, same pattern
-- as the other aggregate RPCs in 20260502190000_rpcs_security_definer.sql.

ALTER FUNCTION get_membre_relations_by_tier()
  SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION get_membre_tier1_unqualified_count()
  SECURITY DEFINER SET search_path = public, pg_temp;
