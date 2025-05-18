import Razorpay from 'razorpay';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { amount, currency, receipt, notes } = req.body;

  if (!amount || !currency) {
    res.status(400).json({ error: 'Amount and currency are required.' });
    return;
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    res.status(400).json({ error: 'Invalid amount.' });
    return;
  }

  const options = {
    amount: Math.round(parseFloat(amount) * 100),
    currency: currency,
    receipt: receipt || `receipt_order_${Date.now()}`,
    notes: notes || {}
  };

  try {
    const razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpayInstance.orders.create(options);
    if (!order) {
      res.status(500).json({ error: 'Error creating Razorpay order (Received no order object).' });
      return;
    }
    res.status(200).json(order);
  } catch (error) {
    const errorMessage = error.error && error.error.description ? error.error.description : (error.message || 'Internal Server Error');
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: errorMessage, details: error.error });
  }
} 