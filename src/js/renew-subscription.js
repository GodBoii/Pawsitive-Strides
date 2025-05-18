// src/js/renew-subscription.js

const backendBaseUrl = 'http://192.168.1.2:3000'; // Ensure this is your correct backend URL

document.addEventListener('DOMContentLoaded', () => {
    const _supabase = window.pawsitiveCommon.createSupabaseClient();
    if (!_supabase) {
        console.error("Supabase client not initialized. Renewal page may not function correctly.");
        const errEl = document.getElementById('renewal-error-message');
        if (errEl) {
            errEl.textContent = 'Critical error: Services not available. Please try again later.';
            errEl.classList.remove('hidden');
            document.getElementById('loading-plans')?.classList.add('hidden');
        }
        return;
    }
    console.log('Supabase Initialized (Renew Subscription Page)');

    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const email = urlParams.get('email');
    const currentPlanNameFromURL = urlParams.get('currentPlan');
    const userRole = urlParams.get('role');
    const isExpired = urlParams.get('expired') === 'true';

    const renewalPageMessageEl = document.getElementById('renewal-page-message');
    const userContextEl = document.getElementById('user-context');
    const plansContainerEl = document.getElementById('plans-container');
    const loadingPlansEl = document.getElementById('loading-plans');
    const paymentSectionEl = document.getElementById('payment-section');
    const selectedPlanDisplayEl = document.getElementById('selected-plan-display');
    const proceedToPaymentBtn = document.getElementById('proceed-to-payment-btn');
    const errorMessageEl = document.getElementById('renewal-error-message');
    const successMessageEl = document.getElementById('renewal-success-message');
    const backToLoginLink = document.getElementById('back-to-login-link');

    let selectedPlan = null;

    if (!userId || !email || !userRole) {
        errorMessageEl.textContent = 'Required user information is missing from the link. Cannot proceed with renewal. Please try logging in again or contact support.';
        errorMessageEl.classList.remove('hidden');
        if (loadingPlansEl) loadingPlansEl.classList.add('hidden');
        if (plansContainerEl) plansContainerEl.classList.add('hidden');
        if (paymentSectionEl) paymentSectionEl.classList.add('hidden');
        return;
    }

    if (userContextEl) userContextEl.textContent = `Account: ${window.pawsitiveCommon.sanitizeHTML(email)}`;
    const displayCurrentPlan = currentPlanNameFromURL && currentPlanNameFromURL !== 'N/A' ? `"${currentPlanNameFromURL.replace(/_/g, ' ')}"` : "your current subscription";

    if (isExpired && renewalPageMessageEl) {
        renewalPageMessageEl.textContent = `Your subscription for ${displayCurrentPlan} has expired. Please choose a plan below to renew your access.`;
    } else if (renewalPageMessageEl) {
        renewalPageMessageEl.textContent = `Renew or change ${displayCurrentPlan}. Choose a new plan below.`;
    }

    const ALL_PLANS = [
        { id: 'owner_monthly', name: 'Pet Owner - Monthly', amount: 199, currency: 'INR', role: 'owner', displayAmount: '₹199 /month', features: ['Access to verified walkers', 'Manage multiple dog profiles', 'Real-time walk tracking', 'In-app messaging'] },
        { id: 'owner_annual', name: 'Pet Owner - Annual', amount: 499, currency: 'INR', role: 'owner', displayAmount: '₹499 /year', features: ['All Monthly Plan features', 'Priority support', 'Exclusive discounts (Save >75%!)'], popular: true },
        { id: 'walker_monthly', name: 'Dog Walker - Access', amount: 19, currency: 'INR', role: 'walker', displayAmount: '₹19 /month', features: ['Create & manage walker profile', 'Set your own rates & availability', 'Get verification badge & build trust', 'Access to walker resources'] }
    ];

    function displayRelevantPlans() {
        if (!plansContainerEl || !loadingPlansEl) return;
        plansContainerEl.innerHTML = '';
        const relevantPlans = ALL_PLANS.filter(plan => plan.role === userRole);

        if (relevantPlans.length === 0) {
            errorMessageEl.textContent = 'No renewal plans are currently available for your account type. Please contact support.';
            errorMessageEl.classList.remove('hidden');
            plansContainerEl.classList.add('hidden');
            loadingPlansEl.classList.add('hidden');
            return;
        }

        relevantPlans.forEach(plan => {
            const card = document.createElement('div');
            card.className = `relative plan-card border rounded-xl p-6 hover:shadow-xl transition-all duration-200 ease-in-out cursor-pointer bg-white group ${plan.popular ? 'border-amber-400 ring-2 ring-amber-200' : 'border-emerald-200 hover:border-emerald-400'}`;
            card.dataset.planId = plan.id;
            // Other data attributes are not strictly needed on card if we store 'plan' object on selection.

            let featuresHTML = '';
            if (plan.features) {
                featuresHTML = plan.features.map(feature =>
                    `<li class="flex items-start text-sm text-stone-600 group-hover:text-stone-700">
                        <svg class="h-4 w-4 text-emerald-500 mr-2.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
                        <span>${window.pawsitiveCommon.sanitizeHTML(feature)}</span>
                    </li>`).join('');
            }

            card.innerHTML = `
                ${plan.popular ? '<div class="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-amber-400 text-emerald-900 px-4 py-1 rounded-full text-xs font-bold shadow-md tracking-wide">MOST POPULAR</div>' : ''}
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-xl font-semibold ${plan.popular ? 'text-amber-700' : 'text-emerald-700'}">${window.pawsitiveCommon.sanitizeHTML(plan.name)}</h3>
                    <input type="radio" name="selected_plan_radio" value="${plan.id}" class="form-radio h-5 w-5 text-emerald-600 focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 plan-radio">
                </div>
                <p class="text-4xl font-bold text-stone-800 mb-1">${window.pawsitiveCommon.sanitizeHTML(plan.displayAmount.split(' ')[0])}
                    <span class="text-base font-normal text-stone-500">${plan.displayAmount.substring(plan.displayAmount.indexOf(' '))}</span>
                </p>
                <ul class="list-none mt-4 space-y-1.5 min-h-[70px] sm:min-h-[90px]">
                    ${featuresHTML}
                </ul>
            `;

            const radioInput = card.querySelector('.plan-radio');

            card.addEventListener('click', () => {
                document.querySelectorAll('.plan-card').forEach(c => {
                    c.classList.remove('ring-2', 'ring-emerald-500', 'border-emerald-500', 'selected');
                    c.classList.remove('ring-amber-500', 'border-amber-500'); // Clear amber ring too
                    if(c.dataset.planId === plan.id){
                         c.classList.add('ring-2', plan.popular ? 'ring-amber-500' : 'ring-emerald-500', 'selected');
                         if(plan.popular) c.classList.add('border-amber-500'); else c.classList.add('border-emerald-500');
                    } else {
                         if(c.dataset.popular === 'true') c.classList.add('border-amber-400'); else c.classList.add('border-emerald-200');
                    }
                });
                radioInput.checked = true;

                selectedPlan = plan;
                if (selectedPlanDisplayEl) selectedPlanDisplayEl.innerHTML = `${window.pawsitiveCommon.sanitizeHTML(plan.name)} (<span class="font-normal">${window.pawsitiveCommon.sanitizeHTML(plan.displayAmount)}</span>)`;
                if (paymentSectionEl) paymentSectionEl.classList.remove('hidden');
                if (proceedToPaymentBtn) {
                    proceedToPaymentBtn.disabled = false;
                    proceedToPaymentBtn.textContent = 'Proceed to Payment';
                }
                if (errorMessageEl) errorMessageEl.classList.add('hidden');
            });
            plansContainerEl.appendChild(card);
        });
        plansContainerEl.classList.remove('hidden');
        loadingPlansEl.classList.add('hidden');
    }

    displayRelevantPlans();

    if (proceedToPaymentBtn) {
        proceedToPaymentBtn.addEventListener('click', async () => {
            if (!selectedPlan) {
                errorMessageEl.textContent = 'Please select a plan first to proceed with the payment.';
                errorMessageEl.classList.remove('hidden');
                return;
            }

            proceedToPaymentBtn.disabled = true;
            proceedToPaymentBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Preparing Payment...`;
            errorMessageEl.classList.add('hidden');
            successMessageEl.classList.add('hidden');

            try {
                console.log("Creating Razorpay order with:", {
                    amount: selectedPlan.amount,
                    currency: selectedPlan.currency,
                    userId: userId,
                    email: email,
                    plan: selectedPlan.id
                });

                const orderResponse = await fetch(`${backendBaseUrl}/create-razorpay-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: selectedPlan.amount, // Amount in primary unit (e.g., INR 199)
                        currency: selectedPlan.currency,
                        receipt: `ps_renew_${userId.substring(0, 8)}_${Date.now()}`,
                        notes: {
                            userId: userId,
                            email: email,
                            plan: selectedPlan.id,
                            flow: "Pawsitive Strides Renewal"
                        }
                    })
                });

                if (!orderResponse.ok) {
                    const errData = await orderResponse.json().catch(() => ({ error: "Unknown error from order creation." }));
                    throw new Error(errData.error || `Failed to create Razorpay order: ${orderResponse.statusText}`);
                }
                const razorpayOrder = await orderResponse.json();
                if (!razorpayOrder || !razorpayOrder.id) {
                    throw new Error("Invalid order response from backend (missing order ID).");
                }

                proceedToPaymentBtn.textContent = 'Redirecting to Payment...';

                const options = {
                    key: "rzp_test_E5YJG4Db212xad", // Your Public Razorpay Key ID
                    amount: razorpayOrder.amount, // Amount from backend (in paise)
                    currency: razorpayOrder.currency,
                    name: "Pawsitive Strides",
                    description: `Subscription Renewal: ${selectedPlan.name}`,
                    order_id: razorpayOrder.id, // From backend
                    handler: async function (response) {
                        proceedToPaymentBtn.innerHTML = `
                            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Verifying Payment...`;
                        try {
                            const verificationRes = await fetch(`${backendBaseUrl}/verify-razorpay-payment`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_signature: response.razorpay_signature,
                                    userId: userId,
                                    planName: selectedPlan.id, // Pass the selected plan ID
                                    amount_paid_currency_unit: selectedPlan.amount, // Original amount in INR
                                    currency_paid: selectedPlan.currency
                                })
                            });
                            const verificationData = await verificationRes.json();
                            if (verificationRes.ok && verificationData.status === 'success') {
                                successMessageEl.textContent = 'Subscription Renewed Successfully! Redirecting to your dashboard in a few seconds...';
                                successMessageEl.classList.remove('hidden');
                                proceedToPaymentBtn.classList.add('hidden');
                                if (plansContainerEl) plansContainerEl.classList.add('hidden');
                                if (selectedPlanDisplayEl) selectedPlanDisplayEl.textContent = '';
                                if (paymentSectionEl) paymentSectionEl.classList.add('hidden');
                                if (renewalPageMessageEl) renewalPageMessageEl.textContent = 'Renewal Successful!';


                                let dashboardUrl = 'login.html'; // Fallback
                                if (userRole === 'owner') dashboardUrl = 'owner-dashboard.html';
                                else if (userRole === 'walker') dashboardUrl = 'walker-dashboard.html';
                                
                                if(backToLoginLink) {
                                    backToLoginLink.textContent = "Go to Dashboard";
                                    backToLoginLink.href = dashboardUrl;
                                }

                                setTimeout(() => { window.location.href = dashboardUrl; }, 4000);
                            } else {
                                throw new Error(verificationData.message || 'Payment verification failed by backend.');
                            }
                        } catch (verificationError) {
                            console.error('Payment verification fetch/logic error:', verificationError);
                            errorMessageEl.textContent = `Your payment was processed, but final verification encountered an issue: ${verificationError.message}. Please contact support with your Payment ID: ${response.razorpay_payment_id} and Order ID: ${response.razorpay_order_id}.`;
                            errorMessageEl.classList.remove('hidden');
                            proceedToPaymentBtn.disabled = false;
                            proceedToPaymentBtn.textContent = 'Try Payment Again'; // Allow retry
                        }
                    },
                    prefill: {
                        email: email,
                        // contact: profile.mobile (if you fetch and pass mobile)
                    },
                    notes: {
                        plan_selected: selectedPlan.id,
                        supabase_user_id: userId,
                        renewal_process: "true"
                    },
                    theme: { color: "#059669" }, // Emerald-600
                    modal: {
                        ondismiss: function() {
                            // Only reset if not in midst of verification
                            if (proceedToPaymentBtn.textContent.includes('Redirecting') || proceedToPaymentBtn.textContent.includes('Preparing')) {
                                errorMessageEl.textContent = 'Payment process was cancelled or interrupted.';
                                errorMessageEl.classList.remove('hidden');
                            }
                            proceedToPaymentBtn.disabled = false;
                            proceedToPaymentBtn.textContent = 'Proceed to Payment';
                        }
                    }
                };
                const rzp = new Razorpay(options);
                rzp.on('payment.failed', function (response) {
                    console.error('Razorpay payment.failed event:', response.error);
                    let detailedError = `Payment Failed on Razorpay: ${response.error.description || 'Unknown Razorpay Error'}`;
                    if (response.error.code) detailedError += ` (Code: ${response.error.code})`;
                    if (response.error.reason) detailedError += ` Reason: ${response.error.reason}`;
                    if (response.error.metadata && response.error.metadata.order_id) {
                         detailedError += `. Order ID: ${response.error.metadata.order_id}`;
                    }
                    errorMessageEl.textContent = detailedError;
                    errorMessageEl.classList.remove('hidden');
                    proceedToPaymentBtn.disabled = false;
                    proceedToPaymentBtn.textContent = 'Try Payment Again';
                });

                console.log("Opening Razorpay checkout...");
                rzp.open();

            } catch (error) {
                console.error('Overall Renewal/Payment Error:', error);
                errorMessageEl.textContent = `Error: ${error.message || 'An unexpected error occurred during payment preparation.'}`;
                errorMessageEl.classList.remove('hidden');
                proceedToPaymentBtn.disabled = false;
                proceedToPaymentBtn.innerHTML = 'Proceed to Payment'; // Reset text
            }
        });
    }
});