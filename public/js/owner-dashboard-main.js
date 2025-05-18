// js/owner-dashboard-main.js

(function(App) {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[OwnerDashboardMain] DOMContentLoaded');

        // Initialize Supabase Client
        const _supabase = window.pawsitiveCommon.createSupabaseClient();
        if (!_supabase) {
            console.error("[OwnerDashboardMain] Supabase client could not be initialized. Dashboard cannot load.");
            const body = document.querySelector('body');
            if (body) body.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error: Could not connect to services. Please try again later.</p>';
            return;
        }
        console.log('[OwnerDashboardMain] Supabase client initialized.');

        // Authenticate User
        const currentUser = await window.pawsitiveCommon.requireAuth(_supabase, 'login.html');
        if (!currentUser) {
            console.log("[OwnerDashboardMain] User not authenticated. Redirecting...");
            return;
        }
        console.log('[OwnerDashboardMain] User authenticated:', currentUser.email);

        // Setup Logout
        window.pawsitiveCommon.setupLogout(_supabase);

        // Core DOM Elements
        const loadingState = document.getElementById('loading-state');
        const mainContent = document.getElementById('main-content');
        const profileLoadErrorDiv = document.getElementById('profile-load-error');
        const userEmailDisplay = document.getElementById('user-email');
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        const contentSections = document.querySelectorAll('.content-section');

        // Mobile Sidebar Elements
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const closeMobileSidebarButton = document.getElementById('close-sidebar');
        const mobileSidebarLinks = mobileSidebar ? mobileSidebar.querySelectorAll('.sidebar-link') : [];

        let userProfileData = null;

        function displayError(message) {
            console.error('[OwnerDashboardMain] Error:', message);
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
                        console.warn(`[OwnerDashboardMain] Target section #${targetSectionId} not found!`);
                        return;
                    }

                    if (targetSectionId === 'map-section' && App.Maps && App.Maps.onMapViewActivated) {
                        console.log('[OwnerDashboardMain] Map section activated via sidebar.');
                        App.Maps.onMapViewActivated(userProfileData);
                    } else if (targetSectionId === 'quickride-section' && App.QuickRideOwner && App.QuickRideOwner.refreshMyRides) {
                        // Optional: Refresh quick rides when section is activated,
                        // though it fetches on init and after posting.
                        // App.QuickRideOwner.refreshMyRides();
                    }


                    if (App.Maps && App.Maps.hideLocationPicker) {
                        App.Maps.hideLocationPicker();
                    }
                });
            });
        }

        function setupMobileSidebar() {
            if (!mobileMenuToggle || !mobileSidebar || !mobileOverlay || !closeMobileSidebarButton) {
                console.warn("[OwnerDashboardMain] Mobile sidebar elements not found. Skipping setup.");
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
                link.addEventListener('click', () => {
                    const targetSectionId = link.dataset.section;
                    const desktopLink = document.querySelector(`.sidebar-link[data-section="${targetSectionId}"]:not(#mobile-sidebar .sidebar-link)`);
                    if (desktopLink) desktopLink.click();
                    closeMobileNav();
                });
            });
        }

        async function initializeDashboard() {
            console.log('[OwnerDashboardMain] Initializing dashboard...');
            if (loadingState) loadingState.style.display = 'block';
            if (mainContent) mainContent.classList.add('hidden');
            if (profileLoadErrorDiv) profileLoadErrorDiv.classList.add('hidden');

            try {
                // 1. Fetch User Profile
                console.log('[OwnerDashboardMain] Fetching user profile...');
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('*, latitude, longitude')
                    .eq('id', currentUser.id)
                    .single();

                if (profileError) throw profileError;
                if (!profile) throw new Error("User profile not found.");
                userProfileData = profile;
                console.log('[OwnerDashboardMain] User profile fetched:', userProfileData);

                // **** ROLE CHECK ****
                if (userProfileData.role !== 'owner') {
                    console.warn(`[OwnerDashboardMain] Incorrect role: ${userProfileData.role}. User is not an owner. Redirecting...`);
                    window.location.href = userProfileData.role === 'walker' ? 'walker-dashboard.html' : 'login.html';
                    return;
                }

                if (userEmailDisplay) {
                    userEmailDisplay.textContent = window.pawsitiveCommon.sanitizeHTML(currentUser.email);
                }

                // 2. Initialize Modules
                if (!App.UserProfile || !App.UserProfile.init) {
                    displayError("UserProfile module not loaded."); return;
                }
                App.UserProfile.init(_supabase, currentUser, userProfileData, {
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
                console.log('[OwnerDashboardMain] UserProfile module initialized.');

                if (!App.ProfileModal || !App.ProfileModal.init) {
                    displayError("ProfileModal module not loaded."); return;
                }
                App.ProfileModal.init(_supabase, {
                    userProfileModal: document.getElementById('user-profile-modal'),
                    closeProfileModalButton: document.getElementById('close-profile-modal'),
                    modalUserName: document.getElementById('modal-user-name'),
                    modalUserRole: document.getElementById('modal-user-role'),
                    modalUserDistance: document.getElementById('modal-user-distance'),
                    modalLoading: document.getElementById('modal-loading'),
                    modalError: document.getElementById('modal-error'),
                    modalWalkerContent: document.getElementById('modal-walker-content'),
                    modalOwnerContent: document.getElementById('modal-owner-content')
                });
                console.log('[DashboardMain] ProfileModal module initialized.');

                // Initialize OwnerProfile Module
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
                });
                console.log('[OwnerDashboardMain] OwnerProfile module initialized.');

                // Maps Module
                if (!App.Maps || !App.Maps.init) {
                    displayError("Maps module not loaded."); return;
                }
                App.Maps.init(_supabase, currentUser, userProfileData, {
                    mapContainer: document.getElementById('map-container'),
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
                });
                console.log('[OwnerDashboardMain] Maps module initialized.');

                // Initialize QuickRideOwner Module -- NEW --
                if (!App.QuickRideOwner || !App.QuickRideOwner.init) {
                    displayError("QuickRideOwner module not loaded."); return;
                }
                App.QuickRideOwner.init(_supabase, currentUser, userProfileData, {
                    myRidesListDiv: document.getElementById('my-quickride-list'),
                    noMyRidesMessage: document.getElementById('no-my-rides-message'),
                    newRideBtn: document.getElementById('new-quickride-btn'),
                    newRideForm: document.getElementById('new-quickride-form'),
                    dogSelect: document.getElementById('quickride-dog-select'),
                    dateTimeInput: document.getElementById('quickride-datetime'),
                    payInput: document.getElementById('quickride-pay'),
                    instructionsInput: document.getElementById('quickride-instructions'),
                    formMessage: document.querySelector('#new-quickride-form .quickride-form-message'),
                    submitQuickRideBtn: document.getElementById('submit-quickride-btn'),
                    cancelNewQuickRideBtn: document.getElementById('cancel-new-quickride-btn')
                });
                console.log('[OwnerDashboardMain] QuickRideOwner module initialized.');


                // 3. Setup UI Interactions
                setupSidebarNavigation();
                setupMobileSidebar();

                // 4. Show Content
                if (loadingState) loadingState.style.display = 'none';
                if (mainContent) mainContent.classList.remove('hidden');
                console.log('[OwnerDashboardMain] Dashboard initialization complete.');

                const defaultActiveLink = document.querySelector('.sidebar-link[data-section="profile-section"]');
                if (defaultActiveLink) defaultActiveLink.click();

            } catch (error) {
                displayError(`Failed to initialize owner dashboard: ${error.message}`);
            }
        }

        initializeDashboard();

    });
})(window.App = window.App || {});