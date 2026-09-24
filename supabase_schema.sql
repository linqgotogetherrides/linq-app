-- Enable PostGIS extension for spatial data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create a User Profiles table to store Firebase Auth users
CREATE TABLE IF NOT EXISTS user_profiles (
  id text PRIMARY KEY, -- Firebase UID
  phone_number text,
  home_address text,
  office_address text,
  college_address text,
  saved_locations jsonb NOT NULL DEFAULT '{}'::jsonb,
  kyc_status text DEFAULT 'not_verified', -- 'not_verified', 'pending', 'verified'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create the Rides table
CREATE TABLE IF NOT EXISTS rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES user_profiles(id) NOT NULL,
  ride_type text NOT NULL, -- 'instant', 'daily', 'planned'
  
  -- Geographic locations using PostGIS points (longitude, latitude)
  pickup_location geography(POINT) NOT NULL,
  dropoff_location geography(POINT) NOT NULL,
  
  pickup_address text NOT NULL,
  dropoff_address text NOT NULL,
  
  -- Time schedules
  travel_time time,
  return_time time,
  travel_date date,
  selected_days int[], -- 0 (Mon) to 6 (Sun)
  
  -- Capacity
  available_seats int NOT NULL DEFAULT 6,
  occupied_seats int NOT NULL DEFAULT 1,
  
  -- Pricing & Preferences
  price_per_seat numeric,
  women_only boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for spatial queries to make radius searches fast
CREATE INDEX IF NOT EXISTS rides_pickup_geom_idx ON rides USING GIST (pickup_location);
CREATE INDEX IF NOT EXISTS rides_dropoff_geom_idx ON rides USING GIST (dropoff_location);

-- Function to find nearby rides within a given radius (in meters)
CREATE OR REPLACE FUNCTION find_nearby_rides(
  user_lon float, 
  user_lat float, 
  radius_meters float
)
RETURNS SETOF rides AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM rides
  WHERE ST_DWithin(
    pickup_location,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    radius_meters
  )
  ORDER BY pickup_location <-> ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
END;
$$ LANGUAGE plpgsql;
