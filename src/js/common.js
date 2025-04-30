// Common JavaScript functionality for Pawsitive Strides

// Supabase configuration
const SUPABASE_URL = "https://btaoqcoxxpwegsotjdgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0YW9xY294eHB3ZWdzb3RqZGdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4MjI0MzAsImV4cCI6MjA2MTM5ODQzMH0.rNB8JGK0YYPcgf8Y2nADJ76jX7CrmZzgdgxHxMJ7AKM";

// Create Supabase client
function createSupabaseClient() {
    const { createClient } = supabase;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Handle logout
function setupLogout(supabaseClient) {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = 'index.html';
        });
    }
}

// Check if user is authenticated
async function checkAuth(supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.user;
}

// Redirect if not authenticated
async function requireAuth(supabaseClient, redirectUrl = 'login.html') {
    const user = await checkAuth(supabaseClient);
    if (!user) {
        window.location.href = redirectUrl;
        return null;
    }
    return user;
}

// Redirect if already authenticated
async function requireNoAuth(supabaseClient, redirectUrl = 'profile.html') {
    const user = await checkAuth(supabaseClient);
    if (user) {
        window.location.href = redirectUrl;
        return false;
    }
    return true;
}

// Export functions
window.pawsitiveCommon = {
    createSupabaseClient,
    setupLogout,
    checkAuth,
    requireAuth,
    requireNoAuth
}; 