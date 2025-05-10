// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  // Use the origin, not the full path
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }