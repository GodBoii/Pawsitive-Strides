// js/index.js (Main page javascript for Pawsitive Strides - UPDATED)

document.addEventListener('DOMContentLoaded', async () => {
    let _supabase; // Declare _supabase in a scope accessible to later functions

    try {
        _supabase = window.pawsitiveCommon?.createSupabaseClient();

        if (_supabase) {
            const user = await window.pawsitiveCommon.checkAuth(_supabase);
            const authLinksDesktop = document.querySelectorAll('header .hidden.md\\:flex a'); // Desktop links
            const authLinksMobile = document.querySelectorAll('#mobile-menu a'); // Mobile menu links

            const updateLink = async (linkElement) => {
                if (linkElement.href.includes('login.html')) {
                    linkElement.textContent = 'My Dashboard';
                    // We need to dynamically set the href based on role
                    if (user) { // Ensure user object is available
                        try {
                            const { data: profile, error: profileError } = await _supabase
                                .from('profiles')
                                .select('role')
                                .eq('id', user.id)
                                .single();

                            if (profileError || !profile) {
                                console.error('Error fetching profile role for dashboard link:', profileError);
                                linkElement.href = 'login.html'; // Fallback to login if role cannot be determined
                                linkElement.textContent = 'Log In'; // Revert text
                            } else {
                                if (profile.role === 'owner') {
                                    linkElement.href = 'owner-dashboard.html';
                                } else if (profile.role === 'walker') {
                                    linkElement.href = 'walker-dashboard.html';
                                } else {
                                    linkElement.href = 'login.html'; // Fallback for unknown role
                                    linkElement.textContent = 'Log In'; // Revert text
                                }
                            }
                        } catch (e) {
                            console.error('Exception fetching profile for dashboard link:', e);
                            linkElement.href = 'login.html';
                            linkElement.textContent = 'Log In';
                        }
                    } else {
                        // User not logged in, link should remain as "Log In"
                        linkElement.href = 'login.html';
                        linkElement.textContent = 'Log In';
                    }
                } else if (linkElement.href.includes('signup.html')) {
                    if (user) {
                        linkElement.style.display = 'none'; // Hide "Sign Up" if logged in
                    } else {
                        linkElement.style.display = ''; // Ensure "Sign Up" is visible if not logged in
                    }
                }
            };

            if (user) {
                // User is logged in, update "Log In" to "My Dashboard" and hide "Sign Up"
                // Process desktop links
                for (const link of authLinksDesktop) {
                    await updateLink(link);
                }
                // Process mobile links
                for (const link of authLinksMobile) {
                    await updateLink(link);
                }
            } else {
                // User is not logged in, ensure links are "Log In" and "Sign Up"
                authLinksDesktop.forEach(link => {
                    if (link.href.includes('login.html')) link.textContent = 'Log In';
                    if (link.href.includes('signup.html')) link.style.display = '';
                });
                authLinksMobile.forEach(link => {
                    if (link.href.includes('login.html')) link.textContent = 'Log In';
                    if (link.href.includes('signup.html')) link.style.display = '';
                });
            }
        }
    } catch (error) {
        console.error('Error initializing index page:', error);
    }

    // Mobile menu functionality (remains the same)
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            if (mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.remove('hidden');
                mobileMenuButton.setAttribute('aria-expanded', 'true');
            } else {
                mobileMenu.classList.add('hidden');
                mobileMenuButton.setAttribute('aria-expanded', 'false');
            }
        });

        const mobileMenuLinks = mobileMenu.querySelectorAll('a');
        mobileMenuLinks.forEach(link => {
            link.addEventListener('click', (e) => { // Added event arg
                // Only close menu if it's not a dashboard link that requires JS to determine href
                // Or, more simply, always close it. The href will be set before navigation.
                if (!link.href.includes('dashboard.html')) { // Avoid issues if href is not yet fully set
                    mobileMenu.classList.add('hidden');
                    mobileMenuButton.setAttribute('aria-expanded', 'false');
                } else if (link.href !== '#' && link.href !== '') { // If dashboard link is determined
                    mobileMenu.classList.add('hidden');
                    mobileMenuButton.setAttribute('aria-expanded', 'false');
                }
                // If it's an anchor link, the smooth scroll logic below handles it
                if (link.getAttribute('href').startsWith('#')) {
                    // Allow smooth scroll logic to proceed
                }
            });
        });
    }

    // Smooth scrolling for anchor links (remains the same)
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