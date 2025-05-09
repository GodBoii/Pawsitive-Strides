// js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // Initializing Supabase client
    const _supabase = window.pawsitiveCommon.createSupabaseClient();
    console.log('Supabase Initialized (Login Page)');

    // Check if already logged in, if so, redirect based on role
    // This is a slightly more complex requireNoAuth that also handles role-based redirect if already auth'd
    (async () => {
        const user = await window.pawsitiveCommon.checkAuth(_supabase);
        if (user) {
            console.log('User already logged in, determining role for redirect...');
            try {
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profileError || !profile) {
                    console.error('Error fetching profile for already logged-in user:', profileError);
                    // Fallback, or just let them stay on login page (they can try logging in again)
                    // or redirect to a generic error page or index.
                    return; 
                }

                if (profile.role === 'owner') {
                    window.location.href = 'owner-dashboard.html';
                } else if (profile.role === 'walker') {
                    window.location.href = 'walker-dashboard.html';
                } else {
                    console.warn('Unknown role for already logged-in user. Staying on login page.');
                    // Or redirect to index.html as a safe fallback
                    // window.location.href = 'index.html'; 
                }
            } catch (e) {
                console.error('Exception while checking auth/role for redirect:', e);
            }
        }
    })();


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
        errorMessage.textContent = ''; 
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;

        try {
            const { data: authData, error: authError } = await _supabase.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value,
            });

            if (authError) throw authError;

            console.log('Login authentication successful:', authData);
            
            const loggedInUser = authData.user;

            if (loggedInUser) {
                // Fetch the user's role from the 'profiles' table
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', loggedInUser.id)
                    .single();

                if (profileError || !profile) {
                    console.error('Error fetching profile role after login:', profileError);
                    errorMessage.textContent = 'Login successful, but could not load your profile type. Please try again or contact support.';
                    errorMessage.classList.remove('hidden');
                    // Optionally sign out, though the user is authenticated. The issue is profile data.
                    // await _supabase.auth.signOut(); 
                    // loginBtn.textContent = 'Log In';
                    // loginBtn.disabled = false;
                    // return; // Stop here to prevent further redirection attempts
                } else {
                    // Redirect based on role
                    if (profile.role === 'owner') {
                        window.location.href = 'owner-dashboard.html';
                    } else if (profile.role === 'walker') {
                        window.location.href = 'walker-dashboard.html';
                    } else {
                        console.error('Unknown user role after login:', profile.role);
                        errorMessage.textContent = 'Login successful, but your account type is unrecognized. Please contact support.';
                        errorMessage.classList.remove('hidden');
                        // Fallback redirection if role is somehow invalid
                        window.location.href = 'index.html'; 
                    }
                }
            } else {
                // This case should ideally not be reached if signInWithPassword was successful and returned data
                console.error('User object not available in authData after successful login response.');
                errorMessage.textContent = 'Login was successful, but there was an issue retrieving your session details. Please try again.';
                errorMessage.classList.remove('hidden');
            }

        } catch (error) {
            console.error('Login error:', error);
            if (error.message.includes("Email not confirmed")) {
                errorMessage.textContent = "Login failed: Please verify your email address first. Check your inbox (and spam folder).";
            } else if (error.message.includes("Invalid login credentials")) {
                errorMessage.textContent = "Login failed: Invalid email or password.";
            } else {
                errorMessage.textContent = "An unexpected error occurred during login. Please try again.";
            }
            errorMessage.classList.remove('hidden');
        } finally {
            // This might run before redirection completes if there's no error.
            // If an error occurs or profile fetching fails before redirection, then these will execute.
            if (errorMessage.textContent || !authData.user) { // Only reset button if there was an error or no user to redirect
                loginBtn.textContent = 'Log In';
                loginBtn.disabled = false;
            }
        }
    });
});