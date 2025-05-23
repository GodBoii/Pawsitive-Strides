// src/js/server.js

require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const Razorpay = require('razorpay');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// --- Supabase Admin Client Initialization ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    });
    console.log("Supabase admin client initialized.");
} else {
    console.warn("Supabase URL or Service Role Key not configured in .env. Payment verification might not fully update database status.");
}

// --- Razorpay Instance Initialization ---
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("FATAL ERROR: Razorpay Key ID or Key Secret is not defined in .env file. Server cannot start properly.");
}
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});
console.log("Razorpay instance initialized.");

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- API Endpoints ---

// 1. Create Razorpay Order
app.post('/create-razorpay-order', async (req, res) => {
    const { amount, currency, receipt, notes } = req.body;

    if (!amount || !currency) {
        return res.status(400).json({ error: 'Amount and currency are required.' });
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid amount.' });
    }

    const options = {
        amount: Math.round(parseFloat(amount) * 100),
        currency: currency,
        receipt: receipt || `receipt_order_${Date.now()}`,
        notes: notes || {}
    };

    try {
        console.log("Attempting to create Razorpay order with options:", options);
        const order = await razorpayInstance.orders.create(options);
        if (!order) {
            console.error("Razorpay order creation returned null/undefined for options:", options);
            return res.status(500).json({ error: 'Error creating Razorpay order (Received no order object).' });
        }
        console.log("Razorpay order created successfully:", order);
        res.json(order);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        const errorMessage = error.error && error.error.description ? error.error.description : (error.message || 'Internal Server Error');
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: errorMessage, details: error.error });
    }
});

// 2. Verify Razorpay Payment and Update Supabase
app.post('/verify-razorpay-payment', async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        userId,
        planName,
        amount_paid_currency_unit,
        currency_paid
    } = req.body;

    console.log("Received for verification:", req.body);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId || !planName || amount_paid_currency_unit === undefined || !currency_paid) {
        return res.status(400).json({ status: 'failure', message: 'Missing required payment verification details.' });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    const body_string = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac('sha256', key_secret)
        .update(body_string)
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        console.log('Payment signature verification successful for order:', razorpay_order_id);

        if (!supabaseAdmin) {
            console.error("Supabase admin client not initialized. Cannot update database for order:", razorpay_order_id);
            return res.status(500).json({ status: 'failure', message: 'Payment verified, but server configuration error for DB update.' });
        }

        let paymentRecordId = null;
        let subscriptionEndDate = new Date();

        // Calculate subscription end date based on planName
        if (planName.toLowerCase().includes('monthly')) {
            subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        } else if (planName.toLowerCase().includes('annual')) {
            subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
        } else {
            console.warn(`Unknown plan duration for plan: ${planName}. Setting a default short expiry (e.g., 1 day).`);
            subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 1); // Fallback: 1 day for unknown plans
        }
        console.log(`Calculated subscription end date for plan "${planName}": ${subscriptionEndDate.toISOString()}`);


        try {
            // Step 1: Record the payment attempt/success in the 'payments' table
            const { data: paymentInsertData, error: paymentInsertError } = await supabaseAdmin
                .from('payments')
                .insert({
                    user_id: userId,
                    profile_id: userId,
                    razorpay_order_id: razorpay_order_id,
                    razorpay_payment_id: razorpay_payment_id,
                    razorpay_signature: razorpay_signature,
                    amount: parseFloat(amount_paid_currency_unit),
                    currency: currency_paid,
                    status: 'paid',
                    plan_name: planName,
                })
                .select('id')
                .single();

            if (paymentInsertError) {
                console.error('Supabase payment record insert error:', paymentInsertError, "for order:", razorpay_order_id);
            } else if (paymentInsertData) {
                paymentRecordId = paymentInsertData.id;
                console.log('Payment record created in Supabase with ID:', paymentRecordId, "for order:", razorpay_order_id);
            }

            // Step 2: Update the user's profile to active subscription and set subscription_ends_at
            const { data: profileUpdateData, error: profileUpdateError } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_status: 'active',
                    plan: planName,
                    subscription_ends_at: subscriptionEndDate.toISOString(), // *** ADDED THIS LINE ***
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select('id, subscription_status, plan, subscription_ends_at'); // *** UPDATED SELECT ***

            if (profileUpdateError) {
                console.error('Supabase profile update error after payment:', profileUpdateError, "for user:", userId, "order:", razorpay_order_id);
                if (paymentRecordId && supabaseAdmin) {
                    await supabaseAdmin.from('payments').update({ status: 'paid_db_profile_update_failed', error_details: { message: profileUpdateError.message, details: profileUpdateError } }).eq('id', paymentRecordId);
                }
                return res.status(500).json({ status: 'failure', message: 'Payment verified, but crucial database update failed.' });
            }

            console.log('Supabase profile updated successfully for user:', userId, "Details:", profileUpdateData);
            res.json({ status: 'success', orderId: razorpay_order_id, paymentId: razorpay_payment_id });

        } catch (dbError) {
            console.error('Database operation error during payment verification:', dbError, "for order:", razorpay_order_id);
            if (paymentRecordId && supabaseAdmin) {
                await supabaseAdmin.from('payments').update({ status: 'paid_db_general_error', error_details: { message: dbError.message, stack: dbError.stack } }).eq('id', paymentRecordId);
            }
            res.status(500).json({ status: 'failure', message: 'Payment verified, but server error during database operations.' });
        }

    } else {
        console.error('Payment signature verification failed: Signature mismatch for order:', razorpay_order_id);
         if (supabaseAdmin) {
            const { error: paymentInsertError } = await supabaseAdmin
                .from('payments')
                .insert({
                    user_id: userId,
                    profile_id: userId,
                    razorpay_order_id: razorpay_order_id,
                    razorpay_payment_id: razorpay_payment_id,
                    razorpay_signature: razorpay_signature,
                    amount: parseFloat(amount_paid_currency_unit),
                    currency: currency_paid,
                    status: 'verification_failed',
                    plan_name: planName,
                    error_details: { failure_reason: "Signature mismatch", expected_signature: expectedSignature }
                });
            if (paymentInsertError) console.error("Failed to log verification_failed payment:", paymentInsertError);
        }
        res.status(400).json({ status: 'failure', message: 'Invalid payment signature.' });
    }
});

// --- Root Route ---
app.get('/', (req, res) => {
    res.send('Pawsitive Strides Razorpay Backend is running!');
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Pawsitive Strides backend server listening at http://localhost:${port}`);
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
         console.warn("WARNING: Razorpay API keys are missing. Payment endpoints will fail.");
    }
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.warn("WARNING: Supabase URL or Service Role Key is missing. Database updates will fail.");
    }
});