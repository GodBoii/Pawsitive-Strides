// D:\Pawsitive Strides 2\src\js\signup.js
// Signup functionality for Pawsitive Strides (Trigger-based profile + Razorpay Payment)
const backendBaseUrl = 'http://192.168.1.2:3000';

document.addEventListener('DOMContentLoaded', () => {
    // Initializing Supabase client
    const _supabase = window.pawsitiveCommon.createSupabaseClient();
    console.log('Supabase Initialized (Signup Page)');

    // Check if already logged in
    window.pawsitiveCommon.requireNoAuth(_supabase);

    // DOM Elements
    const planSelectionSection = document.getElementById('plan-selection');
    const registrationFormSection = document.getElementById('registration-form-section');
    const signupForm = document.getElementById('signup-form');
    const selectPlanButtons = document.querySelectorAll('.select-plan-btn');
    const backToPlansButton = document.getElementById('back-to-plans');
    const selectedPlanInput = document.getElementById('selected-plan');
    const userRoleInput = document.getElementById('user-role');
    const registrationTitle = document.getElementById('registration-title');
    const ageFieldWalker = document.getElementById('age-field-walker');
    const ageInputWalker = document.getElementById('age-walker');
    const successMessage = signupForm.querySelector('.success-message');
    const errorMessage = signupForm.querySelector('.error-message');
    const signupBtn = signupForm.querySelector('.signup-btn');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const mobileInput = document.getElementById('mobile');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const addressInput = document.getElementById('address');

    // UI Logic for plan selection and form toggling (remains the same)
    selectPlanButtons.forEach(button => {
        button.addEventListener('click', () => {
            selectedPlanInput.value = button.dataset.plan;
            userRoleInput.value = button.dataset.role;
            const isWalker = button.dataset.role === 'walker';
            registrationTitle.textContent = isWalker ? 'Create Dog Walker Account' : 'Create Pet Owner Account';
            ageFieldWalker.classList.toggle('hidden', !isWalker);
            ageInputWalker.required = isWalker;
            planSelectionSection.classList.add('fade-leave-to', 'hidden');
            registrationFormSection.classList.remove('hidden');
            registrationFormSection.classList.add('fade-enter-active');
            setTimeout(() => registrationFormSection.classList.remove('fade-enter-active'), 500);
            window.scrollTo({ top: registrationFormSection.offsetTop - 100, behavior: 'smooth' });
        });
    });

    backToPlansButton.addEventListener('click', () => {
        registrationFormSection.classList.add('fade-leave-to');
        setTimeout(() => {
            registrationFormSection.classList.add('hidden');
            registrationFormSection.classList.remove('fade-leave-to');
            planSelectionSection.classList.remove('hidden', 'fade-leave-to');
            planSelectionSection.classList.add('fade-enter-active');
            signupForm.reset();
            errorMessage.classList.add('hidden');
            errorMessage.textContent = '';
            successMessage.classList.add('hidden');
            successMessage.textContent = '';
            ageFieldWalker.classList.add('hidden');
            ageInputWalker.required = false;
        }, 300);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // --- Form Submission with Razorpay Integration ---
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
        successMessage.classList.add('hidden');
        successMessage.textContent = '';
        signupBtn.textContent = 'Processing...';
        signupBtn.disabled = true;

        // Validation
        if (passwordInput.value !== confirmPasswordInput.value) {
            errorMessage.textContent = 'Passwords do not match.';
            errorMessage.classList.remove('hidden');
            confirmPasswordInput.focus();
            signupBtn.textContent = 'Create Account & Proceed to Pay';
            signupBtn.disabled = false;
            return;
        }
        const role = userRoleInput.value;
        if (role === 'walker' && (!ageInputWalker.value || parseInt(ageInputWalker.value) < 18)) {
            errorMessage.textContent = 'Walkers must be at least 18 years old.';
            errorMessage.classList.remove('hidden');
            ageInputWalker.focus();
            signupBtn.textContent = 'Create Account & Proceed to Pay';
            signupBtn.disabled = false;
            return;
        }

        const planName = selectedPlanInput.value;
        let amountInPrimaryUnit; // e.g., 199 for INR 199
        switch (planName) {
            case 'owner_monthly': amountInPrimaryUnit = 199; break;
            case 'owner_annual': amountInPrimaryUnit = 499; break;
            case 'walker_monthly': amountInPrimaryUnit = 19; break;
            default:
                errorMessage.textContent = 'Invalid plan selected. Please go back and select a plan.';
                errorMessage.classList.remove('hidden');
                signupBtn.textContent = 'Create Account & Proceed to Pay';
                signupBtn.disabled = false;
                return;
        }

        const userDataForMeta = {
            full_name: nameInput.value.trim(),
            mobile: mobileInput.value.trim(),
            address: addressInput.value.trim(),
            user_role: role,
            selected_plan: planName,
            age: (role === 'walker' && ageInputWalker.value) ? parseInt(ageInputWalker.value) : null
        };

        let authResultData; // To store Supabase auth result

        try {
            // Step 1: Create Supabase Auth User (profile created by trigger with 'pending_payment')
            console.log("Attempting Supabase signUp with metadata:", userDataForMeta);
            const { data, error: signUpError } = await _supabase.auth.signUp({
                email: emailInput.value.trim(),
                password: passwordInput.value,
                options: {
                    data: userDataForMeta
                }
            });

            if (signUpError) throw signUpError;
            if (!data.user) throw new Error("User not created in Supabase, cannot proceed to payment.");
            
            authResultData = data;
            console.log('Supabase user created/signed up:', authResultData.user);

            // Step 2: Create Razorpay Order by calling your backend
            signupBtn.textContent = 'Preparing Payment...';
            console.log('Calling backend to create Razorpay order...');
            const orderResponse = await fetch(`${backendBaseUrl}/create-razorpay-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amountInPrimaryUnit, // Send amount in primary unit (e.g., 199)
                    currency: 'INR',
                    receipt: `ps_ord_${Date.now()}`, // "ps" for Pawsitive Strides, "ord" for order
                    notes: {
                        userId: authResultData.user.id,
                        email: emailInput.value.trim(),
                        plan: planName,
                        signup_flow: "Pawsitive Strides Web"
                    }
                })
            });

            if (!orderResponse.ok) {
                const errData = await orderResponse.json();
                console.error("Error from /create-razorpay-order:", errData);
                throw new Error(errData.error || `Failed to create Razorpay order: ${orderResponse.statusText}`);
            }
            const razorpayOrder = await orderResponse.json();
            console.log('Razorpay order created by backend:', razorpayOrder);
            if (!razorpayOrder || !razorpayOrder.id) {
                throw new Error("Invalid order response from backend.");
            }

            // Step 3: Open Razorpay Checkout
            signupBtn.textContent = 'Redirecting to Payment...';
            const options = {
                key: "rzp_test_E5YJG4Db212xad", // Your public Razorpay Key ID
                amount: razorpayOrder.amount,   // Amount from the backend's order creation response (in paise)
                currency: razorpayOrder.currency,
                name: "Pawsitive Strides",
                description: `Subscription for ${planName.replace(/_/g, ' ')} Plan`,
                order_id: razorpayOrder.id, // From backend's Razorpay order creation
                handler: async function (response) {
                    signupBtn.textContent = 'Verifying Payment...';
                    signupBtn.disabled = true; // Keep disabled during verification
                    console.log("Razorpay payment successful:", response);
                    try {
                        console.log('Calling backend to verify Razorpay payment...');
                        const verificationRes = await fetch(`${backendBaseUrl}/verify-razorpay-payment`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                                userId: authResultData.user.id,
                                planName: planName,
                                amount_paid_currency_unit: amountInPrimaryUnit, // Original amount in INR
                                currency_paid: 'INR'
                            })
                        });

                        const verificationData = await verificationRes.json();
                        console.log("Backend verification response:", verificationData);

                        if (verificationRes.ok && verificationData.status === 'success') {
                            successMessage.textContent = 'Sign up & Payment Successful! Your subscription is active. Please check your email to verify your account, then you can log in.';
                            successMessage.classList.remove('hidden');
                            errorMessage.classList.add('hidden');
                            signupForm.reset();
                            // Go back to plan selection or a dedicated success message area
                            registrationFormSection.classList.add('fade-leave-to');
                            setTimeout(() => {
                                registrationFormSection.classList.add('hidden');
                                registrationFormSection.classList.remove('fade-leave-to');
                                planSelectionSection.classList.remove('hidden', 'fade-leave-to');
                                planSelectionSection.classList.add('fade-enter-active');
                                setTimeout(() => planSelectionSection.classList.remove('fade-enter-active'), 500);
                                // Consider redirect to login after a few seconds or provide login link clearly
                                // setTimeout(() => { window.location.href = 'login.html'; }, 7000);
                            }, 500);
                        } else {
                            throw new Error(verificationData.message || 'Payment verification failed by backend.');
                        }
                    } catch (verificationError) {
                        console.error('Payment verification fetch/logic error:', verificationError);
                        errorMessage.textContent = `Payment was processed, but verification failed: ${verificationError.message}. Please contact support with Order ID: ${response.razorpay_order_id}.`;
                        errorMessage.classList.remove('hidden');
                        successMessage.classList.add('hidden');
                    } finally {
                        // Button is re-enabled only if there was a final error or if flow completes to allow retry from plan selection
                         signupBtn.textContent = 'Create Account & Proceed to Pay';
                         signupBtn.disabled = false; // Re-enable for retry if needed, or if user stays on page.
                    }
                },
                prefill: {
                    name: nameInput.value.trim(),
                    email: emailInput.value.trim(),
                    contact: mobileInput.value.trim()
                },
                notes: {
                    plan_selected: planName,
                    supabase_user_id: authResultData.user.id, // Good for cross-referencing in Razorpay dashboard notes
                    source_website: "Pawsitive Strides Signup"
                },
                theme: {
                    color: "#059669" // Emerald-600
                },
                modal: {
                    ondismiss: function() {
                        console.log('Razorpay checkout modal dismissed.');
                        // Only re-enable the button if it was truly dismissed without an attempt
                        // If a payment attempt was made and failed, the 'payment.failed' handler should manage the button state.
                        if (signupBtn.textContent === 'Redirecting to Payment...') { // Check if it was before an attempt
                             signupBtn.textContent = 'Create Account & Proceed to Pay';
                             signupBtn.disabled = false;
                             errorMessage.textContent = 'Payment process was cancelled.';
                             errorMessage.classList.remove('hidden');
                        }
                    }
                }
            };

            const rzp = new Razorpay(options);

            rzp.on('payment.failed', function (response) {
                console.error('Razorpay payment.failed event:', response.error);
                let detailedError = `Payment Failed: ${response.error.description || 'Unknown Razorpay Error'}`;
                if (response.error.code) detailedError += ` (Code: ${response.error.code})`;
                if (response.error.reason) detailedError += ` Reason: ${response.error.reason}`;
                if (response.error.metadata && response.error.metadata.order_id) {
                     detailedError += `. Order ID: ${response.error.metadata.order_id}`;
                }
                errorMessage.textContent = detailedError;
                errorMessage.classList.remove('hidden');
                successMessage.classList.add('hidden');
                signupBtn.textContent = 'Create Account & Proceed to Pay';
                signupBtn.disabled = false;
            });

            console.log("Opening Razorpay checkout...");
            rzp.open();
            // Button state is managed by Razorpay handlers now

        } catch (error) {
            console.error('Overall Signup/Payment Error:', error);
            errorMessage.textContent = `Error: ${error.message || 'An unexpected error occurred.'}`;
            errorMessage.classList.remove('hidden');
            successMessage.classList.add('hidden');
            signupBtn.textContent = 'Create Account & Proceed to Pay';
            signupBtn.disabled = false;
        }
    });
});