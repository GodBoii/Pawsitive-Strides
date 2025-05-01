// Login functionality for Pawsitive Strides

document.addEventListener('DOMContentLoaded', () => {
    // Initializing Supabase client
    const _supabase = pawsitiveCommon.createSupabaseClient();
    console.log('Supabase Initialized (Login Page)');

    // Check if already logged in
    pawsitiveCommon.requireNoAuth(_supabase);

    // DOM Elements
    const form = document.getElementById('login-form');
    const errorMessage = form.querySelector('.error-message');
    const loginBtn = form.querySelector('.login-btn');
    const emailInput = form.querySelector('#email');
    const passwordInput = form.querySelector('#password');

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.classList.add('hidden');
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;

        try {
            const { data, error } = await _supabase.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value,
            });

            if (error) throw error;

            console.log('Login successful:', data);
            // Redirect on successful login
            window.location.href = 'profile.html';

        } catch (error) {
            console.error('Login error:', error);
            if (error.message.includes("Email not confirmed")) {
                errorMessage.textContent = "Login failed: Please verify your email address first. Check your inbox (and spam folder).";
            } else if (error.message.includes("Invalid login credentials")) {
                errorMessage.textContent = "Login failed: Invalid email or password.";
            } else {
                errorMessage.textContent = `Login failed: ${error.message}`;
            }
            errorMessage.classList.remove('hidden');
        } finally {
            loginBtn.textContent = 'Log In';
            loginBtn.disabled = false;
        }
    });
});