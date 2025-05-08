// js/common.js

// Supabase configuration
const SUPABASE_URL = "https://btaoqcoxxpwegsotjdgh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0YW9xY294eHB3ZWdzb3RqZGdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4MjI0MzAsImV4cCI6MjA2MTM5ODQzMH0.rNB8JGK0YYPcgf8Y2nADJ76jX7CrmZzgdgxHxMJ7AKM";

// Create Supabase client
function createSupabaseClient() {
    // Ensure supabase is loaded (it's globally available from the CDN script)
    if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.error("Supabase client library not found. Make sure it's included in your HTML.");
        return null;
    }
    const { createClient } = supabase;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Handle logout
function setupLogout(supabaseClient) {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            if (!supabaseClient) {
                console.error("Supabase client not available for logout.");
                return;
            }
            await supabaseClient.auth.signOut();
            window.location.href = 'index.html'; // Or your desired logout destination
        });
    }
}

// Check if user is authenticated
async function checkAuth(supabaseClient) {
    if (!supabaseClient) {
        console.error("Supabase client not available for auth check.");
        return null;
    }
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

// General Purpose Utilities
function sanitizeHTML(unsafeText) {
    if (typeof unsafeText !== 'string') {
        console.warn("sanitizeHTML received non-string input:", unsafeText);
        return '';
    }
    const div = document.createElement('div');
    div.textContent = unsafeText;
    return div.innerHTML;
}

function createSafeElement(tag, attributes = {}, content = null) {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else {
            element.setAttribute(key, value);
        }
    });

    if (content !== null) {
        if (typeof content === 'string') {
            element.textContent = content; // textContent is safer than innerHTML for strings
        } else if (content instanceof Node) {
            element.appendChild(content);
        } else if (Array.isArray(content)) {
            content.forEach(item => {
                if (item instanceof Node) {
                    element.appendChild(item);
                } else if (typeof item === 'string') {
                    element.appendChild(document.createTextNode(item));
                }
            });
        }
    }
    return element;
}


// Export functions under a global namespace
window.pawsitiveCommon = {
    createSupabaseClient,
    setupLogout,
    checkAuth,
    requireAuth,
    requireNoAuth,
    sanitizeHTML,
    createSafeElement,
    SUPABASE_URL, // Exporting for potential use in Edge Functions for constructing URLs
    SUPABASE_ANON_KEY // Exporting for potential use
};