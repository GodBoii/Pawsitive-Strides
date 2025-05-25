// src/js/renew-subscription.js

document.addEventListener('DOMContentLoaded', () => {
    const _supabase = window.pawsitiveCommon.createSupabaseClient();
    if (!_supabase) {
        const errEl = document.getElementById('renewal-error-message');
        if (errEl) {
            errEl.textContent = 'Critical error: Services not available. Please try again later.';
            errEl.classList.remove('hidden');
            document.getElementById('loading-plans')?.classList.add('hidden');
        }
        return;
    }

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
        { id: 'owner_monthly', name: 'Pet Owner - Monthly', amount: 0, currency: 'INR', displayAmount: 'Free', role: 'owner', features: ['Access to verified walkers', 'Manage multiple dog profiles', 'Real-time walk tracking', 'In-app messaging'] },
        { id: 'owner_annual', name: 'Pet Owner - Annual', amount: 0, currency: 'INR', displayAmount: 'Free', role: 'owner', features: ['All Monthly Plan features', 'Priority support', 'Exclusive discounts (Save >75%!)'], popular: true },
        { id: 'walker_monthly', name: 'Dog Walker - Access', amount: 0, currency: 'INR', displayAmount: 'Free', role: 'walker', features: ['Create & manage walker profile', 'Set your own rates & availability', 'Get verification badge & build trust', 'Access to walker resources'] }
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
                errorMessageEl.textContent = 'Please select a plan first to proceed.';
                errorMessageEl.classList.remove('hidden');
                return;
            }

            proceedToPaymentBtn.disabled = true;
            proceedToPaymentBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Activating Subscription...`;
            errorMessageEl.classList.add('hidden');
            successMessageEl.classList.add('hidden');

            try {
                // === Payment Bypassed: Activate subscription for free ===
                const activateRes = await fetch('/api/activate-free-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId,
                        planName: selectedPlan.id
                    })
                });
                const activateData = await activateRes.json();
                if (activateRes.ok && activateData.status === 'success') {
                    successMessageEl.textContent = 'Renewal Successful! Your subscription is active (no payment required).';
                    successMessageEl.classList.remove('hidden');
                    errorMessageEl.classList.add('hidden');
                    proceedToPaymentBtn.innerHTML = 'Renewed!';
                    proceedToPaymentBtn.disabled = true;
                } else {
                    throw new Error(activateData.error || 'Subscription activation failed.');
                }
                // === End Payment Bypass ===
            } catch (error) {
                errorMessageEl.textContent = error.message || 'An unexpected error occurred during renewal.';
                errorMessageEl.classList.remove('hidden');
                successMessageEl.classList.add('hidden');
                proceedToPaymentBtn.innerHTML = 'Try Again';
                proceedToPaymentBtn.disabled = false;
            }
        });
    }
});