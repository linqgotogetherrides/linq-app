-- Migration: Intelligent Route Corridor & Multi-Factor Ride Pooling Matches
-- Description:
-- 1. Restores true PostGIS route-corridor candidate searching (picking up passengers en-route).
-- 2. Adds `set_ride_route_geometry` RPC to convert GeoJSON into native PostGIS LINESTRING geography.
-- 3. Adds `find_pooling_matches` RPC with multi-parameter scoring (corridor overlap, direction, time, driver rating, verification).

BEGIN;

-- 1. Helper to store route geometry and polyline on ride creation/update
CREATE OR REPLACE FUNCTION public.set_ride_route_geometry(
  p_ride_id uuid,
  p_polyline text,
  p_geojson text,
  p_distance_meters integer,
  p_duration_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.rides
  SET
    route_polyline = p_polyline,
    route_geom = CASE 
      WHEN p_geojson IS NOT NULL AND length(trim(p_geojson)) > 10 
      THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geojson), 4326)::geography 
      ELSE route_geom 
    END,
    total_distance_meters = COALESCE(p_distance_meters, total_distance_meters),
    total_duration_seconds = COALESCE(p_duration_seconds, total_duration_seconds),
    updated_at = now()
  WHERE id = p_ride_id;
  RETURN FOUND;
END;
$$;

-- 2. Restore and enhance find_candidate_rides for corridor discovery
CREATE OR REPLACE FUNCTION public.find_candidate_rides(
  passenger_pickup_lon double precision,
  passenger_pickup_lat double precision,
  passenger_dropoff_lon double precision,
  passenger_dropoff_lat double precision,
  max_deviation_meters double precision DEFAULT 5000
)
RETURNS SETOF public.rides
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  passenger_origin geography(POINT, 4326) :=
    ST_SetSRID(ST_MakePoint(passenger_pickup_lon, passenger_pickup_lat), 4326)::geography;
  passenger_destination geography(POINT, 4326) :=
    ST_SetSRID(ST_MakePoint(passenger_dropoff_lon, passenger_dropoff_lat), 4326)::geography;
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.rides AS r
  WHERE r.status IN ('active', 'confirmed')
    AND r.available_seats > 0
    AND (
      -- Route corridor matching: passenger pickup & dropoff must be near the route line
      (
        r.route_geom IS NOT NULL
        AND ST_DWithin(r.route_geom, passenger_origin, max_deviation_meters)
        AND ST_DWithin(r.route_geom, passenger_destination, max_deviation_meters)
        -- Passenger must travel in the forward direction along the driver's route
        AND ST_LineLocatePoint(r.route_geom::geometry, passenger_origin::geometry) <
            ST_LineLocatePoint(r.route_geom::geometry, passenger_destination::geometry)
      )
      OR
      -- Fallback if route_geom is not yet calculated: endpoint proximity
      (
        r.route_geom IS NULL
        AND ST_DWithin(r.pickup_location::geography, passenger_origin, max_deviation_meters)
        AND ST_DWithin(r.dropoff_location::geography, passenger_destination, max_deviation_meters)
      )
    )
  ORDER BY
    CASE 
      WHEN r.route_geom IS NOT NULL THEN r.route_geom <-> passenger_origin
      ELSE r.pickup_location::geography <-> passenger_origin
    END;
END;
$$;

-- 3. Comprehensive High-Performance Pooling Matching RPC
DROP FUNCTION IF EXISTS public.find_pooling_matches(double precision, double precision, double precision, double precision, text, date, integer[], integer, boolean, double precision, text);

CREATE OR REPLACE FUNCTION public.find_pooling_matches(
  p_pickup_lon double precision,
  p_pickup_lat double precision,
  p_dropoff_lon double precision,
  p_dropoff_lat double precision,
  p_travel_time text DEFAULT NULL,
  p_travel_date date DEFAULT NULL,
  p_selected_days integer[] DEFAULT NULL,
  p_seats_needed integer DEFAULT 1,
  p_women_only boolean DEFAULT false,
  p_max_deviation_meters double precision DEFAULT 5000,
  p_exclude_user_id text DEFAULT NULL
)
RETURNS TABLE (
  ride_id uuid,
  user_id text,
  ride_type text,
  pickup_address text,
  dropoff_address text,
  pickup_lon double precision,
  pickup_lat double precision,
  dropoff_lon double precision,
  dropoff_lat double precision,
  travel_time time,
  return_time time,
  travel_date date,
  selected_days smallint[],
  available_seats integer,
  occupied_seats integer,
  price_per_seat numeric(10, 2),
  women_only boolean,
  vehicle_kind text,
  vehicle_model text,
  vehicle_plate text,
  status text,
  route_polyline text,
  total_distance_meters integer,
  total_duration_seconds integer,
  co2_saved_kg numeric(12, 3),
  created_at timestamptz,
  -- Creator profile details
  creator_name text,
  creator_phone text,
  creator_gender text,
  creator_avatar_url text,
  creator_rating numeric(3, 2),
  creator_total_trips integer,
  creator_verification_status text,
  -- Match scoring metrics
  match_score integer,
  match_type text,
  pickup_distance_m integer,
  dropoff_distance_m integer,
  shared_distance_km numeric(8, 2),
  detour_distance_km numeric(8, 2),
  time_diff_minutes integer,
  match_explanation text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_pickup geography(POINT, 4326) :=
    ST_SetSRID(ST_MakePoint(p_pickup_lon, p_pickup_lat), 4326)::geography;
  v_dropoff geography(POINT, 4326) :=
    ST_SetSRID(ST_MakePoint(p_dropoff_lon, p_dropoff_lat), 4326)::geography;
  v_direct_dist_km numeric := (ST_Distance(v_pickup, v_dropoff) / 1000.0);
  v_req_time time := NULL;
BEGIN
  IF p_travel_time IS NOT NULL AND length(trim(p_travel_time)) > 0 THEN
    BEGIN
      v_req_time := p_travel_time::time;
    EXCEPTION WHEN OTHERS THEN
      v_req_time := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH candidate_rows AS (
    SELECT
      r.id AS r_id,
      r.user_id AS r_user_id,
      r.ride_type AS r_ride_type,
      r.pickup_address AS r_pickup_address,
      r.dropoff_address AS r_dropoff_address,
      ST_X(r.pickup_location::geometry) AS r_pickup_lon,
      ST_Y(r.pickup_location::geometry) AS r_pickup_lat,
      ST_X(r.dropoff_location::geometry) AS r_dropoff_lon,
      ST_Y(r.dropoff_location::geometry) AS r_dropoff_lat,
      r.travel_time AS r_travel_time,
      r.return_time AS r_return_time,
      r.travel_date AS r_travel_date,
      r.selected_days AS r_selected_days,
      r.available_seats AS r_available_seats,
      r.occupied_seats AS r_occupied_seats,
      r.price_per_seat AS r_price_per_seat,
      r.women_only AS r_women_only,
      r.vehicle_kind AS r_vehicle_kind,
      r.vehicle_model AS r_vehicle_model,
      r.vehicle_plate AS r_vehicle_plate,
      r.status AS r_status,
      r.route_polyline AS r_route_polyline,
      r.total_distance_meters AS r_total_distance_meters,
      r.total_duration_seconds AS r_total_duration_seconds,
      r.co2_saved_kg AS r_co2_saved_kg,
      r.created_at AS r_created_at,
      u.name AS u_name,
      u.phone_number AS u_phone,
      u.gender AS u_gender,
      u.avatar_url AS u_avatar,
      u.rating AS u_rating,
      u.total_trips AS u_trips,
      u.verification_status AS u_verification,
      -- Proximity calculations
      ROUND(CASE 
        WHEN r.route_geom IS NOT NULL THEN ST_Distance(r.route_geom, v_pickup)
        ELSE ST_Distance(r.pickup_location::geography, v_pickup)
      END)::integer AS calc_pickup_dist_m,
      ROUND(CASE 
        WHEN r.route_geom IS NOT NULL THEN ST_Distance(r.route_geom, v_dropoff)
        ELSE ST_Distance(r.dropoff_location::geography, v_dropoff)
      END)::integer AS calc_dropoff_dist_m,
      -- Direction along route (0.0 to 1.0)
      CASE 
        WHEN r.route_geom IS NOT NULL THEN ST_LineLocatePoint(r.route_geom::geometry, v_pickup::geometry)
        ELSE 0.0
      END AS f_pickup,
      CASE 
        WHEN r.route_geom IS NOT NULL THEN ST_LineLocatePoint(r.route_geom::geometry, v_dropoff::geometry)
        ELSE 1.0
      END AS f_dropoff
    FROM public.rides r
    LEFT JOIN public.user_profiles u ON u.id = r.user_id
    WHERE r.status IN ('active', 'confirmed')
      AND r.available_seats >= COALESCE(p_seats_needed, 1)
      AND (p_exclude_user_id IS NULL OR r.user_id != p_exclude_user_id)
      -- Women-only filter: if passenger or driver requested women-only, driver must be female
      AND (
        (COALESCE(p_women_only, false) = false AND COALESCE(r.women_only, false) = false)
        OR (u.gender = 'female')
      )
      -- Commute days filter: if selected days provided for a daily ride, verify intersection
      AND (
        p_selected_days IS NULL
        OR r.ride_type != 'daily'
        OR r.selected_days IS NULL
        OR (r.selected_days && p_selected_days::smallint[])
      )
      -- Date filter: if date provided for instant/planned ride, match date
      AND (
        p_travel_date IS NULL
        OR r.ride_type = 'daily'
        OR r.travel_date IS NULL
        OR r.travel_date = p_travel_date
      )
      -- Spatial filter: within max deviation of corridor or endpoints
      AND (
        (
          r.route_geom IS NOT NULL
          AND ST_DWithin(r.route_geom, v_pickup, p_max_deviation_meters)
          AND ST_DWithin(r.route_geom, v_dropoff, p_max_deviation_meters)
        )
        OR
        (
          r.route_geom IS NULL
          AND ST_DWithin(r.pickup_location::geography, v_pickup, p_max_deviation_meters)
          AND ST_DWithin(r.dropoff_location::geography, v_dropoff, p_max_deviation_meters)
        )
      )
  ),
  scored_rows AS (
    SELECT
      c.*,
      -- Reject wrong direction along route
      (c.f_pickup < c.f_dropoff) AS valid_direction,
      -- Shared distance along driver's route
      ROUND(
        CASE 
          WHEN c.f_dropoff > c.f_pickup AND c.r_total_distance_meters IS NOT NULL
          THEN ((c.f_dropoff - c.f_pickup) * c.r_total_distance_meters / 1000.0)
          ELSE v_direct_dist_km
        END,
        2
      ) AS calc_shared_km,
      -- Detour km
      ROUND(((c.calc_pickup_dist_m + c.calc_dropoff_dist_m) / 1000.0), 2) AS calc_detour_km,
      -- Time difference in minutes
      CASE 
        WHEN v_req_time IS NOT NULL AND c.r_travel_time IS NOT NULL THEN
          LEAST(
            abs(EXTRACT(EPOCH FROM (c.r_travel_time - v_req_time))/60)::integer,
            1440 - abs(EXTRACT(EPOCH FROM (c.r_travel_time - v_req_time))/60)::integer
          )
        ELSE NULL
      END AS calc_time_diff_min
    FROM candidate_rows c
  ),
  final_scored AS (
    SELECT
      s.*,
      -- Scoring Engine (0-100)
      GREATEST(10, LEAST(100, ROUND(
        100.0
        -- Detour penalty (up to 30 points)
        - LEAST(30.0, (s.calc_detour_km / 5.0) * 30.0)
        -- Proximity bonuses / penalties
        + CASE WHEN s.calc_pickup_dist_m <= 800 THEN 5.0 WHEN s.calc_pickup_dist_m > 3000 THEN -10.0 ELSE 0.0 END
        + CASE WHEN s.calc_dropoff_dist_m <= 800 THEN 5.0 WHEN s.calc_dropoff_dist_m > 3000 THEN -10.0 ELSE 0.0 END
        -- Time delta penalty
        - CASE 
            WHEN s.calc_time_diff_min IS NULL THEN 0.0
            WHEN s.calc_time_diff_min <= 15 THEN 0.0
            WHEN s.calc_time_diff_min <= 30 THEN 5.0
            WHEN s.calc_time_diff_min <= 60 THEN 15.0
            WHEN s.calc_time_diff_min <= 120 THEN 25.0
            ELSE 40.0
          END
        -- Trust and verification bonus (+8)
        + CASE WHEN s.u_verification = 'verified' THEN 8.0 ELSE 0.0 END
        -- High rating bonus (+5)
        + CASE WHEN s.u_rating >= 4.7 THEN 5.0 WHEN s.u_rating >= 4.0 THEN 2.0 ELSE 0.0 END
        -- Penalty for wrong direction
        - CASE WHEN s.valid_direction = false THEN 50.0 ELSE 0.0 END
      )))::integer AS computed_score
    FROM scored_rows s
    WHERE s.valid_direction = true OR s.r_route_polyline IS NULL
  )
  SELECT
    f.r_id AS ride_id,
    f.r_user_id AS user_id,
    f.r_ride_type AS ride_type,
    f.r_pickup_address AS pickup_address,
    f.r_dropoff_address AS dropoff_address,
    f.r_pickup_lon AS pickup_lon,
    f.r_pickup_lat AS pickup_lat,
    f.r_dropoff_lon AS dropoff_lon,
    f.r_dropoff_lat AS dropoff_lat,
    f.r_travel_time AS travel_time,
    f.r_return_time AS return_time,
    f.r_travel_date AS travel_date,
    f.r_selected_days AS selected_days,
    f.r_available_seats AS available_seats,
    f.r_occupied_seats AS occupied_seats,
    f.r_price_per_seat AS price_per_seat,
    f.r_women_only AS women_only,
    f.r_vehicle_kind AS vehicle_kind,
    f.r_vehicle_model AS vehicle_model,
    f.r_vehicle_plate AS vehicle_plate,
    f.r_status AS status,
    f.r_route_polyline AS route_polyline,
    f.r_total_distance_meters AS total_distance_meters,
    f.r_total_duration_seconds AS total_duration_seconds,
    f.r_co2_saved_kg AS co2_saved_kg,
    f.r_created_at AS created_at,
    f.u_name AS creator_name,
    f.u_phone AS creator_phone,
    f.u_gender AS creator_gender,
    f.u_avatar AS creator_avatar_url,
    f.u_rating AS creator_rating,
    f.u_trips AS creator_total_trips,
    f.u_verification AS creator_verification_status,
    f.computed_score AS match_score,
    CASE 
      WHEN f.computed_score >= 80 THEN 'exact'
      WHEN f.computed_score >= 45 THEN 'nearby'
      ELSE 'other'
    END AS match_type,
    f.calc_pickup_dist_m AS pickup_distance_m,
    f.calc_dropoff_dist_m AS dropoff_distance_m,
    f.calc_shared_km AS shared_distance_km,
    f.calc_detour_km AS detour_distance_km,
    f.calc_time_diff_min AS time_diff_minutes,
    CASE
      WHEN f.computed_score >= 85 AND f.calc_pickup_dist_m <= 500 AND f.u_verification = 'verified'
        THEN 'Top match • Direct corridor pickup • Verified driver'
      WHEN f.computed_score >= 80
        THEN 'High match • Shared route corridor with minimal detour'
      WHEN f.calc_time_diff_min IS NOT NULL AND f.calc_time_diff_min <= 15
        THEN 'Close departure time • Within 15 minutes of your schedule'
      WHEN f.calc_pickup_dist_m <= 1000
        THEN 'Pickup is within 1 km of driver corridor'
      ELSE 'Shares part of your journey along this route'
    END AS match_explanation
  FROM final_scored f
  ORDER BY f.computed_score DESC, f.calc_pickup_dist_m ASC, f.r_created_at DESC;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.set_ride_route_geometry(uuid, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_candidate_rides(double precision, double precision, double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_pooling_matches(double precision, double precision, double precision, double precision, text, date, integer[], integer, boolean, double precision, text) TO anon, authenticated;

COMMIT;
