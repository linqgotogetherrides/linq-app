-- =============================================================================
-- Real chat between matched riders
--
-- Until now the Messages tab and the chat screen read mockConversations and
-- mockMessages, which are empty arrays, so the feature showed nothing at all.
-- Chat is created by an accepted ride request, in both flows:
--
--   flow 1  seeker posts, a driver requests, the seeker accepts  -> chat opens
--   flow 2  rider posts, a seeker requests, the rider accepts   -> chat opens
--
-- In both cases the ride owner is `owner_id` and the requester is `member_id`,
-- which mirrors ride_requests, so the two directions share one path.
--
-- SECURITY NOTE
--   This app authenticates with Firebase UIDs and the Supabase anon key, so
--   auth.uid() is always NULL and RLS cannot tell who is calling. That is the
--   same gap already present on `rides`. Writes therefore go through
--   SECURITY DEFINER functions that take the caller id and verify membership,
--   matching the existing respond_to_ride_request() pattern. Reads are left
--   permissive so Realtime can stream, which means a client holding the anon
--   key could read conversations it is not part of. Closing that properly means
--   moving authentication to Supabase Auth; it is not something a policy alone
--   can fix.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- One thread per accepted request, so a replayed accept cannot duplicate it.
  CONSTRAINT conversations_request_unique UNIQUE (request_id),
  CONSTRAINT conversations_distinct_people CHECK (owner_id <> member_id)
);

CREATE INDEX IF NOT EXISTS conversations_owner_idx
  ON public.conversations (owner_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_member_idx
  ON public.conversations (member_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Open the thread when a request is accepted. A trigger means both flows get a
-- conversation without the client having to ask for one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_conversation_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    INSERT INTO public.conversations (ride_id, request_id, owner_id, member_id)
    VALUES (NEW.ride_id, NEW.owner_id, NEW.requester_id)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_request_opens_conversation ON public.ride_requests;
CREATE TRIGGER ride_request_opens_conversation
AFTER UPDATE ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION public.open_conversation_on_accept();

-- ---------------------------------------------------------------------------
-- Bump the thread on every message so the list can order by recency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_touches_conversation ON public.messages;
CREATE TRIGGER message_touches_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- Client access. No direct writes: everything goes through the functions below.
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_client_read ON public.conversations;
CREATE POLICY conversations_client_read ON public.conversations
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS messages_client_read ON public.messages;
CREATE POLICY messages_client_read ON public.messages
  FOR SELECT TO anon, authenticated USING (true);

-- Realtime streams new messages into the open thread.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = 'messages') THEN
    RAISE NOTICE 'messages already in supabase_realtime';
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- list_conversations: the caller's threads, newest activity first, with the
-- other person's profile, a preview and an unread count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_conversations(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.last_message_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      c.id,
      c.ride_id,
      c.last_message_at,
      (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END) AS other_user_id,
      (
        SELECT m.body FROM public.messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_message,
      (
        SELECT count(*)::int FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id <> p_user_id
          AND m.read_at IS NULL
      ) AS unread_count,
      (SELECT up.name FROM public.user_profiles up
        WHERE up.id = (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END)
      ) AS other_name,
      (SELECT up.avatar_url FROM public.user_profiles up
        WHERE up.id = (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END)
      ) AS other_avatar,
      (SELECT r.pickup_address FROM public.rides r WHERE r.id = c.ride_id) AS pickup_address,
      (SELECT r.dropoff_address FROM public.rides r WHERE r.id = c.ride_id) AS dropoff_address
    FROM public.conversations c
    WHERE c.owner_id = p_user_id OR c.member_id = p_user_id
  ) t;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- list_messages: verifies the caller is in the thread, then marks it read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_messages(
  p_conversation_id uuid,
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id
      AND (owner_id = p_user_id OR member_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT id, sender_id, body, created_at
    FROM public.messages
    WHERE conversation_id = p_conversation_id
  ) t;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> p_user_id
    AND read_at IS NULL;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- send_message: membership is checked, so a client cannot post into a thread it
-- is not part of, and empty bodies are rejected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_sender_id text,
  p_body text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_message public.messages%ROWTYPE;
  v_text text := btrim(coalesce(p_body, ''));
BEGIN
  IF p_sender_id IS NULL OR btrim(p_sender_id) = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_text = '' THEN
    RAISE EXCEPTION 'Message cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_text) > 2000 THEN
    RAISE EXCEPTION 'Message is too long' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id
      AND (owner_id = p_sender_id OR member_id = p_sender_id)
  ) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (p_conversation_id, p_sender_id, v_text)
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.list_conversations(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_messages(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_message(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_conversations(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_messages(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, text) TO anon, authenticated;

COMMIT;
