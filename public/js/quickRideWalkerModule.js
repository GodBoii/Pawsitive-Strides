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

        // Filter for only 'accepted' rides for this active list.
        // Rides marked 'completed' will disappear from this specific view.
        const acceptedRides = rides.filter(ride => ride.status === 'accepted');

        if (!acceptedRides || acceptedRides.length === 0) {
            _domElements.noAcceptedRidesMessage.textContent = "You don't have any active accepted rides."; // Updated message
            _domElements.noAcceptedRidesMessage.classList.remove('hidden');
            return;
        }
        _domElements.noAcceptedRidesMessage.classList.add('hidden');

        acceptedRides.forEach(ride => {
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
            
            const actionsDiv = createSafeElement('div', { className: 'mt-3 pt-2 border-t border-emerald-200 flex justify-end space-x-2 items-center' });
            
            const viewOwnerBtn = createSafeElement('button', {
                className: 'view-owner-profile-btn-accepted text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-2.5 py-1 rounded-md transition-colors duration-150',
                'data-owner-id': ride.owner_id, 
                'data-owner-name': ownerName
            }, 'View Owner');
            actionsDiv.appendChild(viewOwnerBtn);

            if (ride.status === 'accepted') {
                const completeButton = createSafeElement('button', {
                    className: 'complete-ride-btn text-xs bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2.5 rounded-md transition-colors duration-150',
                    'data-ride-id': ride.id
                }, 'Mark as Completed');
                actionsDiv.appendChild(completeButton);
            }
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
            const card = createSafeElement('div', { className: 'quickride-walker-card p-4 bg-white shadow-md hover:shadow-lg transition-shadow duration-150 rounded-lg border border-amber-200' });
            
            const header = createSafeElement('div', { className: 'flex justify-between items-start mb-2' });
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
        _domElements.noAcceptedRidesMessage.style.color = ''; 
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
                .in('status', ['accepted']) // Fetch only 'accepted' for this active list.
                .order('walk_datetime', { ascending: true });

            if (error) throw error;
            displayMyAcceptedRides(data);
        } catch (error) {
            _domElements.noAcceptedRidesMessage.textContent = `Error loading accepted rides: ${error.message}`;
            _domElements.noAcceptedRidesMessage.className = 'text-red-600 italic text-lg'; 
        }
    }

    async function fetchAvailableQuickRides(showLoading = true) {
        if (!_supabase || !_userProfileData || !_domElements.availableRidesMessage) return;

        if (showLoading) {
            _domElements.availableRidesMessage.textContent = 'Searching for nearby rides...';
            _domElements.availableRidesMessage.classList.remove('hidden');
            _domElements.availableRidesMessage.style.color = ''; 
            _domElements.availableRidesMessage.className = 'text-stone-500 italic text-lg mb-4';
            toggleSpinner(true);
        }

        try {
            // The RPC get_available_quick_rides was updated to filter out past rides
            const { data, error } = await _supabase.rpc('get_available_quick_rides'); 
            
            if (error) throw error;
            displayAvailableRides(data);

        } catch (error) {
            _domElements.availableRidesMessage.textContent = `Error fetching available rides: ${error.message}`;
            _domElements.availableRidesMessage.className = 'text-red-600 italic text-lg mb-4'; 
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
            _domElements.availableRidesMessage.className = 'text-stone-600 italic text-lg mb-4'; 
        }

        try {
            const { data, error } = await _supabase.rpc('accept_quick_ride', { p_ride_id: rideId });
            if (error) throw error;

            if (_domElements.availableRidesMessage) {
                _domElements.availableRidesMessage.textContent = 'Ride accepted successfully!';
                _domElements.availableRidesMessage.className = 'text-emerald-600 italic text-lg mb-4'; 
                 setTimeout(() => {
                    if(_domElements.availableRidesMessage && _domElements.availableRidesMessage.textContent === 'Ride accepted successfully!') { 
                        _domElements.availableRidesMessage.classList.add('hidden');
                    }
                 }, 3000);
            }
            fetchMyAcceptedQuickRides();
            fetchAvailableQuickRides(false); 

        } catch (error) {
            if (_domElements.availableRidesMessage) {
                _domElements.availableRidesMessage.textContent = `Error: ${error.message || 'Could not accept ride. It might have been taken.'}`;
                _domElements.availableRidesMessage.className = 'text-red-600 italic text-lg mb-4'; 
            }
            button.disabled = false; 
            button.textContent = 'Accept Ride';
        }
    }

    async function handleCompleteRideClick(event) {
        const button = event.target.closest('.complete-ride-btn');
        if (!button || button.disabled) return;
        const rideId = button.dataset.rideId;
        if (!rideId) return;

        const confirmed = confirm("Are you sure you want to mark this ride as completed?");
        if (!confirmed) return;

        button.disabled = true;
        const originalButtonText = button.textContent;
        button.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-3 w-3 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>Completing...`;
        
        let messageArea = _domElements.noAcceptedRidesMessage; // Default message area
        if(messageArea){ // Ensure it exists
            messageArea.textContent = 'Marking ride as completed...';
            messageArea.classList.remove('hidden');
            messageArea.className = 'text-stone-600 italic text-lg mb-2';
        }


        try {
            const { data, error } = await _supabase.rpc('complete_quick_ride_walker', { p_ride_id: rideId });
            if (error) throw error;

            if (messageArea) {
                messageArea.textContent = 'Ride marked as completed successfully!';
                messageArea.className = 'text-emerald-600 italic text-lg mb-2';
                 setTimeout(() => { // Let fetchMyAcceptedQuickRides handle the final message display
                    // if(messageArea && messageArea.textContent === 'Ride marked as completed successfully!') {
                    //    messageArea.classList.add('hidden'); // Or let the refresh handle it.
                    // }
                 }, 2500);
            }
            fetchMyAcceptedQuickRides(); // Refresh the list, completed ride will disappear. This function also sets the "no rides" message if needed.

        } catch (error) {
            if (messageArea) {
                messageArea.textContent = `Error: ${error.message || 'Could not complete ride.'}`;
                messageArea.className = 'text-red-600 italic text-lg mb-2';
            }
            button.disabled = false; 
            button.textContent = originalButtonText;
        }
    }

    function handleViewOwnerProfileClick(event) {
        const button = event.target.closest('.view-owner-profile-btn, .view-owner-profile-btn-accepted');
        if (!button) return;

        const ownerId = button.dataset.ownerId;
        const ownerName = button.dataset.ownerName;
        const distance = button.dataset.distance; 

        if (!ownerId) {
            return;
        }
        
        if (App.ProfileModal && App.ProfileModal.show) {
            App.ProfileModal.show(ownerId, 'owner', ownerName, distance);
        } else {
            alert("Profile viewing feature is temporarily unavailable.");
        }
    }

    // --- Realtime Functions ---
    function subscribeToQuickRideChanges() {
        if (_realtimeChannel) {
            unsubscribeFromQuickRideChanges(); 
        }

        _realtimeChannel = _supabase.channel('public-quick-rides-feed')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'quick_rides' }, 
                (payload) => {
                    // Refresh available rides if a new ride is inserted or an existing one becomes pending
                    if (payload.eventType === 'INSERT' || 
                       (payload.eventType === 'UPDATE' && payload.old && 
                           (payload.old.status === 'pending_acceptance' || payload.new.status === 'pending_acceptance')
                       )) {
                        fetchAvailableQuickRides(false); 
                    }
                     // Refresh accepted rides if a ride current user accepted is updated (e.g. cancelled by owner, or completed by self via another tab/device)
                    if (payload.eventType === 'UPDATE' && payload.new && payload.new.accepted_walker_id === _currentUser.id) {
                        fetchMyAcceptedQuickRides();
                    }
                    // Also, if a ride is deleted that might have been in the accepted list
                    if (payload.eventType === 'DELETE' && payload.old && payload.old.accepted_walker_id === _currentUser.id) {
                        fetchMyAcceptedQuickRides();
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    showError('Error subscribing to real-time updates');
                }
            });
    }

    function unsubscribeFromQuickRideChanges() {
        if (_realtimeChannel) {
            _supabase.removeChannel(_realtimeChannel)
                .catch(err => {});
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

            if (!_domElements.availableRidesListDiv || !_domElements.myAcceptedRidesListDiv) {
                 return null;
            }

            if (_domElements.refreshBtn) {
                _domElements.refreshBtn.addEventListener('click', () => fetchAvailableQuickRides(true));
            }
            
            const eventHandler = (e) => {
                const acceptBtn = e.target.closest('.accept-ride-btn');
                const profileBtn = e.target.closest('.view-owner-profile-btn');
                const acceptedProfileBtn = e.target.closest('.view-owner-profile-btn-accepted');
                const completeBtn = e.target.closest('.complete-ride-btn');

                if (acceptBtn) {
                    handleAcceptRideClick(e);
                } else if (profileBtn || acceptedProfileBtn) {
                    handleViewOwnerProfileClick(e); 
                } else if (completeBtn) {
                    handleCompleteRideClick(e);
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
            if(!_userProfileData || !_userProfileData.latitude || !_userProfileData.longitude) {
                if(_domElements.availableRidesMessage) {
                    _domElements.availableRidesMessage.textContent = 'Your location is not set in your profile. Please update your address to see nearby rides.';
                    _domElements.availableRidesMessage.classList.remove('hidden');
                    _domElements.availableRidesMessage.className = 'text-red-600 italic text-lg mb-4'; 
                }
            }
            fetchMyAcceptedQuickRides();
            fetchAvailableQuickRides(true);
            subscribeToQuickRideChanges();
        },
        onViewDeactivated: function() {
            unsubscribeFromQuickRideChanges();
        }
    };

})(window.App = window.App || {});