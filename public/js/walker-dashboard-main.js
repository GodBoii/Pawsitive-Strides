// js/walker-dashboard-main.js

(function(App) {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {

        // Initialize Supabase Client
        const _supabase = window.pawsitiveCommon.createSupabaseClient();
        if (!_supabase) {
            const body = document.querySelector('body');
            if (body) body.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error: Could not connect to services. Please try again later.</p>';
            return;
        }

        // Authenticate User
        const currentUser = await window.pawsitiveCommon.requireAuth(_supabase, 'login.html');
        if (!currentUser) {
            return;
        }

        // Setup Logout
        window.pawsitiveCommon.setupLogout(_supabase);

        // Core DOM Elements
        const loadingState = document.getElementById('loading-state');
        const mainContent = document.getElementById('main-content');
        const profileLoadErrorDiv = document.getElementById('profile-load-error');
        const userEmailDisplay = document.getElementById('user-email');
        const sidebarLinks = document.querySelectorAll('.sidebar-link'); // Desktop sidebar links
        const contentSections = document.querySelectorAll('.content-section');

        // Mobile Sidebar Elements
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const mobileSidebar = document.getElementById('mobile-sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const closeMobileSidebarButton = document.getElementById('close-sidebar');
        const mobileSidebarLinks = mobileSidebar ? mobileSidebar.querySelectorAll('.sidebar-link') : []; // Mobile sidebar links

        let userProfileData = null;
        let currentActiveSectionId = null; // To track the currently active section

        function displayError(message) {
            if (loadingState) loadingState.style.display = 'none';
            if (profileLoadErrorDiv) {
                profileLoadErrorDiv.textContent = message;
                profileLoadErrorDiv.classList.remove('hidden');
            }
            if (mainContent) mainContent.classList.add('hidden');
        }

        function handleSectionChange(newSectionId) {
            // Deactivate previous section's module if necessary
            if (currentActiveSectionId === 'quickride-section' && App.QuickRideWalker && App.QuickRideWalker.onViewDeactivated) {
                App.QuickRideWalker.onViewDeactivated();
            }
            // Add other `else if` blocks here for other modules that need deactivation

            // Activate new section's module
            if (newSectionId === 'quickride-section' && App.QuickRideWalker && App.QuickRideWalker.onViewActivated) {
                App.QuickRideWalker.onViewActivated();
            }
            // Add other `else if` blocks here for other modules that need activation

            currentActiveSectionId = newSectionId;
        }


        function setupSidebarNavigation() {
            const allSidebarLinks = [...sidebarLinks, ...mobileSidebarLinks]; // Combine desktop and mobile links

            allSidebarLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetSectionId = link.dataset.section;

                    // Deactivate previously active section module BEFORE changing UI
                    if (currentActiveSectionId && currentActiveSectionId !== targetSectionId) {
                        handleSectionChange(null); // Signal deactivation of old section
                    }
                    
                    // Update active link classes for ALL sets of links
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    mobileSidebarLinks.forEach(l => l.classList.remove('active'));
                    
                    // Find corresponding links in both desktop and mobile to activate
                    document.querySelectorAll(`.sidebar-link[data-section="${targetSectionId}"]`).forEach(activeLink => {
                        activeLink.classList.add('active');
                    });
                    
                    contentSections.forEach(section => section.classList.remove('active'));
                    const targetSection = document.getElementById(targetSectionId);
                    if (targetSection) {
                        targetSection.classList.add('active');
                    } else {
                        return;
                    }

                    // Activate new section's module AFTER UI change
                    handleSectionChange(targetSectionId);


                    if (targetSectionId === 'map-section' && App.Maps && App.Maps.onMapViewActivated) {
                        App.Maps.onMapViewActivated(userProfileData);
                    }

                    if (App.Maps && App.Maps.hideLocationPicker) {
                        App.Maps.hideLocationPicker();
                    }
                });
            });
        }

        function setupMobileSidebar() {
            if (!mobileMenuToggle || !mobileSidebar || !mobileOverlay || !closeMobileSidebarButton) {
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
            
            // Mobile links already handled by allSidebarLinks in setupSidebarNavigation,
            // but we still need to close the nav after click.
            mobileSidebarLinks.forEach(link => {
                 link.addEventListener('click', closeMobileNav);
            });
        }

        async function initializeDashboard() {
            if (loadingState) loadingState.style.display = 'block';
            if (mainContent) mainContent.classList.add('hidden');
            if (profileLoadErrorDiv) profileLoadErrorDiv.classList.add('hidden');

            try {
                // 1. Fetch User Profile
                const { data: profile, error: profileError } = await _supabase
                    .from('profiles')
                    .select('*, latitude, longitude') // Ensure latitude and longitude are fetched
                    .eq('id', currentUser.id)
                    .single();

                if (profileError) throw profileError;
                if (!profile) throw new Error("User profile not found.");
                userProfileData = profile;

                // **** ROLE CHECK ****
                if (userProfileData.role !== 'walker') {
                    window.location.href = userProfileData.role === 'owner' ? 'owner-dashboard.html' : 'login.html';
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

                // Initialize WalkerProfile Module
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
                });

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

                // Initialize QuickRideWalker Module -- NEW --
                if (!App.QuickRideWalker || !App.QuickRideWalker.init) {
                    displayError("QuickRideWalker module not loaded."); return;
                }
                App.QuickRideWalker.init(_supabase, currentUser, userProfileData, {
                    myAcceptedRidesListDiv: document.getElementById('my-accepted-quickride-list'),
                    noAcceptedRidesMessage: document.getElementById('no-accepted-rides-message'),
                    availableRidesListDiv: document.getElementById('available-quickride-list'),
                    availableRidesMessage: document.getElementById('available-rides-message'),
                    refreshBtn: document.getElementById('refresh-available-rides-btn'),
                    refreshSpinner: document.getElementById('refresh-spinner')
                });


                // 3. Setup UI Interactions
                setupSidebarNavigation();
                setupMobileSidebar();

                // 4. Show Content
                if (loadingState) loadingState.style.display = 'none';
                if (mainContent) mainContent.classList.remove('hidden');

                // Activate the default section (e.g., profile) and its module logic
                const defaultActiveLink = document.querySelector('.sidebar-link[data-section="profile-section"]');
                if (defaultActiveLink) {
                    defaultActiveLink.click(); // This will trigger setupSidebarNavigation logic including handleSectionChange
                } else { // Fallback if no default link, manually set currentActiveSectionId if needed
                     currentActiveSectionId = 'profile-section'; // Assuming profile is default
                }


            } catch (error) {
                displayError(`Failed to initialize walker dashboard: ${error.message || error}`);
            }
        }

        initializeDashboard();

    });
})(window.App = window.App || {});