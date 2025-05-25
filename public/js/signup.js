// D:\Pawsitive Strides 2\src\js\signup.js
// Signup functionality for Pawsitive Strides (Trigger-based profile + Razorpay Payment)

document.addEventListener('DOMContentLoaded', () => {
    // Initializing Supabase client
    const _supabase = window.pawsitiveCommon.createSupabaseClient();

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
            const { data, error: signUpError } = await _supabase.auth.signUp({
                email: emailInput.value.trim(),
                password: passwordInput.value,
                options: {
                    data: userDataForMeta
                }
            });

            if (signUpError) throw signUpError;
            if (!data.user) throw new Error("User not created in Supabase, cannot proceed to activation.");
            
            authResultData = data;

            // === Payment Bypassed: Activate subscription for free ===
            signupBtn.textContent = 'Activating Subscription...';
            const activateRes = await fetch('/api/activate-free-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: authResultData.user.id,
                    planName: planName
                })
            });
            const activateData = await activateRes.json();
            if (activateRes.ok && activateData.status === 'success') {
                successMessage.textContent = 'Sign up Successful! Your subscription is active (no payment required). Please check your email to verify your account, then you can log in.';
                successMessage.classList.remove('hidden');
                errorMessage.classList.add('hidden');
                signupForm.reset();
                registrationFormSection.classList.add('fade-leave-to');
                setTimeout(() => {
                    registrationFormSection.classList.add('hidden');
                    registrationFormSection.classList.remove('fade-leave-to');
                    planSelectionSection.classList.remove('hidden', 'fade-leave-to');
                    planSelectionSection.classList.add('fade-enter-active');
                    setTimeout(() => planSelectionSection.classList.remove('fade-enter-active'), 500);
                }, 500);
            } else {
                throw new Error(activateData.error || 'Subscription activation failed.');
            }
            signupBtn.textContent = 'Create Account';
            signupBtn.disabled = false;
            // === End Payment Bypass ===

        } catch (error) {
            showError(error.message || 'An error occurred during signup');
            signupBtn.textContent = 'Create Account';
            signupBtn.disabled = false;
        }
    });

    function showError(message) {
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }
});