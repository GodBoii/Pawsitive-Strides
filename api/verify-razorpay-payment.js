import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ error: 'Missing required fields.' });
    return;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  const generated_signature = crypto
    .createHmac('sha256', secret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generated_signature === razorpay_signature) {
    res.status(200).json({ success: true, message: 'Payment verified.' });
  } else {
    res.status(400).json({ success: false, error: 'Invalid signature.' });
  }
} 