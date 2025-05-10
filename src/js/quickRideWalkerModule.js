// js/quickRideWalkerModule.js
(function(App) {
    'use strict';

    let _supabase;
    let _currentUser;
    let _userProfileData; // Walker's profile for their location
    let _domElements = {
        myAcceptedRidesListDiv: null,
        noAcceptedRidesMessage: null,
        availableRidesListDiv: null,
        availableRidesMessage: null,
        refreshBtn: null,
        refreshSpinner: null
    };
    let _realtimeChannel = null;

    // Ensure pawsitiveCommon and its utilities are loaded
    if (!window.pawsitiveCommon || !window.pawsitiveCommon.createSafeElement || !window.pawsitiveCommon.sanitizeHTML) {
        console.error("[QuickRideWalkerModule] pawsitiveCommon or its utilities not found.");
        // Optionally, prevent further execution or set a flag
        App.QuickRideWalker = { init: () => {}, onViewActivated: () => {}, onViewDeactivated: () => {} };
        return;
    }
    const { createSafeElement, sanitizeHTML } = window.pawsitiveCommon;

    // --- Helper Functions ---
    function formatRideDateTime(dateTimeString) {
        if (!dateTimeString) return 'N/A';
        try {
            const date = new Date(dateTimeString);
            return `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        } catch (e) {
            console.error("Error formatting date:", e);
            return dateTimeString;
        }
    }

    function toggleSpinner(show) {
        if (_domElements.refreshSpinner) {
            _domElements.refreshSpinner.classList.toggle('hidden', !show);
            if (show) {
                 _domElements.refreshSpinner.classList.add('animate-spin');
            } else {
                _domElements.refreshSpinner.classList.remove('animate-spin');
            }
        }
        if (_domElements.refreshBtn) {
            _domElements.refreshBtn.disabled = show;
        }
    }

    // --- Display Functions ---
    function displayMyAcceptedRides(rides) {
        if (!_domElements.myAcceptedRidesListDiv || !_domElements.noAcceptedRidesMessage) return;
        _domElements.myAcceptedRidesListDiv.innerHTML = ''; // Clear previous

        if (!rides || rides.length === 0) {
            _domElements.noAcceptedRidesMessage.classList.remove('hidden');
            return;
        }
        _domElements.noAcceptedRidesMessage.classList.add('hidden');

        rides.forEach(ride => {
            const card = createSafeElement('div', { className: 'quickride-walker-card p-4 border-l-4 border-green-600 bg-green-50 rounded-md' });
            
            const dogName = ride.dogs && ride.dogs.name ? sanitizeHTML(ride.dogs.name) : 'Dog (Name N/A)';
            const ownerName = ride.owner && ride.owner.full_name ? sanitizeHTML(ride.owner.full_name) : 'Owner (Name N/A)';
            
            card.appendChild(createSafeElement('h4', { className: 'font-semibold text-md text-green-800 mb-1' }, `${dogName}'s Walk with ${ownerName}`));
            
            const detailsContainer = createSafeElement('div', {className: 'space-y-1 text-xs text-gray-700'});

            // MODIFIED: Use array of nodes for content with <strong>
            detailsContainer.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', {}, 'Scheduled for:'),
                    document.createTextNode(` ${formatRideDateTime(ride.walk_datetime)}`)
                ])
            );
            detailsContainer.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', {}, 'Your Payout:'),
                    document.createTextNode(` ₹${sanitizeHTML(String(ride.pay_amount))}`)
                ])
            );
            
            if (ride.owner && ride.owner.mobile) {
                 detailsContainer.appendChild(
                    createSafeElement('p', {}, [
                        createSafeElement('strong', {}, 'Owner Contact:'),
                        document.createTextNode(` ${sanitizeHTML(ride.owner.mobile)}`)
                    ])
                 );
            }
            if (ride.owner && ride.owner.address) {
                 detailsContainer.appendChild(
                    createSafeElement('p', {}, [
                        createSafeElement('strong', {}, 'Location:'),
                        document.createTextNode(` ${sanitizeHTML(ride.owner.address)}`)
                    ])
                 );
            }
             if (ride.instructions) {
                detailsContainer.appendChild(
                    createSafeElement('p', {className: 'mt-1 pt-1 border-t border-green-200'}, [
                        createSafeElement('strong', {}, 'Instructions:'),
                        document.createTextNode(` ${sanitizeHTML(ride.instructions)}`)
                    ])
                );
            }

            card.appendChild(detailsContainer);
            
            const actionsDiv = createSafeElement('div', { className: 'mt-3 pt-2 border-t border-green-200 flex justify-end space-x-2' });
            const viewOwnerBtn = createSafeElement('button', {
                className: 'view-owner-profile-btn-accepted text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2.5 py-1 rounded-md',
                'data-owner-id': ride.owner_id, 
                'data-owner-name': ownerName // Use the already sanitized ownerName
            }, 'View Owner');
            actionsDiv.appendChild(viewOwnerBtn);
            card.appendChild(actionsDiv);

            _domElements.myAcceptedRidesListDiv.appendChild(card);
        });
    }

    function displayAvailableRides(rides) {
        if (!_domElements.availableRidesListDiv || !_domElements.availableRidesMessage) return;
        _domElements.availableRidesListDiv.innerHTML = ''; 

        if (!rides || rides.length === 0) {
            _domElements.availableRidesMessage.textContent = 'No Quick Rides currently available in your area. Check back soon or expand your search settings if applicable.';
            _domElements.availableRidesMessage.classList.remove('hidden');
            return;
        }
        _domElements.availableRidesMessage.classList.add('hidden');

        rides.forEach(ride => {
            const card = createSafeElement('div', { className: 'quickride-walker-card p-4 bg-white shadow-sm hover:shadow-md transition-shadow' });
            
            const header = createSafeElement('div', { className: 'flex justify-between items-start mb-2' });
            header.appendChild(createSafeElement('h4', { className: 'font-semibold text-lg text-purple-700' }, `Walk for ${sanitizeHTML(ride.dog_name)}`));
            header.appendChild(createSafeElement('span', {className: 'text-lg font-bold text-green-600'}, `₹${sanitizeHTML(String(ride.pay_amount))}`));
            card.appendChild(header);

            const detailsGrid = createSafeElement('div', { className: 'grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 mb-3' });
            
            // MODIFIED: Use array of nodes for content with <strong>
            detailsGrid.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', {}, 'Owner:'),
                    document.createTextNode(` ${sanitizeHTML(ride.owner_full_name)}`)
                ])
            );
            detailsGrid.appendChild(createSafeElement('p', {className: 'text-right'}, `~ ${parseFloat(ride.distance_km).toFixed(1)} km away`));
            detailsGrid.appendChild(
                createSafeElement('p', { className: 'col-span-2' }, [
                    createSafeElement('strong', {}, 'Time:'),
                    document.createTextNode(` ${formatRideDateTime(ride.walk_datetime)}`)
                ])
            );
            card.appendChild(detailsGrid);
            
            if (ride.instructions) {
                 card.appendChild(
                    createSafeElement('div', {className: 'text-xs text-gray-600 italic mb-3 p-2 bg-gray-50 rounded-md border border-gray-200'}, [
                        createSafeElement('strong', {}, 'Instructions:'), // MODIFIED
                        document.createTextNode(` ${sanitizeHTML(ride.instructions.substring(0,120))}${ride.instructions.length > 120 ? '...' : '' }`)
                    ])
                );
            }

            const actionsDiv = createSafeElement('div', { className: 'flex flex-col sm:flex-row items-center sm:space-x-2 space-y-2 sm:space-y-0 mt-3 pt-3 border-t border-gray-200' });
            const acceptButton = createSafeElement('button', {
                className: 'accept-ride-btn bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-md transition w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
                'data-ride-id': ride.ride_id
            }, 'Accept Ride');
            const viewProfileButton = createSafeElement('button', {
                className: 'view-owner-profile-btn bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium py-2 px-4 rounded-md transition w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-purple-200',
                'data-owner-id': ride.owner_id, 
                'data-owner-name': ride.owner_full_name,
                'data-distance': parseFloat(ride.distance_km).toFixed(1)
            }, 'View Owner Profile');
            
            actionsDiv.append(acceptButton, viewProfileButton);
            card.appendChild(actionsDiv);

            _domElements.availableRidesListDiv.appendChild(card);
        });
    }

    // --- Data Fetching Functions ---
    async function fetchMyAcceptedQuickRides() {
        if (!_supabase || !_currentUser || !_domElements.noAcceptedRidesMessage) return;
        _domElements.noAcceptedRidesMessage.textContent = 'Loading your accepted rides...';
        _domElements.noAcceptedRidesMessage.classList.remove('hidden');
        _domElements.noAcceptedRidesMessage.style.color = 'inherit';

        try {
            const { data, error } = await _supabase
                .from('quick_rides')
                .select(`
                    *,
                    dogs (name),
                    owner:profiles!quick_rides_owner_id_fkey (full_name, mobile, address) 
                `)
                .eq('accepted_walker_id', _currentUser.id)
                .eq('status', 'accepted') 
                .order('walk_datetime', { ascending: true });

            if (error) throw error;
            displayMyAcceptedRides(data);
        } catch (error) {
            console.error('[QuickRideWalkerModule] Error fetching accepted rides:', error);
            _domElements.noAcceptedRidesMessage.textContent = `Error loading accepted rides: ${error.message}`;
            _domElements.noAcceptedRidesMessage.style.color = 'red';
        }
    }

    async function fetchAvailableQuickRides(showLoading = true) {
        if (!_supabase || !_userProfileData || !_domElements.availableRidesMessage) return;

        if (showLoading) {
            _domElements.availableRidesMessage.textContent = 'Searching for nearby rides...';
            _domElements.availableRidesMessage.classList.remove('hidden');
            _domElements.availableRidesMessage.style.color = 'inherit';
            toggleSpinner(true);
        }

        try {
            const { data, error } = await _supabase.rpc('get_available_quick_rides'); 
            
            if (error) throw error;
            displayAvailableRides(data);

        } catch (error) {
            console.error('[QuickRideWalkerModule] Error fetching available rides:', error);
            _domElements.availableRidesMessage.textContent = `Error fetching available rides: ${error.message}`;
            _domElements.availableRidesMessage.style.color = 'red';
            _domElements.availableRidesMessage.classList.remove('hidden');
        } finally {
            if (showLoading) {
                toggleSpinner(false);
            }
        }
    }

    // --- Action Handlers ---
    async function handleAcceptRideClick(event) {
        const button = event.target.closest('.accept-ride-btn');
        if (!button || button.disabled) return;
        const rideId = button.dataset.rideId;
        if (!rideId) return;

        button.disabled = true;
        button.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>Accepting...`;

        if (_domElements.availableRidesMessage) {
            _domElements.availableRidesMessage.textContent = 'Attempting to accept ride...';
            _domElements.availableRidesMessage.classList.remove('hidden');
            _domElements.availableRidesMessage.style.color = 'inherit';
        }

        try {
            const { data, error } = await _supabase.rpc('accept_quick_ride', { p_ride_id: rideId });
            if (error) throw error;

            if (_domElements.availableRidesMessage) {
                _domElements.availableRidesMessage.textContent = 'Ride accepted successfully!';
                _domElements.availableRidesMessage.style.color = 'green';
                 setTimeout(() => {
                    if(_domElements.availableRidesMessage && _domElements.availableRidesMessage.textContent === 'Ride accepted successfully!') { 
                        _domElements.availableRidesMessage.classList.add('hidden');
                    }
                 }, 3000);
            }
            fetchMyAcceptedQuickRides();
            fetchAvailableQuickRides(false); 

        } catch (error) {
            console.error('[QuickRideWalkerModule] Error accepting ride:', error);
            if (_domElements.availableRidesMessage) {
                _domElements.availableRidesMessage.textContent = `Error: ${error.message || 'Could not accept ride. It might have been taken.'}`;
                _domElements.availableRidesMessage.style.color = 'red';
            }
            button.disabled = false; 
            button.textContent = 'Accept Ride';
        }
    }

    function handleViewOwnerProfileClick(event) {
        const button = event.target.closest('.view-owner-profile-btn, .view-owner-profile-btn-accepted');
        if (!button) return;

        const ownerId = button.dataset.ownerId;
        const ownerName = button.dataset.ownerName;
        const distance = button.dataset.distance; 

        if (!ownerId) {
            console.warn("[QuickRideWalkerModule] Owner ID not found on button.");
            return;
        }
        
        if (App.ProfileModal && App.ProfileModal.show) {
            App.ProfileModal.show(ownerId, 'owner', ownerName, distance);
        } else {
            console.error("[QuickRideWalkerModule] App.ProfileModal.show function not found.");
            alert("Profile viewing feature is temporarily unavailable.");
        }
    }

    // --- Realtime Functions ---
    function subscribeToQuickRideChanges() {
        if (_realtimeChannel) {
            unsubscribeFromQuickRideChanges(); 
        }

        console.log('[QuickRideWalkerModule] Subscribing to Quick Ride changes...');
        _realtimeChannel = _supabase.channel('public-quick-rides-feed')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'quick_rides' }, 
                (payload) => {
                    console.log('[QuickRideWalkerModule] Realtime Quick Ride Change:', payload);
                    
                    if (payload.eventType === 'INSERT' || 
                       (payload.eventType === 'UPDATE' && payload.old && 
                           (payload.old.status === 'pending_acceptance' || payload.new.status === 'pending_acceptance')
                       )) {
                        console.log('[QuickRideWalkerModule] Relevant change detected, refreshing available rides.');
                        fetchAvailableQuickRides(false); 
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[QuickRideWalkerModule] Successfully subscribed to Quick Rides feed!');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.error(`[QuickRideWalkerModule] Realtime subscription error: ${status}`, err);
                }
            });
    }

    function unsubscribeFromQuickRideChanges() {
        if (_realtimeChannel) {
            console.log('[QuickRideWalkerModule] Unsubscribing from Quick Ride changes...');
            _supabase.removeChannel(_realtimeChannel)
                .then(status => console.log('[QuickRideWalkerModule] Unsubscribe status:', status))
                .catch(err => console.error('[QuickRideWalkerModule] Error unsubscribing:', err));
            _realtimeChannel = null;
        }
    }

    // --- Public Interface ---
    App.QuickRideWalker = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData;
            _domElements = domRefs; 

            console.log('[QuickRideWalkerModule] Initialized with profile:', _userProfileData ? _userProfileData.full_name : 'N/A');

            if (!_domElements.availableRidesListDiv || !_domElements.myAcceptedRidesListDiv) {
                 console.warn("[QuickRideWalkerModule] Essential DOM elements for QuickRideWalker not found.");
            }

            if (_domElements.refreshBtn) {
                _domElements.refreshBtn.addEventListener('click', () => fetchAvailableQuickRides(true));
            }
            
            const eventHandler = (e) => {
                const acceptBtn = e.target.closest('.accept-ride-btn');
                const profileBtn = e.target.closest('.view-owner-profile-btn'); // For available rides list
                const acceptedProfileBtn = e.target.closest('.view-owner-profile-btn-accepted'); // For accepted rides list

                if (acceptBtn) {
                    handleAcceptRideClick(e);
                } else if (profileBtn) {
                    handleViewOwnerProfileClick(e);
                } else if (acceptedProfileBtn) {
                    handleViewOwnerProfileClick(e); 
                }
            };

            if (_domElements.availableRidesListDiv) {
                _domElements.availableRidesListDiv.addEventListener('click', eventHandler);
            }
            if(_domElements.myAcceptedRidesListDiv) { 
                _domElements.myAcceptedRidesListDiv.addEventListener('click', eventHandler);
            }
        },
        onViewActivated: function() {
            console.log('[QuickRideWalkerModule] View Activated.');
            if(!_userProfileData || !_userProfileData.latitude || !_userProfileData.longitude) {
                console.warn("[QuickRideWalkerModule] Walker location data missing from profile. Fetching available rides might fail or be inaccurate.");
                if(_domElements.availableRidesMessage) {
                    _domElements.availableRidesMessage.textContent = 'Your location is not set in your profile. Please update your address to see nearby rides.';
                    _domElements.availableRidesMessage.classList.remove('hidden');
                    _domElements.availableRidesMessage.style.color = 'red';
                }
            }
            fetchMyAcceptedQuickRides();
            fetchAvailableQuickRides(true);
            subscribeToQuickRideChanges();
        },
        onViewDeactivated: function() {
            console.log('[QuickRideWalkerModule] View Deactivated.');
            unsubscribeFromQuickRideChanges();
        }
    };

})(window.App = window.App || {});