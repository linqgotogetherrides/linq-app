-- Migration for Route-Aware Matching

-- 1. Add route geometry and metadata to the rides table
ALTER TABLE rides 
ADD COLUMN IF NOT EXISTS route_polyline text,
ADD COLUMN IF NOT EXISTS route_geom geography(LINESTRING),
ADD COLUMN IF NOT EXISTS total_distance_meters integer,
ADD COLUMN IF NOT EXISTS total_duration_seconds integer;

-- 2. Index the route_geom for fast spatial filtering
CREATE INDEX IF NOT EXISTS rides_route_geom_idx ON rides USING GIST (route_geom);

-- 3. Create the fast candidate retrieval RPC
CREATE OR REPLACE FUNCTION find_candidate_rides(
  passenger_pickup_lon float,
  passenger_pickup_lat float,
  passenger_dropoff_lon float,
  passenger_dropoff_lat float,
  max_deviation_meters float DEFAULT 5000
)
RETURNS SETOF rides AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM rides
  WHERE 
    -- 1. The pickup must be near the route
    ST_DWithin(
      route_geom,
      ST_SetSRID(ST_MakePoint(passenger_pickup_lon, passenger_pickup_lat), 4326)::geography,
      max_deviation_meters
    )
    AND
    -- 2. The dropoff must be near the route
    ST_DWithin(
      route_geom,
      ST_SetSRID(ST_MakePoint(passenger_dropoff_lon, passenger_dropoff_lat), 4326)::geography,
      max_deviation_meters
    )
    AND 
    -- 3. Exclude fully occupied rides and past rides (add business logic here)
    status = 'active'
    AND available_seats > 0;
END;
$$ LANGUAGE plpgsql;
