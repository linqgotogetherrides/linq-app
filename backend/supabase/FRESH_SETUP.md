# Fresh Supabase project setup

1. Create a new project in Supabase.
2. Open **SQL Editor** and run the repository root file `supabase_schema.sql` once.
3. Do **not** run `matching_migration.sql` or `saved_locations_migration.sql` on a fresh project; those files are for existing databases.
4. Ride requests, notifications, confirmed ride status, and realtime are included in `supabase_schema.sql`. For a project that already ran the earlier bootstrap, apply `backend/supabase/migrations/20260925120000_ride_requests_notifications.sql` with `supabase db push --linked`.
5. Copy the new project's URL and anon key into the frontend environment:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
6. Deploy the Edge Functions from `backend/supabase/functions/` and configure their secrets in the new project. Never put the service-role key in the frontend.
7. Configure Razorpay secrets only in Supabase:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` (the separate Razorpay webhook secret, not the API key secret)
8. Deploy `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-callback`, and `razorpay-webhook` from `backend/supabase/functions/`. The callback and webhook must be deployed with JWT verification disabled because Razorpay calls them without a Supabase user session.
9. The payment Edge Functions insert `created` rows and change them to `verified` only after signature and Razorpay server-side payment checks succeed. The frontend calls Supabase Functions directly and does not need the FastAPI payment endpoints or a backend service-role key.
10. The current client uses Firebase UIDs with the Supabase anon client, so the bootstrap script enables deliberately permissive anon/authenticated policies. Replace those policies with server-verified policies before production.

The old Supabase project/account cannot be deleted with SQL. Back it up first, then delete it from **Supabase Dashboard → Project Settings → General → Delete project**.

Razorpay Checkout.js must run in an HTTPS browser context. For local Expo web testing, use `npx expo start --tunnel --web` (or the deprecated `npx expo start --https --web`) and open the generated HTTPS URL; do not use `http://localhost:8081` for checkout.

## Razorpay Edge Function deployment

From the `backend` directory:

```bash
supabase login
supabase init
supabase link --project-ref lguesnuzpfievgufbmsz
supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy --no-verify-jwt razorpay-callback
supabase functions deploy --no-verify-jwt razorpay-webhook
```

Set the Razorpay webhook URL in the Razorpay dashboard to:

```text
https://lguesnuzpfievgufbmsz.supabase.co/functions/v1/razorpay-webhook
```

Subscribe it to `payment.captured` and `payment.failed`.
