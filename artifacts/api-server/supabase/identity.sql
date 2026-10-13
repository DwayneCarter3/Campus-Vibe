-- Apply explicitly to the verified external Supabase database, never at startup.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supabase_user_id uuid UNIQUE REFERENCES auth.users(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS public.campusx_founder_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  auth_id uuid NOT NULL UNIQUE REFERENCES auth.users(id)
);
-- Bind only an already confirmed owner, never user-editable signup metadata.
INSERT INTO public.campusx_founder_identity(singleton, auth_id)
SELECT true, id FROM auth.users
WHERE lower(btrim(email)) = 'dwaynecartergabriel@gmail.com'
AND email_confirmed_at IS NOT NULL
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.campusx_enforce_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE trusted boolean; founder boolean; bound_id uuid;
BEGIN
  SELECT auth_id INTO bound_id FROM public.campusx_founder_identity WHERE singleton;
  SELECT EXISTS (
    SELECT 1 FROM auth.users a WHERE a.id = NEW.supabase_user_id
    AND a.email_confirmed_at IS NOT NULL
    AND lower(btrim(a.email)) = lower(btrim(NEW.email))
  ) INTO trusted;
  founder := trusted AND (
    (lower(btrim(NEW.email)) = 'dwaynecartergabriel@gmail.com'
      AND (bound_id IS NULL OR bound_id = NEW.supabase_user_id))
    OR EXISTS (SELECT 1 FROM public.campusx_founder_identity f WHERE f.auth_id = NEW.supabase_user_id)
  );
  IF lower(btrim(NEW.email)) = 'dwaynecartergabriel@gmail.com'
    AND bound_id IS NOT NULL AND NEW.supabase_user_id IS DISTINCT FROM bound_id THEN
    RAISE EXCEPTION 'This email is reserved for the verified founder.' USING ERRCODE = '23514';
  END IF;
  IF btrim(NEW.matric_number) = '23110591126' AND NOT founder THEN
    RAISE EXCEPTION 'This matriculation number is reserved for the verified founder.'
      USING ERRCODE = '23514';
  END IF;
  IF founder AND (
    lower(btrim(NEW.email)) = 'dwaynecartergabriel@gmail.com'
    OR btrim(NEW.matric_number) = '23110591126'
    OR EXISTS (SELECT 1 FROM public.campusx_founder_identity f WHERE f.auth_id = NEW.supabase_user_id)
  ) THEN
    NEW.role := 'CEO';
    NEW.is_admin := true;
    INSERT INTO public.campusx_founder_identity(singleton,auth_id)
    VALUES (true,NEW.supabase_user_id) ON CONFLICT (singleton) DO NOTHING;
  ELSIF upper(NEW.role) = 'CEO' THEN
    NEW.role := 'student';
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campusx_enforce_identity ON public.users;
CREATE TRIGGER campusx_enforce_identity BEFORE INSERT OR UPDATE
ON public.users FOR EACH ROW EXECUTE FUNCTION public.campusx_enforce_identity();

CREATE OR REPLACE FUNCTION public.campusx_sync_token_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.supabase_user_id IS NOT NULL THEN
    UPDATE auth.users SET raw_app_meta_data =
      coalesce(raw_app_meta_data,'{}'::jsonb) ||
      jsonb_build_object('role',NEW.role,'campusx_user_id',NEW.clerk_user_id)
    WHERE id = NEW.supabase_user_id AND (
      raw_app_meta_data->>'role' IS DISTINCT FROM NEW.role
      OR raw_app_meta_data->>'campusx_user_id' IS DISTINCT FROM NEW.clerk_user_id
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campusx_sync_token_role ON public.users;
CREATE TRIGGER campusx_sync_token_role AFTER INSERT OR UPDATE
ON public.users FOR EACH ROW EXECUTE FUNCTION public.campusx_sync_token_role();

CREATE OR REPLACE FUNCTION public.campusx_auth_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Email and authority come from auth.users, not user-supplied metadata.
  IF EXISTS (SELECT 1 FROM public.users WHERE supabase_user_id = NEW.id) THEN
    UPDATE public.users SET email = lower(btrim(NEW.email)) WHERE supabase_user_id = NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO public.users (
    clerk_user_id,supabase_user_id,email,full_name,level,faculty,
    enrollment_status,matric_number,onboarded
  ) VALUES (
    'supabase:' || NEW.id::text,NEW.id,coalesce(NEW.email,''),
    coalesce(NEW.raw_user_meta_data->>'fullName',''),
    '','','','',false
  )
  ON CONFLICT (supabase_user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS campusx_auth_profile ON auth.users;
CREATE TRIGGER campusx_auth_profile AFTER INSERT OR UPDATE OF email,email_confirmed_at
ON auth.users FOR EACH ROW EXECUTE FUNCTION public.campusx_auth_profile();

UPDATE public.users SET role = role WHERE supabase_user_id IS NOT NULL;
ALTER TABLE public.campusx_founder_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campusx_founder_identity FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.campusx_enforce_identity() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campusx_sync_token_role() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campusx_auth_profile() FROM PUBLIC,anon,authenticated;
COMMIT;
