// src/js/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Razorpay = require('razorpay');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase Admin Client
let supabaseAdmin = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

// Initialize Razorpay
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    process.exit(1);
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Plan configurations
const PLAN_DURATIONS = {
    'monthly': 30,
    'quarterly': 90,
    'annual': 365
};

const PLAN_AMOUNTS = {
    'monthly': 999,
    'quarterly': 2499,
    'annual': 9999
};

app.post('/create-razorpay-order', async (req, res) => {
    try {
        const { planName } = req.body;
        if (!PLAN_AMOUNTS[planName]) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }

        const options = {
            amount: PLAN_AMOUNTS[planName],
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
            notes: {
                planName
            }
        };

        const order = await razorpay.orders.create(options);
        
        if (!order) {
            return res.status(500).json({ error: 'Failed to create order' });
        }

        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.post('/verify-razorpay-payment', async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        planName,
        userId
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const generated_signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        if (!supabaseAdmin) {
            return res.status(500).json({ 
                success: false, 
                message: 'Database connection not available' 
            });
        }

        // Calculate subscription end date
        const now = new Date();
        let subscriptionEndDate = new Date(now);
        
        if (PLAN_DURATIONS[planName]) {
            subscriptionEndDate.setDate(now.getDate() + PLAN_DURATIONS[planName]);
        } else {
            subscriptionEndDate.setDate(now.getDate() + 1); // Default 1 day
        }

        const paymentRecord = {
            user_id: userId,
            razorpay_order_id,
            razorpay_payment_id,
            amount: PLAN_AMOUNTS[planName],
            plan_name: planName,
            status: 'success'
        };

        const { error: paymentInsertError } = await supabaseAdmin
            .from('payments')
            .insert([paymentRecord]);

        if (paymentInsertError) {
            return res.status(500).json({
                success: false,
                message: 'Failed to record payment in database'
            });
        }

        // Update user's subscription end date
        const { error: profileUpdateError } = await supabaseAdmin
            .from('user_profiles')
            .update({ subscription_ends_at: subscriptionEndDate.toISOString() })
            .eq('user_id', userId);

        if (profileUpdateError) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update subscription status'
            });
        }

        return res.json({
            success: true,
            message: 'Payment verified successfully'
        });
    }

    return res.status(400).json({
        success: false,
        message: 'Invalid payment verification'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);