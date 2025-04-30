// Main page javascript for Pawsitive Strides

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase client if needed
    try {
        const _supabase = pawsitiveCommon?.createSupabaseClient();
        
        // Check if user is logged in
        if (_supabase) {
            const user = await pawsitiveCommon.checkAuth(_supabase);
            if (user) {
                // User is logged in, update UI accordingly
                const authLinks = document.querySelectorAll('a[href="login.html"], a[href="signup.html"]');
                authLinks.forEach(link => {
                    if (link.href.includes('login.html')) {
                        link.href = 'profile.html';
                        link.textContent = 'My Dashboard';
                    } else {
                        link.style.display = 'none';
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error initializing index page:', error);
    }
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    });
}); 