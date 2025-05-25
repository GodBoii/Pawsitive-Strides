// js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // Initializing Supabase client
    const _supabase = window.pawsitiveCommon.createSupabaseClient();

    // Check if already logged in, if so, redirect based on role and check subscription
    (async () => {
        const user = await window.pawsitiveCommon.checkAuth(_supabase);
        if (user) {
            try {
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('role, subscription_ends_at, plan, subscription_status') // Keep status for context if needed
                    .eq('id', user.id)
                    .single();

                if (profileError || !profile) {
                    return; // Stay on login page or handle error appropriately
                }

                // **** REVISED EXPIRY/SETUP CHECK FOR ALREADY LOGGED-IN USERS ****
                if (!profile.subscription_ends_at) {
                    const queryParams = new URLSearchParams({
                        userId: user.id,
                        email: user.email,
                        currentPlan: profile.plan || 'N/A',
                        role: profile.role,
                        // Add a flag if it's a setup because subscription_status might be 'pending_payment'
                        setup: profile.subscription_status === 'pending_payment' ? 'true_pending' : 'true_missing_date'
                    });
                    window.location.href = `renew-subscription.html?${queryParams.toString()}`;
                    return; // Stop further redirection
                } else {
                    // subscription_ends_at has a value, check if it's in the past
                    const subscriptionEndDate = new Date(profile.subscription_ends_at);
                    const now = new Date();
                    if (subscriptionEndDate < now) {
                        const queryParams = new URLSearchParams({
                            userId: user.id,
                            email: user.email,
                            currentPlan: profile.plan || 'N/A',
                            role: profile.role,
                            expired: 'true'
                        });
                        window.location.href = `renew-subscription.html?${queryParams.toString()}`;
                        return; // Stop further redirection
                    }
                }
                // **** END REVISED EXPIRY/SETUP CHECK ****

                // If subscription is valid and date is in the future, proceed to dashboard
                if (profile.role === 'owner') {
                    window.location.href = 'owner-dashboard.html';
                } else if (profile.role === 'walker') {
                    window.location.href = 'walker-dashboard.html';
                } else {
                    // window.location.href = 'index.html'; // Or a generic dashboard/error page
                }
            } catch (e) {
                // Handle exception
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
        let loginSuccessfulNoRedirectYet = false;

        try {
            const { data: authData, error: authError } = await _supabase.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value,
            });

            if (authError) throw authError;

            const loggedInUser = authData.user;

            if (loggedInUser) {
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('role, subscription_ends_at, plan, subscription_status') // Get all relevant fields
                    .eq('id', loggedInUser.id)
                    .single();

                if (profileError || !profile) {
                    errorMessage.textContent = 'Login successful, but could not load your profile details. Please try again or contact support.';
                    errorMessage.classList.remove('hidden');
                    // await _supabase.auth.signOut(); // Optionally sign out
                } else {
                    loginSuccessfulNoRedirectYet = true; // Mark success before potential redirect

                    // **** REVISED EXPIRY/SETUP CHECK AFTER LOGIN ATTEMPT ****
                    if (!profile.subscription_ends_at) {
                        let setupFlag = 'true_missing_date';
                        if (profile.subscription_status === 'pending_payment') {
                             errorMessage.innerHTML = `Your account is created but the initial subscription payment was not completed. Please <a href="renew-subscription.html?userId=${loggedInUser.id}&email=${loggedInUser.email}&role=${profile.role}&setup=true_pending&plan=${profile.plan || 'N/A'}" class="font-medium text-emerald-700 hover:underline">complete your subscription setup</a>.`;
                             errorMessage.classList.remove('hidden');
                             setupFlag = 'true_pending';
                        }
                        const queryParams = new URLSearchParams({
                            userId: loggedInUser.id,
                            email: loggedInUser.email,
                            currentPlan: profile.plan || 'N/A',
                            role: profile.role,
                            setup: setupFlag
                        });
                        window.location.href = `renew-subscription.html?${queryParams.toString()}`;
                        return; // Stop further execution
                    } else {
                        // subscription_ends_at has a value, check if it's in the past
                        const subscriptionEndDate = new Date(profile.subscription_ends_at);
                        const now = new Date();
                        if (subscriptionEndDate < now) {
                            const queryParams = new URLSearchParams({
                                userId: loggedInUser.id,
                                email: loggedInUser.email,
                                currentPlan: profile.plan || 'N/A',
                                role: profile.role,
                                expired: 'true'
                            });
                            window.location.href = `renew-subscription.html?${queryParams.toString()}`;
                            return; // Stop further execution
                        }
                    }
                    // **** END REVISED EXPIRY/SETUP CHECK ****

                    // If subscription is valid (date exists and is in the future), redirect based on role
                    if (profile.role === 'owner') {
                        window.location.href = 'owner-dashboard.html';
                    } else if (profile.role === 'walker') {
                        window.location.href = 'walker-dashboard.html';
                    } else {
                        errorMessage.textContent = 'Login successful, but your account type is unrecognized. Please contact support.';
                        errorMessage.classList.remove('hidden');
                        // Potentially sign out and redirect to index or show a more generic error.
                        // await _supabase.auth.signOut();
                        window.location.href = 'index.html'; // Fallback redirection
                    }
                }
            } else {
                // This case should ideally not be reached if signInWithPassword was successful and returned data
                errorMessage.textContent = 'Login was successful, but there was an issue retrieving your session details. Please try again.';
                errorMessage.classList.remove('hidden');
            }

        } catch (error) {
            if (error.message.includes("Email not confirmed")) {
                errorMessage.innerHTML = `Login failed: Please verify your email address first. Check your inbox (and spam folder). If your subscription payment is pending or setup is incomplete, you'll be guided to resolve it after email verification.`;
            } else if (error.message.includes("Invalid login credentials")) {
                errorMessage.textContent = "Login failed: Invalid email or password.";
            } else {
                errorMessage.textContent = "An unexpected error occurred during login. Please try again.";
            }
            errorMessage.classList.remove('hidden');
        } finally {
            // Only reset button if login was not successful leading to a redirect,
            // or if an error occurred before redirection.
            if (!loginSuccessfulNoRedirectYet || errorMessage.textContent) {
                loginBtn.textContent = 'Log In';
                loginBtn.disabled = false;
            }
        }
    });
});