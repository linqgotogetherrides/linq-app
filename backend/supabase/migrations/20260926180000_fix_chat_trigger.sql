-- =============================================================================
-- Fix: open_conversation_on_accept() was missing an INSERT value
--
-- The trigger declared four target columns but supplied three:
--
--   INSERT INTO public.conversations (ride_id, request_id, owner_id, member_id)
--   VALUES (NEW.ride_id, NEW.owner_id, NEW.requester_id)   -- request_id missing
--
-- Postgres rejected it with 42601 "INSERT has more target columns than
-- expressions", and because the trigger is AFTER UPDATE inside
-- respond_to_ride_request(), the error rolled back the whole acceptance. The
-- ride request stayed 'pending' and no thread was ever created, so accepting a
-- request failed outright.
--
-- The intended value for request_id is NEW.id, the request being accepted.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.open_conversation_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    INSERT INTO public.conversations (ride_id, request_id, owner_id, member_id)
    VALUES (NEW.ride_id, NEW.id, NEW.owner_id, NEW.requester_id)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
