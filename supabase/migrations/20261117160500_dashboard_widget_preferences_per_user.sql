-- Preferências do dashboard: por usuário, empresa e seção, persistidas entre dispositivos.
CREATE TABLE IF NOT EXISTS public.dashboard_widget_preferences (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 section text NOT NULL CHECK (section IN ('overview','orders','registrations','inventory','agenda','quotes','finance')),
 visible_keys text[] NOT NULL DEFAULT '{}'::text[],
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,user_id,section),
 CONSTRAINT dashboard_widget_keys_size CHECK (cardinality(visible_keys)<=24)
);
ALTER TABLE public.dashboard_widget_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dashboard_widget_preferences_owner_select ON public.dashboard_widget_preferences;
CREATE POLICY dashboard_widget_preferences_owner_select ON public.dashboard_widget_preferences
FOR SELECT TO authenticated
USING (user_id=(select auth.uid()) AND private.is_organization_member(organization_id));
DROP POLICY IF EXISTS dashboard_widget_preferences_owner_insert ON public.dashboard_widget_preferences;
CREATE POLICY dashboard_widget_preferences_owner_insert ON public.dashboard_widget_preferences
FOR INSERT TO authenticated
WITH CHECK (user_id=(select auth.uid()) AND private.is_organization_member(organization_id));
DROP POLICY IF EXISTS dashboard_widget_preferences_owner_update ON public.dashboard_widget_preferences;
CREATE POLICY dashboard_widget_preferences_owner_update ON public.dashboard_widget_preferences
FOR UPDATE TO authenticated
USING (user_id=(select auth.uid()) AND private.is_organization_member(organization_id))
WITH CHECK (user_id=(select auth.uid()) AND private.is_organization_member(organization_id));
REVOKE ALL ON public.dashboard_widget_preferences FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.dashboard_widget_preferences TO authenticated;
