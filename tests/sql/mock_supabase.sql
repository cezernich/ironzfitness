-- Minimal stand-in for the Supabase pieces the profiles security test needs:
-- roles, auth.uid()/auth.jwt(), and the profiles policies as they existed
-- before 20261109_secure_profiles.sql (including the vulnerable ones), plus
-- fixture users. Not a full schema.

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), email text, full_name text, created_at timestamptz DEFAULT now(),
  subscription_status text DEFAULT 'free', role text DEFAULT 'user', is_coach boolean NOT NULL DEFAULT false, coach_bio text, avatar_url text,
  birthday text, weight_lbs numeric, updated_at timestamptz);
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'); $$ LANGUAGE sql SECURITY DEFINER STABLE;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (auth.uid() = id OR is_admin());
CREATE POLICY "Authenticated users can look up others by email" ON profiles FOR SELECT TO authenticated USING (true);
CREATE TABLE public.coaching_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, coach_id uuid, active boolean DEFAULT true);
CREATE FUNCTION public.is_coaching(coach_uid uuid, client_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM coaching_assignments WHERE coach_id=coach_uid AND client_id=client_uid AND active) $$;
CREATE POLICY "Coaches can view assigned clients' profiles" ON public.profiles FOR SELECT USING (public.is_coaching(auth.uid(), id));
CREATE TABLE public.workout_inbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid, recipient_id uuid);
CREATE TABLE public.shared_workouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_user_id uuid, expires_at timestamptz DEFAULT now()+interval '30 days', revoked_at timestamptz);
CREATE POLICY "Anyone can read shared workout sender profiles" ON profiles FOR SELECT USING (EXISTS (SELECT 1 FROM shared_workouts sw WHERE sw.sender_user_id = profiles.id AND sw.expires_at > now() AND sw.revoked_at IS NULL));
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
-- users: A=attacker, B=victim, C=owner(chase), K=coach of B, S=stranger with live share
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d'),('00000000-0000-0000-0000-00000000000e');
INSERT INTO profiles(id,email,full_name,birthday,weight_lbs,role) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@x.com','Attacker','1990-01-01',180,'user'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com','Victim','1992-02-02',140,'user'),
 ('00000000-0000-0000-0000-00000000000c','chase.zernich@gmail.com','Owner',NULL,NULL,'user'),
 ('00000000-0000-0000-0000-00000000000d','k@x.com','Coach',null,null,'user');
UPDATE profiles SET is_coach=true, coach_bio='bio' WHERE full_name='Coach';
INSERT INTO coaching_assignments(client_id,coach_id) VALUES ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000d');
INSERT INTO shared_workouts(sender_user_id) VALUES ('00000000-0000-0000-0000-00000000000b');
