import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client (Service Role Key)
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

  // Expect these fields from frontend
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    userId,
    planName,
    amount_paid_currency_unit,
    currency_paid
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId || !planName || amount_paid_currency_unit === undefined || !currency_paid) {
    res.status(400).json({ status: 'error', error: 'Missing required fields.' });
    return;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  const generated_signature = crypto
    .createHmac('sha256', secret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  // Prepare subscription end date
  let subscriptionEndDate = new Date();
  if (planName.toLowerCase().includes('monthly')) {
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
  } else if (planName.toLowerCase().includes('annual')) {
    subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
  } else {
    // fallback: 1 day for unknown plans
    subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 1);
  }

  if (generated_signature === razorpay_signature) {
    // Payment verified
    let paymentRecordId = null;
    try {
      // 1. Record the payment in payments table
      const { data: paymentInsertData, error: paymentInsertError } = await supabase
        .from('payments')
        .insert({
          user_id: userId,
          profile_id: userId,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          amount: parseFloat(amount_paid_currency_unit),
          currency: currency_paid,
          status: 'paid',
          plan_name: planName,
        })
        .select('id')
        .single();

      if (paymentInsertError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to record payment in database'
        });
      } else if (paymentInsertData) {
        paymentRecordId = paymentInsertData.id;
      }

      // 2. Update the user's profile
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
        // Update payment record with error
        if (paymentRecordId) {
          await supabase.from('payments').update({ status: 'paid_db_profile_update_failed', error_details: { message: profileUpdateError.message, details: profileUpdateError } }).eq('id', paymentRecordId);
        }
        res.status(500).json({ status: 'error', error: 'Payment verified, but database update failed.' });
        return;
      }

      res.status(200).json({ status: 'success', message: 'Payment verified and subscription updated.' });
    } catch (dbError) {
      // Update payment record with general error
      if (paymentRecordId) {
        await supabase.from('payments').update({ status: 'paid_db_general_error', error_details: { message: dbError.message, stack: dbError.stack } }).eq('id', paymentRecordId);
      }
      res.status(500).json({ status: 'error', error: 'Payment verified, but server error during database operations.' });
    }
  } else {
    // Signature mismatch
    // Log failed attempt in payments table
    await supabase.from('payments').insert({
      user_id: userId,
      profile_id: userId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount: parseFloat(amount_paid_currency_unit),
      currency: currency_paid,
      status: 'verification_failed',
      plan_name: planName,
      error_details: { failure_reason: 'Signature mismatch', expected_signature: generated_signature }
    });
    res.status(400).json({ status: 'error', error: 'Invalid signature.' });
  }
}