// supabase/functions/get-maps-key/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts' // We'll create this shared file
serve(async (req) => {
// 1. Handle CORS preflight requests
if (req.method === 'OPTIONS') {
return new Response('ok', { headers: corsHeaders })
}
try {
// 2. Create Supabase admin client to verify user auth
//    Note: Use service_role key for auth checks within functions
//    Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your project secrets/env vars
//    (SERVICE_ROLE_KEY is different from ANON_KEY)
const supabaseAdmin = createClient(
Deno.env.get('SUPABASE_URL') ?? '',
Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key
{
global: { headers: { Authorization: req.headers.get('Authorization')! } }
}
);
// 3. Get user details from the request Authorization header
const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();

if (userError || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized: User not authenticated' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 4. Retrieve the Google Maps API Key from secrets
const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

if (!apiKey) {
  // Don't expose details, return a generic server error
  return new Response(JSON.stringify({ error: 'Server configuration error' }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 5. Return the key securely
return new Response(JSON.stringify({ apiKey: apiKey }), { // Send key in JSON object
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  status: 200,
});

} catch (error) {
return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
status: 500,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
})