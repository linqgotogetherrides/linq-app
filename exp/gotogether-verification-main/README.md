# GoTogetherRides Verification Prototype

Independent local prototype. It does not use the original LinQ website's Supabase credentials.

## Run with PowerShell
1. Install Node.js 22 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Put the **public anon/publishable key** for the separate verification Supabase project in `VITE_VERIFICATION_SUPABASE_ANON_KEY`. Do not put service-role keys or Cashfree secrets here.
5. Run `npm run dev` and open the local URL printed by Vite.

The app calls `https://iqxpcpyquntxqnoxnmxw.supabase.co/functions/v1/verify-pan`.
Use only Cashfree-approved sandbox test data. Never use real PAN/Aadhaar data in this prototype.
