// js/dashboard-main.js

(function(App) {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[DashboardMain] DOMContentLoaded');

        // Initialize Supabase Client
        const _supabase = window.pawsitiveCommon.createSupabaseClient();
        if (!_supabase) {
            console.error("[DashboardMain] Supabase client could not be initialized. Dashboard cannot load.");
            // Optionally display an error message to the user on the page
            const body = document.querySelector('body');
            if (body) body.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error: Could not connect to services. Please try again later.</p>';
            return;
        }
        console.log('[DashboardMain] Supabase client initialized.');

        // Authenticate User
        const currentUser = await window.pawsitiveCommon.requireAuth(_supabase, 'login.html');
        if (!currentUser) {
            console.log("[DashboardMain] User not authenticated. Redirecting...");
            return; // requireAuth will handle redirection
        }
        console.log('[DashboardMain] User authenticated:', currentUser.email);

        // Setup Logout
        window.pawsitiveCommon.setupLogout(_supabase);

        // Core DOM Elements (ensure these IDs exist in profile.html)
        const loadingState = document.getElementById('loading-state');
        const mainContent = document.getElementById('main-content');
        const profileLoadErrorDiv = document.getElementById('profile-load-error');
        const userEmailDisplay = document.getElementById('user-email');
        const sidebarLinks = document.querySelectorAll('.sidebar-link'); // For desktop sidebar
        const contentSections = document.querySelectorAll('.content-section');

        // Mobile Sidebar Elements
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const closeMobileSidebarButton = document.getElementById('close-sidebar');
        const mobileSidebarLinks = mobileSidebar ? mobileSidebar.querySelectorAll('.sidebar-link') : [];


        let userProfileData = null; // To store fetched user profile

        function displayError(message) {
            console.error('[DashboardMain] Error:', message);
            if (loadingState) loadingState.style.display = 'none';
            if (profileLoadErrorDiv) {
                profileLoadErrorDiv.textContent = message;
                profileLoadErrorDiv.classList.remove('hidden');
            }
            if (mainContent) mainContent.classList.add('hidden');
        }

        function setupSidebarNavigation() {
            sidebarLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetSectionId = link.dataset.section;
                    
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                    
                    contentSections.forEach(section => section.classList.remove('active'));
                    const targetSection = document.getElementById(targetSectionId);
                    if (targetSection) {
                        targetSection.classList.add('active');
                    } else {
                        console.warn(`[DashboardMain] Target section #${targetSectionId} not found!`);
                        return;
                    }

                    // If Map View is activated, ensure map data is loaded/refreshed
                    if (targetSectionId === 'map-section' && App.Maps && App.Maps.onMapViewActivated) {
                        console.log('[DashboardMain] Map section activated via sidebar.');
                        App.Maps.onMapViewActivated(userProfileData); // Pass current profile data
                    }

                    // Hide location picker map if navigating away from profile or it's not the map view
                    if (App.Maps && App.Maps.hideLocationPicker) {
                        App.Maps.hideLocationPicker();
                    }
                });
            });
        }

        function setupMobileSidebar() {
            if (!mobileMenuToggle || !mobileSidebar || !mobileOverlay || !closeMobileSidebarButton) {
                console.warn("[DashboardMain] Mobile sidebar elements not found. Skipping setup.");
                return;
            }

            function openMobileNav() {
                mobileSidebar.classList.add('active');
                mobileOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            }

            function closeMobileNav() {
                mobileSidebar.classList.remove('active');
                mobileOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }

            mobileMenuToggle.addEventListener('click', openMobileNav);
            closeMobileSidebarButton.addEventListener('click', closeMobileNav);
            mobileOverlay.addEventListener('click', closeMobileNav);

            mobileSidebarLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    // e.preventDefault(); // No, allow default behavior for sidebar link logic
                    // The actual section switching is handled by the desktop sidebar logic
                    // This just ensures the mobile menu closes after a tap.
                    
                    // Manually find the corresponding desktop link and click it
                    // to trigger the section change and map view activation logic
                    const targetSectionId = link.dataset.section;
                    const desktopLink = document.querySelector(`.sidebar-link[data-section="${targetSectionId}"]:not(#mobile-sidebar .sidebar-link)`);
                    if (desktopLink) {
                        desktopLink.click(); // Simulate click on desktop link
                    }
                    closeMobileNav();
                });
            });
        }


        async function initializeDashboard() {
            console.log('[DashboardMain] Initializing dashboard...');
            if (loadingState) loadingState.style.display = 'block';
            if (mainContent) mainContent.classList.add('hidden');
            if (profileLoadErrorDiv) profileLoadErrorDiv.classList.add('hidden');

            try {
                // 1. Fetch User Profile
                console.log('[DashboardMain] Fetching user profile...');
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('*, latitude, longitude') // Ensure all necessary fields are selected
                    .eq('id', currentUser.id)
                    .single();

                if (profileError) throw profileError;
                if (!profile) throw new Error("User profile not found.");
                userProfileData = profile;
                console.log('[DashboardMain] User profile fetched:', userProfileData);

                // Display user email (if element exists)
                if (userEmailDisplay) {
                    userEmailDisplay.textContent = window.pawsitiveCommon.sanitizeHTML(currentUser.email);
                }

                // 2. Initialize Modules (Order can be important for dependencies)
                // Ensure App.UserProfile, App.OwnerProfile, App.WalkerProfile, App.Maps are defined
                // by their respective module files being loaded.

                if (!App.UserProfile || !App.UserProfile.init) {
                    displayError("UserProfile module not loaded."); return;
                }
                App.UserProfile.init(_supabase, currentUser, userProfileData, {
                    // Pass DOM elements specific to the UserProfile module
                    profileForm: document.getElementById('profile-form'),
                    profileNameInput: document.getElementById('profile-name'),
                    profileEmailInput: document.getElementById('profile-email'),
                    profileMobileInput: document.getElementById('profile-mobile'),
                    profileAddressInput: document.getElementById('profile-address'),
                    pinLocationButton: document.getElementById('pin-location-btn'),
                    pickerMapContainer: document.getElementById('picker-map-container'),
                    reverseGeocodeResultDiv: document.getElementById('reverse-geocode-result'),
                    profileMessageElement: document.querySelector('#profile-form .profile-message')
                });
                console.log('[DashboardMain] UserProfile module initialized.');

                if (userProfileData.role === 'owner') {
                    if (!App.OwnerProfile || !App.OwnerProfile.init) {
                         displayError("OwnerProfile module not loaded."); return;
                    }
                    App.OwnerProfile.init(_supabase, currentUser, userProfileData, {
                        ownerContentElement: document.getElementById('owner-profile-content'),
                        addDogForm: document.getElementById('add-dog-form'),
                        dogListDiv: document.getElementById('dog-list'),
                        noDogsMessage: document.getElementById('no-dogs-message'),
                        dogMessageElement: document.querySelector('#add-dog-form .dog-message'),
                        ownerDetailsForm: document.getElementById('owner-details-form'),
                        ownerDetailsMessageElement: document.querySelector('#owner-details-form .owner-details-message')
                        // Add other owner-specific DOM elements here
                    });
                    console.log('[DashboardMain] OwnerProfile module initialized.');
                } else if (userProfileData.role === 'walker') {
                    if (!App.WalkerProfile || !App.WalkerProfile.init) {
                        displayError("WalkerProfile module not loaded."); return;
                    }
                    App.WalkerProfile.init(_supabase, currentUser, userProfileData, {
                        walkerContentElement: document.getElementById('walker-profile-content'),
                        walkerDetailsForm: document.getElementById('walker-details-form'),
                        walkerAgeInput: document.getElementById('walker-age'),
                        walkerAboutMeInput: document.getElementById('walker-about-me'),
                        walkerExpYearsInput: document.getElementById('walker-exp-years'),
                        walkerExpSummaryInput: document.getElementById('walker-exp-summary'),
                        availabilityContainer: document.getElementById('availability-container'),
                        walkerRecurringAvailCheckbox: document.getElementById('recurring-availability'),
                        walkerMessageElement: document.querySelector('#walker-details-form .walker-message')
                        // Add other walker-specific DOM elements here
                    });
                    console.log('[DashboardMain] WalkerProfile module initialized.');
                }

                if (!App.Maps || !App.Maps.init) {
                    displayError("Maps module not loaded."); return;
                }
                App.Maps.init(_supabase, currentUser, userProfileData, {
                    // Pass DOM elements for the Maps module
                    mapContainer: document.getElementById('map-container'), // For main map view
                    mapTitleRole: document.getElementById('map-title-role'),
                    mapDescriptionRole: document.getElementById('map-description-role'),
                    userProfileModal: document.getElementById('user-profile-modal'),
                    closeProfileModalButton: document.getElementById('close-profile-modal'),
                    modalUserName: document.getElementById('modal-user-name'),
                    modalUserRole: document.getElementById('modal-user-role'),
                    modalUserDistance: document.getElementById('modal-user-distance'),
                    modalLoading: document.getElementById('modal-loading'),
                    modalError: document.getElementById('modal-error'),
                    modalWalkerContent: document.getElementById('modal-walker-content'),
                    modalOwnerContent: document.getElementById('modal-owner-content')
                    // ... any other elements the Maps module needs for the modal
                });
                console.log('[DashboardMain] Maps module initialized.');


                // 3. Setup UI Interactions
                setupSidebarNavigation();
                setupMobileSidebar();

                // 4. Show Content
                if (loadingState) loadingState.style.display = 'none';
                if (mainContent) mainContent.classList.remove('hidden');
                console.log('[DashboardMain] Dashboard initialization complete.');

                // Activate the default section (e.g., profile)
                const defaultActiveLink = document.querySelector('.sidebar-link[data-section="profile-section"]');
                if (defaultActiveLink) defaultActiveLink.click();


            } catch (error) {
                displayError(`Failed to initialize dashboard: ${error.message}`);
            }
        }

        // Start the dashboard initialization process
        initializeDashboard();

    }); // End DOMContentLoaded

})(window.App = window.App || {}); // Initialize App namespace if it doesn't exist