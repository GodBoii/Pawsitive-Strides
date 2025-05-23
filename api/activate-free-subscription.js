import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', error: 'Method not allowed' });
    return;
  }

  const { userId, planName } = req.body;
  if (!userId || !planName) {
    res.status(400).json({ status: 'error', error: 'Missing required fields.' });
    return;
  }

  // Set subscription_ends_at to 1 year from now
  let subscriptionEndDate = new Date();
  subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);

  try {
    // 1. Update the user's profile
    const { data: profileUpdateData, error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        subscription_status: 'active',
        plan: planName,
        subscription_ends_at: subscriptionEndDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('id, subscription_status, plan, subscription_ends_at')
      .single();

    if (profileUpdateError) {
      res.status(500).json({ status: 'error', error: 'Failed to update user profile.', details: profileUpdateError });
      return;
    }

    // 2. Log a free payment record for audit/history
    await supabase.from('payments').insert({
      user_id: userId,
      profile_id: userId,
      razorpay_order_id: null,
      razorpay_payment_id: null,
      razorpay_signature: null,
      amount: 0,
      currency: 'INR',
      status: 'free',
      plan_name: planName,
      payment_method: { type: 'free' },
      error_details: null,
    });

    res.status(200).json({ status: 'success', message: 'Subscription activated for free.', profile: profileUpdateData });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Server error during free activation.', details: err.message });
  }
} 