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
            // UPDATED: Themed card styles
            const card = createSafeElement('div', { className: 'quickride-walker-card p-4 border-l-4 border-emerald-600 bg-emerald-50 rounded-lg shadow-md mb-3' });
            
            const dogName = ride.dogs && ride.dogs.name ? sanitizeHTML(ride.dogs.name) : 'Dog (Name N/A)';
            const ownerName = ride.owner && ride.owner.full_name ? sanitizeHTML(ride.owner.full_name) : 'Owner (Name N/A)';
            
            // UPDATED: Themed heading
            card.appendChild(createSafeElement('h4', { className: 'font-serif text-lg font-semibold text-emerald-800 mb-2' }, `${dogName}'s Walk with ${ownerName}`));
            
            const detailsContainer = createSafeElement('div', {className: 'space-y-1 text-xs text-stone-700'});

            detailsContainer.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', { className: 'text-stone-800' }, 'Scheduled for:'),
                    document.createTextNode(` ${formatRideDateTime(ride.walk_datetime)}`)
                ])
            );
            detailsContainer.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', { className: 'text-stone-800' }, 'Your Payout:'),
                    document.createTextNode(` ₹${sanitizeHTML(String(ride.pay_amount))}`)
                ])
            );
            
            if (ride.owner && ride.owner.mobile) {
                 detailsContainer.appendChild(
                    createSafeElement('p', {}, [
                        createSafeElement('strong', { className: 'text-stone-800' }, 'Owner Contact:'),
                        document.createTextNode(` ${sanitizeHTML(ride.owner.mobile)}`)
                    ])
                 );
            }
            if (ride.owner && ride.owner.address) {
                 detailsContainer.appendChild(
                    createSafeElement('p', {}, [
                        createSafeElement('strong', { className: 'text-stone-800' }, 'Location:'),
                        document.createTextNode(` ${sanitizeHTML(ride.owner.address)}`)
                    ])
                 );
            }
             if (ride.instructions) {
                detailsContainer.appendChild(
                    createSafeElement('p', {className: 'mt-1 pt-1 border-t border-emerald-200'}, [
                        createSafeElement('strong', { className: 'text-stone-800' }, 'Instructions:'),
                        document.createTextNode(` ${sanitizeHTML(ride.instructions)}`)
                    ])
                );
            }

            card.appendChild(detailsContainer);
            
            const actionsDiv = createSafeElement('div', { className: 'mt-3 pt-2 border-t border-emerald-200 flex justify-end space-x-2' });
            // UPDATED: Themed button
            const viewOwnerBtn = createSafeElement('button', {
                className: 'view-owner-profile-btn-accepted text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-2.5 py-1 rounded-md transition-colors duration-150',
                'data-owner-id': ride.owner_id, 
                'data-owner-name': ownerName
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
            // UPDATED: Themed card (using .quickride-walker-card definition from inline style)
            const card = createSafeElement('div', { className: 'quickride-walker-card p-4 bg-white shadow-md hover:shadow-lg transition-shadow duration-150 rounded-lg border border-amber-200' });
            
            const header = createSafeElement('div', { className: 'flex justify-between items-start mb-2' });
            // UPDATED: Themed heading and pay amount
            header.appendChild(createSafeElement('h4', { className: 'font-serif text-xl font-semibold text-emerald-700' }, `Walk for ${sanitizeHTML(ride.dog_name)}`));
            header.appendChild(createSafeElement('span', {className: 'text-xl font-bold text-amber-600'}, `₹${sanitizeHTML(String(ride.pay_amount))}`));
            card.appendChild(header);

            const detailsGrid = createSafeElement('div', { className: 'grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-stone-600 mb-3' });
            
            detailsGrid.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', { className: 'text-stone-700' }, 'Owner:'),
                    document.createTextNode(` ${sanitizeHTML(ride.owner_full_name)}`)
                ])
            );
            detailsGrid.appendChild(createSafeElement('p', {className: 'text-right text-stone-500'}, `~ ${parseFloat(ride.distance_km).toFixed(1)} km away`));
            detailsGrid.appendChild(
                createSafeElement('p', { className: 'col-span-2' }, [
                    createSafeElement('strong', { className: 'text-stone-700' }, 'Time:'),
                    document.createTextNode(` ${formatRideDateTime(ride.walk_datetime)}`)
                ])
            );
            card.appendChild(detailsGrid);
            
            if (ride.instructions) {
                 card.appendChild(
                    createSafeElement('div', {className: 'text-xs text-stone-600 italic mb-3 p-2 bg-amber-50 rounded-md border border-amber-100'}, [
                        createSafeElement('strong', { className: 'text-stone-700'}, 'Instructions:'),
                        document.createTextNode(` ${sanitizeHTML(ride.instructions.substring(0,120))}${ride.instructions.length > 120 ? '...' : '' }`)
                    ])
                );
            }

            const actionsDiv = createSafeElement('div', { className: 'flex flex-col sm:flex-row items-center sm:space-x-2 space-y-2 sm:space-y-0 mt-3 pt-3 border-t border-stone-200' });
            // UPDATED: Themed buttons
            const acceptButton = createSafeElement('button', {
                className: 'accept-ride-btn bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transform hover:-translate-y-0.5 hover:shadow-md',
                'data-ride-id': ride.ride_id
            }, 'Accept Ride');
            const viewProfileButton = createSafeElement('button', {
                className: 'view-owner-profile-btn bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium py-2 px-4 rounded-lg transition w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1 transform hover:-translate-y-0.5 hover:shadow-sm',
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
        _domElements.noAcceptedRidesMessage.style.color = ''; // Reset color, use Tailwind class below
        _domElements.noAcceptedRidesMessage.className = 'text-stone-500 italic text-lg';


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
            _domElements.noAcceptedRidesMessage.className = 'text-red-600 italic text-lg'; // Use themed error color
        }
    }

    async function fetchAvailableQuickRides(showLoading = true) {
        if (!_supabase || !_userProfileData || !_domElements.availableRidesMessage) return;

        if (showLoading) {
            _domElements.availableRidesMessage.textContent = 'Searching for nearby rides...';
            _domElements.availableRidesMessage.classList.remove('hidden');
            _domElements.availableRidesMessage.style.color = ''; // Reset color, use Tailwind class below
            _domElements.availableRidesMessage.className = 'text-stone-500 italic text-lg mb-4';
            toggleSpinner(true);
        }

        try {
            const { data, error } = await _supabase.rpc('get_available_quick_rides'); 
            
            if (error) throw error;
            displayAvailableRides(data);

        } catch (error) {
            console.error('[QuickRideWalkerModule] Error fetching available rides:', error);
            _domElements.availableRidesMessage.textContent = `Error fetching available rides: ${error.message}`;
            _domElements.availableRidesMessage.className = 'text-red-600 italic text-lg mb-4'; // Use themed error color
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
            _domElements.availableRidesMessage.className = 'text-stone-600 italic text-lg mb-4'; // Themed processing color
        }

        try {
            const { data, error } = await _supabase.rpc('accept_quick_ride', { p_ride_id: rideId });
            if (error) throw error;

            if (_domElements.availableRidesMessage) {
                _domElements.availableRidesMessage.textContent = 'Ride accepted successfully!';
                _domElements.availableRidesMessage.className = 'text-emerald-600 italic text-lg mb-4'; // Themed success color
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
                _domElements.availableRidesMessage.className = 'text-red-600 italic text-lg mb-4'; // Themed error color
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
                     // Also refresh accepted rides if a ride current user accepted is updated (e.g. cancelled by owner)
                    if (payload.eventType === 'UPDATE' && payload.new && payload.new.accepted_walker_id === _currentUser.id) {
                        console.log('[QuickRideWalkerModule] Change detected for one of my accepted rides, refreshing list.');
                        fetchMyAcceptedQuickRides();
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
                const profileBtn = e.target.closest('.view-owner-profile-btn');
                const acceptedProfileBtn = e.target.closest('.view-owner-profile-btn-accepted');

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
                    _domElements.availableRidesMessage.className = 'text-red-600 italic text-lg mb-4'; // Themed error
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