-- The signed agent publishes observations at a bounded 60-second cadence.
-- Keep activation available between those reports, with a 30-second margin.
-- Incoming reports still require native observations younger than 30 seconds;
-- agent admission, capacity, revision, tenancy and legacy guards are unchanged.
do $migration$
declare
 definition text := pg_get_functiondef('private.pbx_universal_can_activate(uuid,jsonb)'::regprocedure);
 previous text := 'cfg.observed_at<now()-interval ''30 seconds''';
 replacement text := 'cfg.observed_at<now()-interval ''90 seconds''';
begin
 if length(definition)-length(replace(definition,previous,'')) <> length(previous) then
  raise exception 'Unexpected PBX activation freshness definition; review required';
 end if;
 execute replace(definition,previous,replacement);
end;
$migration$;
