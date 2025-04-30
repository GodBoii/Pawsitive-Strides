// Signup functionality for Pawsitive Strides (Corrected - Trigger-based profile creation)

document.addEventListener('DOMContentLoaded', () => {
    // Initializing Supabase client
    const _supabase = pawsitiveCommon.createSupabaseClient();
    console.log('Supabase Initialized (Signup Page)');

    // Check if already logged in
    pawsitiveCommon.requireNoAuth(_supabase);

    // DOM Elements (Same as before)
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

    // UI Logic (Same as before)
    selectPlanButtons.forEach(button => { /* ... */ });
    backToPlansButton.addEventListener('click', () => { /* ... */ });
     selectPlanButtons.forEach(button => {
        button.addEventListener('click', () => {
            selectedPlanInput.value = button.dataset.plan;
            userRoleInput.value = button.dataset.role;
            const isWalker = button.dataset.role === 'walker';
            registrationTitle.textContent = isWalker ? 'Create Dog Walker Account' : 'Create Pet Owner Account';
            ageFieldWalker.classList.toggle('hidden', !isWalker);
            ageInputWalker.required = isWalker; // Set required based on role
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
                 successMessage.classList.add('hidden');
                 ageFieldWalker.classList.add('hidden');
                 ageInputWalker.required = false; // Reset required
            }, 300);
             window.scrollTo({ top: 0, behavior: 'smooth' });
        });


    // --- CORRECTED Form Submission (Uses Trigger) ---
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');
        signupBtn.textContent = 'Processing...';
        signupBtn.disabled = true;

        // Validation (Same as before)
        if (passwordInput.value !== confirmPasswordInput.value) {
             errorMessage.textContent = 'Passwords do not match.';
             errorMessage.classList.remove('hidden');
             confirmPasswordInput.focus();
             signupBtn.textContent = 'Create Account & Proceed';
             signupBtn.disabled = false;
            return;
        }
        const role = userRoleInput.value;
        if (role === 'walker' && (!ageInputWalker.value || parseInt(ageInputWalker.value) < 18)) {
             errorMessage.textContent = 'Walkers must be at least 18 years old.';
             errorMessage.classList.remove('hidden');
             ageInputWalker.focus();
             signupBtn.textContent = 'Create Account & Proceed';
             signupBtn.disabled = false;
            return;
        }

        // Prepare ALL data needed by the TRIGGER function for the metadata
        const userDataForMeta = {
            full_name: nameInput.value.trim(),
            mobile: mobileInput.value.trim(), // Trigger expects 'mobile'
            address: addressInput.value.trim(), // Trigger expects 'address'
            user_role: role,                   // Trigger expects 'user_role'
            selected_plan: selectedPlanInput.value, // Trigger expects 'selected_plan'
            age: (role === 'walker' && ageInputWalker.value) ? parseInt(ageInputWalker.value) : null // Trigger expects 'age'
            // DO NOT include lat/lng here if using the simplified trigger
        };
        console.log("Sending metadata to Supabase signUp:", userDataForMeta);

        try {
            // Only call signUp - the trigger handles the profile insert
            const { data, error } = await _supabase.auth.signUp({
                email: emailInput.value.trim(),
                password: passwordInput.value,
                options: {
                    data: userDataForMeta // Pass all necessary data for the trigger
                }
            });

            if (error) throw error; // Handle Supabase auth errors

            console.log('Sign up successful response:', data);

            // Success: Inform user to check email
            successMessage.textContent = 'Account created! Please check your email to verify your account before logging in.';
            successMessage.classList.remove('hidden');
            signupForm.reset(); // Clear form

            // Optional redirect after delay
            // setTimeout(() => { window.location.href = 'login.html'; }, 3000);

        } catch (error) {
            console.error('Signup error:', error);
            errorMessage.textContent = `Signup failed: ${error.message}`;
            errorMessage.classList.remove('hidden');
        } finally {
            // Re-enable button after completion (success or fail)
            signupBtn.textContent = 'Create Account & Proceed';
            signupBtn.disabled = false;
        }
    });
});