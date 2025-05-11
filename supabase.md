Okay, here is a consolidated SQL script that defines the current state of your Pawsitive Strides database schema in Supabase, based on our discussion. This script includes table definitions, RLS policies, the `handle_new_user` trigger, the `find_nearby_users` function, and all the enhanced profile fields for pet owners and dog walkers, plus the latest Quick Ride RPC enhancements.

# Recent Updates (Enhanced User Profiles & Quick Rides V6 - [Current Date])

The schema has been enhanced to support more comprehensive user profiles and a robust "Quick Ride" feature.

## Pet Owner Enhancements:
- `emergency_contact_name`: Optional emergency contact person
- `emergency_contact_phone`: Phone number for emergency contact
- `preferred_communication`: User preference for how to be contacted (App Message, SMS, Call, Email)
- `owner_notes_for_walker`: General instructions/notes for dog walkers

## Dog Walker Enhancements:
- `profile_picture_url`: URL to profile image (applies to both roles)
- `about_me`: Biographical information and walker introduction
- `experience_years`: Numeric value for years of dog walking experience
- `experience_summary`: Detailed description of walker's experience with dogs
- `availability_schedule`: JSONB structure storing weekly availability with day/time slots

## "Quick Ride" Feature Enhancements:
- `quick_rides` table: Stores on-demand walking jobs.
- `quick_ride_status` ENUM: Manages the state of quick rides.
- RLS Policies for `quick_rides`.
- RPC Functions:
    - `create_quick_ride`: For pet owners to post a new quick ride.
    - `get_available_quick_rides`: **Updated** for dog walkers to find *only future* nearby pending rides.
    - `accept_quick_ride`: **Updated** for dog walkers to accept a ride, with a check to ensure ride time has not passed.
    - `cancel_quick_ride_owner`: For pet owners to cancel their pending rides.
    - **`complete_quick_ride_walker`**: **New** function for walkers to mark an accepted ride as completed.

SQL for all features is included in the full schema below.

You can save this as a .sql file (e.g., `pawsitive_strides_schema_v6.sql`) to share with others or use as a reference. It's designed to be re-runnable (it drops objects before recreating them).

-- ======================================================================
-- Pawsitive Strides - Supabase Database Schema Setup Script
-- Version: 6 (Quick Ride RPCs refined for time-based validity)
--
-- Purpose: Defines the necessary tables, RLS policies, trigger function,
--          RPC functions, and trigger for the Pawsitive Strides application.
--
-- Assumes:
--   - Supabase project is already created.
--   - `auth.users` table exists (managed by Supabase Auth).
--   - Appropriate extensions (like `uuid-ossp` for gen_random_uuid) are enabled.
-- ======================================================================

-- === Configuration ===
-- Set default search path (good practice)
SET search_path = public;

-- === Drop Existing Objects (in reverse dependency order) ===
-- Ensures the script is re-runnable without errors.

-- 0. Drop the trigger on auth.users first (if exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 1. Drop RPC functions that might depend on tables/types
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.find_nearby_users(double precision, double precision, double precision, text, uuid);
DROP FUNCTION IF EXISTS public.create_quick_ride(uuid, timestamp with time zone, numeric, text);
DROP FUNCTION IF EXISTS public.get_available_quick_rides(double precision);
DROP FUNCTION IF EXISTS public.accept_quick_ride(uuid);
DROP FUNCTION IF EXISTS public.cancel_quick_ride_owner(uuid);
DROP FUNCTION IF EXISTS public.complete_quick_ride_walker(uuid); -- NEW: ensure it's dropped

-- 2. Drop quick_rides table (depends on profiles, dogs, quick_ride_status type)
DROP TABLE IF EXISTS public.quick_rides CASCADE;

-- 3. Drop dogs table (depends on profiles)
DROP TABLE IF EXISTS public.dogs CASCADE;

-- 4. Drop profiles table (depends on auth.users)
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 5. Drop ENUM types (if not dropped by CASCADE with quick_rides)
DROP TYPE IF EXISTS public.quick_ride_status;

-- === Create ENUM Types ===
CREATE TYPE public.quick_ride_status AS ENUM (
    'pending_acceptance',
    'accepted',
    'completed',
    'cancelled_by_owner',
    'cancelled_by_walker' -- Retained for schema completeness, though not actively used by new RPCs
);

-- === Create Tables ===

-- Create the profiles table
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY, -- Matches auth.users.id
  full_name text,
  mobile text UNIQUE,
  address text,
  role text CHECK (role IN ('owner', 'walker')),
  plan text,
  age integer,
  latitude double precision,
  longitude double precision,
  subscription_status text DEFAULT 'pending_payment' CHECK (subscription_status IN ('pending_payment', 'active', 'inactive', 'cancelled')),
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_communication text CHECK (preferred_communication IN ('App Message', 'SMS', 'Call', 'Email')),
  owner_notes_for_walker text,
  profile_picture_url text,
  about_me text,
  experience_years integer,
  experience_summary text,
  availability_schedule jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT fk_auth_user FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE
);
COMMENT ON TABLE public.profiles IS 'Stores public profile information linked to authenticated users.';
COMMENT ON COLUMN public.profiles.emergency_contact_name IS 'Name of emergency contact for dog owners';
COMMENT ON COLUMN public.profiles.emergency_contact_phone IS 'Phone number of emergency contact for dog owners';
COMMENT ON COLUMN public.profiles.preferred_communication IS 'User preference for notifications and contact method';
COMMENT ON COLUMN public.profiles.owner_notes_for_walker IS 'General instructions from owner to walkers';
COMMENT ON COLUMN public.profiles.profile_picture_url IS 'URL to user profile picture stored in Supabase storage';
COMMENT ON COLUMN public.profiles.about_me IS 'Walker biography/personal introduction';
COMMENT ON COLUMN public.profiles.experience_years IS 'Number of years of experience as a dog walker';
COMMENT ON COLUMN public.profiles.experience_summary IS 'Detailed description of walker experience with dogs';
COMMENT ON COLUMN public.profiles.availability_schedule IS 'JSON object with weekly availability schedule for walkers';

-- Create the dogs table
CREATE TABLE public.dogs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  breed text,
  age integer,
  gender text CHECK (gender IN ('Male', 'Female')),
  weight numeric,
  photo_urls text[],
  temperament text[],
  special_needs text,
  vaccination_records_url text,
  vet_contact text,
  preferred_route text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT fk_owner FOREIGN KEY(owner_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
COMMENT ON TABLE public.dogs IS 'Stores details about dogs belonging to users.';

-- Create the quick_rides table
CREATE TABLE public.quick_rides (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dog_id uuid NOT NULL REFERENCES public.dogs(id) ON DELETE CASCADE,
    walk_datetime timestamp with time zone NOT NULL,
    pay_amount numeric(10, 2) NOT NULL CHECK (pay_amount >= 0),
    instructions text,
    status public.quick_ride_status DEFAULT 'pending_acceptance' NOT NULL,
    accepted_walker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    owner_latitude double precision NOT NULL,
    owner_longitude double precision NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.quick_rides IS 'Stores details for on-demand "Quick Ride" dog walking jobs.';
COMMENT ON COLUMN public.quick_rides.owner_latitude IS 'Snapshot of owner''s latitude at time of ride creation for geo-query efficiency.';
COMMENT ON COLUMN public.quick_rides.owner_longitude IS 'Snapshot of owner''s longitude at time of ride creation for geo-query efficiency.';
COMMENT ON COLUMN public.quick_rides.status IS 'Current status of the quick ride.';
COMMENT ON COLUMN public.quick_rides.accepted_walker_id IS 'The walker who accepted this ride.';

-- === Enable Row Level Security (RLS) ===
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_rides ENABLE ROW LEVEL SECURITY;

-- === Define RLS Policies ===

-- RLS Policies for profiles table
CREATE POLICY "CRUD own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow authenticated users to view profiles" ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RLS Policies for dogs table
CREATE POLICY "CRUD own dogs" ON public.dogs
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- RLS Policies for quick_rides table
CREATE POLICY "Pet owners can create quick rides"
ON public.quick_rides FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = owner_id AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner' AND
    (SELECT owner_id FROM public.dogs WHERE id = dog_id) = auth.uid()
);
CREATE POLICY "Pet owners can view their own quick rides"
ON public.quick_rides FOR SELECT
TO authenticated
USING (
    auth.uid() = owner_id AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);

CREATE POLICY "Pet owners can update their own pending quick rides for cancellation"
ON public.quick_rides FOR UPDATE
TO authenticated
USING (
    auth.uid() = owner_id AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
)
WITH CHECK (
    status = 'pending_acceptance'
);

CREATE POLICY "Dog walkers can view pending quick rides"
ON public.quick_rides FOR SELECT
TO authenticated
USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'walker' AND
    status = 'pending_acceptance'
);

CREATE POLICY "Dog walkers can view their accepted quick rides"
ON public.quick_rides FOR SELECT
TO authenticated
USING (
    auth.uid() = accepted_walker_id AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'walker'
);

-- Policy for walkers to update rides they accepted (specifically for completion via RPC)
CREATE POLICY "Walkers can update rides they accepted"
ON public.quick_rides FOR UPDATE
TO authenticated
USING (
    auth.uid() = accepted_walker_id AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'walker'
)
WITH CHECK (
    status = 'accepted' -- Can only update if it's currently 'accepted' (to move to 'completed')
);


-- === Define Functions ===

-- Trigger function to populate profiles table on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta_full_name text; meta_mobile text; meta_address text;
    meta_role text; meta_plan text; meta_age text;
    profile_age integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = new.id) THEN
      meta_full_name := new.raw_user_meta_data ->> 'full_name';
      meta_mobile    := new.raw_user_meta_data ->> 'mobile';
      meta_address   := new.raw_user_meta_data ->> 'address';
      meta_role      := new.raw_user_meta_data ->> 'user_role';
      meta_plan      := new.raw_user_meta_data ->> 'selected_plan';
      meta_age       := new.raw_user_meta_data ->> 'age';

      profile_age := NULL;
      IF meta_role = 'walker' THEN
          BEGIN profile_age := meta_age::integer;
          EXCEPTION WHEN others THEN profile_age := NULL; END;
          IF profile_age IS NULL OR profile_age < 18 THEN
             profile_age := NULL;
          END IF;
      END IF;

      INSERT INTO public.profiles (id, full_name, mobile, address, role, plan, age, latitude, longitude)
      VALUES ( new.id, meta_full_name, meta_mobile, meta_address, meta_role, meta_plan, profile_age, NULL, NULL );
  END IF;
  RETURN new;
END;
$$;

-- RPC function to find nearby users
CREATE OR REPLACE FUNCTION public.find_nearby_users(
    user_lat double precision,
    user_lng double precision,
    search_radius_km double precision,
    target_role text,
    exclude_user_id uuid
)
RETURNS TABLE (
    id uuid,
    full_name text,
    role text,
    latitude double precision,
    longitude double precision,
    distance_km double precision
)
LANGUAGE plpgsql
AS $$
DECLARE
    earth_radius_km double precision := 6371.0;
BEGIN
    IF user_lat IS NULL OR user_lng IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        p.id, p.full_name, p.role, p.latitude, p.longitude,
        earth_radius_km * 2 * asin(sqrt(
            sin(radians((p.latitude - user_lat) / 2))^2 +
            cos(radians(user_lat)) * cos(radians(p.latitude)) *
            sin(radians((p.longitude - user_lng) / 2))^2
        )) AS calculated_distance_km
    FROM
        public.profiles p
    WHERE
        p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND p.role = target_role
        AND p.id <> exclude_user_id
        AND (
            earth_radius_km * 2 * asin(sqrt(
                sin(radians((p.latitude - user_lat) / 2))^2 +
                cos(radians(user_lat)) * cos(radians(p.latitude)) *
                sin(radians((p.longitude - user_lng) / 2))^2
            ))
        ) < search_radius_km
    ORDER BY
        calculated_distance_km ASC;
END;
$$;

-- RPC function for Pet Owners to create a quick ride
CREATE OR REPLACE FUNCTION public.create_quick_ride(
    p_dog_id uuid,
    p_walk_datetime timestamp with time zone,
    p_pay_amount numeric,
    p_instructions text
)
RETURNS public.quick_rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_owner_id uuid;
    owner_profile public.profiles;
    new_ride public.quick_rides;
BEGIN
    current_owner_id := auth.uid();

    SELECT * INTO owner_profile FROM public.profiles WHERE id = current_owner_id AND role = 'owner';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User is not a pet owner or profile not found.';
    END IF;

    IF owner_profile.latitude IS NULL OR owner_profile.longitude IS NULL THEN
        RAISE EXCEPTION 'Pet owner location is not set in profile. Please update your address.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.dogs WHERE id = p_dog_id AND owner_id = current_owner_id) THEN
        RAISE EXCEPTION 'Invalid dog ID or dog does not belong to the current user.';
    END IF;

    IF p_pay_amount <= 0 THEN
        RAISE EXCEPTION 'Pay amount must be greater than zero.';
    END IF;
    
    IF p_walk_datetime <= now() THEN
        RAISE EXCEPTION 'Walk date and time must be in the future.';
    END IF;

    INSERT INTO public.quick_rides (
        owner_id, dog_id, walk_datetime, pay_amount, instructions,
        status, owner_latitude, owner_longitude
    )
    VALUES (
        current_owner_id, p_dog_id, p_walk_datetime, p_pay_amount, p_instructions,
        'pending_acceptance', owner_profile.latitude, owner_profile.longitude
    )
    RETURNING * INTO new_ride;

    RETURN new_ride;
END;
$$;

-- RPC function for Dog Walkers to get available quick rides (Updated to filter past rides)
CREATE OR REPLACE FUNCTION public.get_available_quick_rides(
    p_search_radius_km double precision DEFAULT 50.0
)
RETURNS TABLE (
    ride_id uuid,
    owner_id uuid,
    owner_full_name text,
    dog_id uuid,
    dog_name text,
    walk_datetime timestamp with time zone,
    pay_amount numeric,
    instructions text,
    distance_km double precision,
    owner_latitude double precision,
    owner_longitude double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_walker_id uuid;
    walker_profile public.profiles;
    earth_radius_km double precision := 6371.0;
BEGIN
    current_walker_id := auth.uid();

    SELECT * INTO walker_profile FROM public.profiles WHERE id = current_walker_id AND role = 'walker';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User is not a dog walker or profile not found.';
    END IF;

    IF walker_profile.latitude IS NULL OR walker_profile.longitude IS NULL THEN
        RAISE EXCEPTION 'Your location is not set. Please update your profile address.';
    END IF;

    RETURN QUERY
    SELECT
        qr.id AS ride_id,
        qr.owner_id,
        po.full_name AS owner_full_name,
        qr.dog_id,
        d.name AS dog_name,
        qr.walk_datetime,
        qr.pay_amount,
        qr.instructions,
        earth_radius_km * 2 * asin(sqrt(
            sin(radians((qr.owner_latitude - walker_profile.latitude) / 2))^2 +
            cos(radians(walker_profile.latitude)) * cos(radians(qr.owner_latitude)) *
            sin(radians((qr.owner_longitude - walker_profile.longitude) / 2))^2
        )) AS calculated_distance_km,
        qr.owner_latitude,
        qr.owner_longitude
    FROM
        public.quick_rides qr
    JOIN public.profiles po ON qr.owner_id = po.id
    JOIN public.dogs d ON qr.dog_id = d.id
    WHERE
        qr.status = 'pending_acceptance'
        AND qr.walk_datetime > now() -- Ensures only future rides are fetched
        AND qr.owner_id <> current_walker_id 
        AND (
            earth_radius_km * 2 * asin(sqrt(
                sin(radians((qr.owner_latitude - walker_profile.latitude) / 2))^2 +
                cos(radians(walker_profile.latitude)) * cos(radians(qr.owner_latitude)) *
                sin(radians((qr.owner_longitude - walker_profile.longitude) / 2))^2
            ))
        ) <= p_search_radius_km
    ORDER BY
        qr.walk_datetime ASC, 
        calculated_distance_km ASC;
END;
$$;

-- RPC function for Dog Walkers to accept a quick ride (Updated with time check)
CREATE OR REPLACE FUNCTION public.accept_quick_ride(
    p_ride_id uuid
)
RETURNS public.quick_rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_walker_id uuid;
    walker_profile public.profiles;
    accepted_ride public.quick_rides;
    target_ride public.quick_rides;
BEGIN
    current_walker_id := auth.uid();

    SELECT * INTO walker_profile FROM public.profiles WHERE id = current_walker_id AND role = 'walker';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User is not a dog walker or profile not found.';
    END IF;

    SELECT * INTO target_ride FROM public.quick_rides WHERE id = p_ride_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quick ride not found. Ride ID: %', p_ride_id;
    END IF;

    IF target_ride.owner_id = current_walker_id THEN
        RAISE EXCEPTION 'You cannot accept a ride you posted.';
    END IF;
    
    IF target_ride.walk_datetime <= now() THEN
        RAISE EXCEPTION 'This ride is no longer available as its start time has passed. Ride ID: %', p_ride_id;
    END IF;

    UPDATE public.quick_rides
    SET
        status = 'accepted',
        accepted_walker_id = current_walker_id,
        updated_at = timezone('utc'::text, now())
    WHERE
        id = p_ride_id AND status = 'pending_acceptance'
    RETURNING * INTO accepted_ride;

    IF accepted_ride IS NULL THEN
        RAISE EXCEPTION 'Quick ride could not be accepted. It might have been taken by another walker, cancelled, or its start time passed just before your attempt.';
    END IF;

    RETURN accepted_ride;
END;
$$;

-- RPC function for Pet Owners to cancel their quick ride
CREATE OR REPLACE FUNCTION public.cancel_quick_ride_owner(p_ride_id uuid)
RETURNS public.quick_rides 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    ride_record public.quick_rides;
    v_owner_id uuid;
    v_status public.quick_ride_status;
BEGIN
    SELECT owner_id, status INTO v_owner_id, v_status
    FROM public.quick_rides
    WHERE id = p_ride_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ride not found. Ride ID: %', p_ride_id;
    END IF;

    IF v_owner_id <> current_user_id THEN
        RAISE EXCEPTION 'Authorization failed. You are not the owner of this ride.';
    END IF;

    IF v_status <> 'pending_acceptance' THEN
        RAISE EXCEPTION 'Ride cannot be cancelled. Current status is "%", not "pending_acceptance".', v_status;
    END IF;

    UPDATE public.quick_rides
    SET
        status = 'cancelled_by_owner',
        updated_at = timezone('utc'::text, now())
    WHERE
        id = p_ride_id
        AND owner_id = current_user_id 
        AND status = 'pending_acceptance'
    RETURNING * INTO ride_record;

    IF ride_record IS NULL THEN
        RAISE EXCEPTION 'Failed to cancel ride. The ride might have been updated by another process simultaneously or no longer meets cancellation criteria at the moment of update.';
    END IF;

    RETURN ride_record;
END;
$$;

-- NEW RPC function for Dog Walkers to mark a Quick Ride as completed
CREATE OR REPLACE FUNCTION public.complete_quick_ride_walker(
    p_ride_id uuid
)
RETURNS public.quick_rides 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_walker_id uuid;
    ride_record public.quick_rides;
    v_accepted_walker_id uuid;
    v_status public.quick_ride_status;
BEGIN
    current_walker_id := auth.uid();

    SELECT accepted_walker_id, status INTO v_accepted_walker_id, v_status
    FROM public.quick_rides
    WHERE id = p_ride_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ride not found. Ride ID: %', p_ride_id;
    END IF;

    IF v_accepted_walker_id IS NULL OR v_accepted_walker_id <> current_walker_id THEN
        RAISE EXCEPTION 'Authorization failed. You are not the accepted walker for this ride.';
    END IF;

    IF v_status <> 'accepted' THEN
        RAISE EXCEPTION 'Ride cannot be marked as completed. Current status is "%", not "accepted".', v_status;
    END IF;

    UPDATE public.quick_rides
    SET
        status = 'completed',
        updated_at = timezone('utc'::text, now())
    WHERE
        id = p_ride_id
        AND accepted_walker_id = current_walker_id 
        AND status = 'accepted'
    RETURNING * INTO ride_record;

    IF ride_record IS NULL THEN
        RAISE EXCEPTION 'Failed to complete ride. The ride might have been updated by another process or no longer meets completion criteria.';
    END IF;

    RETURN ride_record;
END;
$$;


-- === Create Trigger ===
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- === Grant Permissions ===
GRANT usage ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;

GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.dogs TO authenticated;
GRANT ALL ON TABLE public.quick_rides TO authenticated; 
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.dogs TO service_role;
GRANT ALL ON TABLE public.quick_rides TO service_role;
GRANT ALL ON TABLE public.profiles TO postgres;
GRANT ALL ON TABLE public.dogs TO postgres;
GRANT ALL ON TABLE public.quick_rides TO postgres;
GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;
GRANT ALL ON TABLE public.dogs TO supabase_auth_admin;
GRANT ALL ON TABLE public.quick_rides TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.find_nearby_users(double precision, double precision, double precision, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_users(double precision, double precision, double precision, text, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_quick_ride(uuid, timestamp with time zone, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quick_ride(uuid, timestamp with time zone, numeric, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_available_quick_rides(double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_quick_rides(double precision) TO postgres;
GRANT EXECUTE ON FUNCTION public.accept_quick_ride(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quick_ride(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.cancel_quick_ride_owner(uuid) TO authenticated; 
GRANT EXECUTE ON FUNCTION public.cancel_quick_ride_owner(uuid) TO postgres; 
GRANT EXECUTE ON FUNCTION public.complete_quick_ride_walker(uuid) TO authenticated; -- NEW
GRANT EXECUTE ON FUNCTION public.complete_quick_ride_walker(uuid) TO postgres; -- NEW

-- === Set default privileges ===
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon;

-- === Add Indexes ===
-- Indexes for profiles and dogs are implicitly created for PRIMARY KEY and UNIQUE constraints.
-- Add other necessary indexes:

-- Indexes for quick_rides table
CREATE INDEX IF NOT EXISTS idx_quick_rides_status ON public.quick_rides(status);
CREATE INDEX IF NOT EXISTS idx_quick_rides_owner_id ON public.quick_rides(owner_id);
CREATE INDEX IF NOT EXISTS idx_quick_rides_accepted_walker_id ON public.quick_rides(accepted_walker_id);
CREATE INDEX IF NOT EXISTS idx_quick_rides_walk_datetime ON public.quick_rides(walk_datetime);
-- Note: A geospatial index on (owner_latitude, owner_longitude) would be beneficial if using PostGIS.
-- For now, the individual column indexes might offer some benefit.