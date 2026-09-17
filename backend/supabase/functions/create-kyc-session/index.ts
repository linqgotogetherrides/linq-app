import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.11.0';

const CASHFREE_APP_ID = Deno.env.get('CASHFREE_APP_ID') ?? '';
const CASHFREE_SECRET_KEY = Deno.env.get('CASHFREE_SECRET_KEY') ?? '';
const isProd = false; // set to true for production

const CASHFREE_BASE_URL = isProd 
  ? 'https://api.cashfree.com/verification' 
  : 'https://sandbox.cashfree.com/verification';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { type } = await req.json(); // e.g., 'AADHAAR', 'PAN', 'DL'

    // Call Cashfree to generate a verification session
    // NOTE: This is a pseudo-implementation based on standard Cashfree Verification APIs
    // The exact endpoint depends on whether you are doing offline aadhaar, PAN API, etc.
    // For a unified UI flow, Cashfree provides Identity Verification links
    
    const verificationId = `verify_${user.id}_${Date.now()}`;
    
    const response = await fetch(`${CASHFREE_BASE_URL}/verification-session`, {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verification_id: verificationId,
        return_url: 'linq://verification-success',
        notify_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/kyc-webhook`
      }),
    });

    const data = await response.json();
    
    return new Response(JSON.stringify({ verificationUrl: data.verification_url, verificationId }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
