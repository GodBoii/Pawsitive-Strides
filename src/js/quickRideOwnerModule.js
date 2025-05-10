// js/quickRideOwnerModule.js
(function(App) {
    'use strict';

    let _supabase;
    let _currentUser;
    let _ownerDogs = [];
    let _domElements = {
        // myRidesListDiv, noMyRidesMessage, newRideBtn, newRideForm,
        // dogSelect, dateTimeInput, payInput, instructionsInput, formMessage,
        // submitQuickRideBtn, cancelNewQuickRideBtn
    };

    // Ensure pawsitiveCommon and its utilities are loaded
    if (!window.pawsitiveCommon || !window.pawsitiveCommon.createSafeElement || !window.pawsitiveCommon.sanitizeHTML) {
        console.error("[QuickRideOwnerModule] pawsitiveCommon or its utilities (createSafeElement, sanitizeHTML) not found. Module cannot function correctly.");
        // Optionally, prevent further execution or set a flag
        App.QuickRideOwner = { init: () => {}, refreshMyRides: () => {} };
        return;
    }
    const { createSafeElement, sanitizeHTML } = window.pawsitiveCommon;


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

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'pending_acceptance': return 'bg-yellow-100 text-yellow-800';
            case 'accepted': return 'bg-green-100 text-green-800';
            case 'completed': return 'bg-blue-100 text-blue-800';
            case 'cancelled_by_owner':
            case 'cancelled_by_walker':
                return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function displayMyRides(rides) {
        if (!_domElements.myRidesListDiv || !_domElements.noMyRidesMessage) {
            console.error("[QuickRideOwnerModule] Rides list or no rides message element not found.");
            return;
        }
        _domElements.myRidesListDiv.innerHTML = '';

        if (!rides || rides.length === 0) {
            _domElements.noMyRidesMessage.classList.remove('hidden');
            _domElements.noMyRidesMessage.textContent = "You haven't posted any Quick Rides yet.";
            return;
        }
        _domElements.noMyRidesMessage.classList.add('hidden');

        rides.forEach(ride => {
            const card = createSafeElement('div', { className: 'quickride-card p-4 border rounded-lg shadow mb-4 bg-white' });

            const header = createSafeElement('div', { className: 'flex justify-between items-center mb-2' });
            const dogNameText = ride.dogs && ride.dogs.name ? sanitizeHTML(ride.dogs.name) : 'Dog (Name N/A)';
            header.appendChild(createSafeElement('h4', { className: 'text-lg font-semibold text-purple-700' }, `Walk for ${dogNameText}`));

            const statusBadgeClass = getStatusBadgeClass(ride.status);
            const statusText = sanitizeHTML(ride.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
            header.appendChild(createSafeElement('span', {className: `px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClass}`}, statusText));
            card.appendChild(header);

            const detailsGrid = createSafeElement('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600' });

            // MODIFIED: Use array of nodes for content with <strong>
            detailsGrid.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', {}, 'Time:'),
                    document.createTextNode(` ${formatRideDateTime(ride.walk_datetime)}`)
                ])
            );
            detailsGrid.appendChild(
                createSafeElement('p', {}, [
                    createSafeElement('strong', {}, 'Pay:'),
                    document.createTextNode(` ₹${sanitizeHTML(String(ride.pay_amount))}`)
                ])
            );
            if (ride.instructions) {
                detailsGrid.appendChild(
                    createSafeElement('p', { className: 'sm:col-span-2 mt-1' }, [
                        createSafeElement('strong', {}, 'Instructions:'),
                        document.createTextNode(` ${sanitizeHTML(ride.instructions)}`)
                    ])
                );
            }

            const acceptedWalkerName = ride.accepted_walker && ride.accepted_walker.full_name ? sanitizeHTML(ride.accepted_walker.full_name) : null;
            let walkerInfoPara;
            if (acceptedWalkerName) {
                 walkerInfoPara = createSafeElement('p', { className: 'sm:col-span-2 mt-1 text-green-700 font-medium' });
                 // MODIFIED: Use array of nodes
                 walkerInfoPara.appendChild(createSafeElement('strong', {}, 'Accepted by:'));
                 walkerInfoPara.appendChild(document.createTextNode(` ${acceptedWalkerName}`));
            } else if (ride.accepted_walker_id && ride.status === 'accepted') {
                 walkerInfoPara = createSafeElement('p', { className: 'sm:col-span-2 mt-1 text-green-700 font-medium' });
                 // MODIFIED: Use array of nodes
                 walkerInfoPara.appendChild(createSafeElement('strong', {}, 'Accepted by:'));
                 walkerInfoPara.appendChild(document.createTextNode(` Walker (ID: ${sanitizeHTML(ride.accepted_walker_id.substring(0,8))}...)`));
            }
            if (walkerInfoPara) detailsGrid.appendChild(walkerInfoPara);

            card.appendChild(detailsGrid);

            // Actions Div
            const actionsDiv = createSafeElement('div', { className: 'mt-3 pt-3 border-t border-gray-200 flex justify-end space-x-3' });

            if (ride.status === 'pending_acceptance') {
                const cancelButton = createSafeElement('button', {
                    className: 'cancel-ride-btn text-red-500 hover:text-red-700 text-sm font-medium focus:outline-none flex items-center',
                    'data-ride-id': ride.id
                }, [
                    createSafeElement('svg', { xmlns: "http://www.w3.org/2000/svg", className:"h-4 w-4 mr-1", fill:"none", viewBox:"0 0 24 24", stroke:"currentColor", "stroke-width":"2"}, [
                        createSafeElement('path', {"stroke-linecap":"round", "stroke-linejoin":"round", d:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"})
                    ]),
                    'Cancel Ride'
                ]);
                actionsDiv.appendChild(cancelButton);
            }

            if (ride.status === 'accepted' && ride.accepted_walker_id) {
                const viewWalkerButton = createSafeElement('button', {
                    className: 'view-walker-profile-btn bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-medium py-1.5 px-3 rounded-md transition',
                    'data-walker-id': ride.accepted_walker_id,
                    'data-walker-name': acceptedWalkerName || 'Walker'
                }, 'View Walker Profile');
                actionsDiv.appendChild(viewWalkerButton);
            }

            if (actionsDiv.hasChildNodes()) {
                card.appendChild(actionsDiv);
            }

            _domElements.myRidesListDiv.appendChild(card);
        });
    }

    function populateDogSelect() {
        if (!_domElements.dogSelect) return;
        _domElements.dogSelect.innerHTML = '<option value="">Select your dog</option>';

        if (_ownerDogs.length === 0) {
            _domElements.dogSelect.innerHTML = '<option value="">No dogs found. Please add a dog in your Profile.</option>';
            _domElements.dogSelect.disabled = true;
            return;
        }
        _domElements.dogSelect.disabled = false;
        _ownerDogs.forEach(dog => {
            const option = createSafeElement('option', { value: dog.id }, sanitizeHTML(dog.name));
            _domElements.dogSelect.appendChild(option);
        });
    }

    async function fetchMyRides() {
        if (!_supabase || !_currentUser || !_domElements.noMyRidesMessage) return;
        _domElements.noMyRidesMessage.textContent = 'Loading your rides...';
        _domElements.noMyRidesMessage.classList.remove('hidden');
        _domElements.noMyRidesMessage.style.color = 'inherit';

        try {
            const { data, error } = await _supabase
                .from('quick_rides')
                .select(`
                    id,
                    dog_id,
                    walk_datetime,
                    pay_amount,
                    instructions,
                    status,
                    accepted_walker_id,
                    created_at,
                    dogs (name),
                    accepted_walker:profiles!quick_rides_accepted_walker_id_fkey (full_name)
                `)
                .eq('owner_id', _currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            displayMyRides(data);

        } catch (error) {
            console.error('[QuickRideOwnerModule] Error fetching my rides:', error);
            if (_domElements.noMyRidesMessage) {
                 _domElements.noMyRidesMessage.textContent = `Error loading rides: ${error.message}`;
                 _domElements.noMyRidesMessage.style.color = 'red';
            } else {
                if(_domElements.formMessage) {
                     _domElements.formMessage.textContent = `Error loading rides: ${error.message}`;
                     _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
                }
            }
        }
    }

    async function fetchOwnerDogs() {
        if (!_supabase || !_currentUser) return;
        try {
            const { data, error } = await _supabase
                .from('dogs')
                .select('id, name')
                .eq('owner_id', _currentUser.id)
                .order('name', { ascending: true });
            if (error) throw error;
            _ownerDogs = data || [];
        } catch (error) {
            console.error('[QuickRideOwnerModule] Error fetching owner dogs:', error);
            _ownerDogs = [];
        }
    }

    async function handleNewRideFormSubmit(event) {
        event.preventDefault();
        if (!_domElements.newRideForm || !_domElements.formMessage || !_domElements.submitQuickRideBtn) return;

        _domElements.formMessage.textContent = 'Processing...';
        _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-gray-600';
        _domElements.submitQuickRideBtn.disabled = true;
        _domElements.submitQuickRideBtn.textContent = 'Posting...';

        const dogId = _domElements.dogSelect.value;
        const walkDatetime = _domElements.dateTimeInput.value;
        const payAmount = parseFloat(_domElements.payInput.value);
        const instructions = _domElements.instructionsInput.value.trim();

        if (!dogId) {
            _domElements.formMessage.textContent = 'Please select a dog.';
            _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
            _domElements.submitQuickRideBtn.disabled = false;
            _domElements.submitQuickRideBtn.textContent = 'Post Ride';
            return;
        }
        if (!walkDatetime) {
            _domElements.formMessage.textContent = 'Please select a date and time for the walk.';
             _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
            _domElements.submitQuickRideBtn.disabled = false;
            _domElements.submitQuickRideBtn.textContent = 'Post Ride';
            return;
        }
        if (new Date(walkDatetime) <= new Date()) {
            _domElements.formMessage.textContent = 'Walk date and time must be in the future.';
             _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
            _domElements.submitQuickRideBtn.disabled = false;
            _domElements.submitQuickRideBtn.textContent = 'Post Ride';
            return;
        }
        if (isNaN(payAmount) || payAmount <= 0) {
            _domElements.formMessage.textContent = 'Please enter a valid pay amount greater than zero.';
             _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
            _domElements.submitQuickRideBtn.disabled = false;
            _domElements.submitQuickRideBtn.textContent = 'Post Ride';
            return;
        }

        try {
            const { data, error } = await _supabase.rpc('create_quick_ride', {
                p_dog_id: dogId,
                p_walk_datetime: new Date(walkDatetime).toISOString(),
                p_pay_amount: payAmount,
                p_instructions: instructions || null
            });

            if (error) throw error;

            _domElements.formMessage.textContent = 'Quick Ride posted successfully!';
            _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-green-600';
            _domElements.newRideForm.reset();
            toggleNewRideForm(false);
            fetchMyRides();

            setTimeout(() => {
                if (_domElements.formMessage.textContent === 'Quick Ride posted successfully!') {
                    _domElements.formMessage.textContent = '';
                }
            }, 3000);

        } catch (error) {
            console.error('[QuickRideOwnerModule] Error posting Quick Ride:', error);
            _domElements.formMessage.textContent = `Error: ${error.message || 'Could not post ride.'}`;
            _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
        } finally {
            _domElements.submitQuickRideBtn.disabled = false;
            _domElements.submitQuickRideBtn.textContent = 'Post Ride';
        }
    }

    async function handleCancelRide(event) {
        const rideId = event.target.closest('button')?.dataset.rideId;
        if (!rideId) return;

        const confirmCancel = confirm('Are you sure you want to cancel this Quick Ride? This action cannot be undone.');
        if (!confirmCancel) return;

        const cancelButton = event.target.closest('button');
        if(cancelButton) cancelButton.disabled = true;

        if (_domElements.formMessage) { // Use formMessage for feedback, as it's consistently present
            _domElements.formMessage.textContent = 'Cancelling ride...';
            _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-gray-600';
        }

        try {
            const { data, error } = await _supabase.rpc('cancel_quick_ride_owner', { p_ride_id: rideId });

            if (error) throw error;

            if (_domElements.formMessage) {
                _domElements.formMessage.textContent = 'Ride cancelled successfully.';
                _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-green-600';
            }
            fetchMyRides();

            setTimeout(() => {
                if (_domElements.formMessage && _domElements.formMessage.textContent === 'Ride cancelled successfully.') {
                     _domElements.formMessage.textContent = '';
                }
            }, 3000);

        } catch (error) {
            console.error('[QuickRideOwnerModule] Error cancelling ride:', error);
            if (_domElements.formMessage) {
                _domElements.formMessage.textContent = `Error cancelling ride: ${error.message}`;
                _domElements.formMessage.className = 'quickride-form-message ml-4 text-sm text-red-600';
            }
             if(cancelButton) cancelButton.disabled = false;
        }
    }

    function handleViewWalkerProfileClick(event) {
        const button = event.target.closest('.view-walker-profile-btn');
        if (!button) return;

        const walkerId = button.dataset.walkerId;
        const walkerName = button.dataset.walkerName;

        if (!walkerId) {
            console.warn("[QuickRideOwnerModule] Walker ID not found on button.");
            return;
        }

        if (App.ProfileModal && App.ProfileModal.show) {
            App.ProfileModal.show(walkerId, 'walker', walkerName, null);
        } else {
            console.error("[QuickRideOwnerModule] App.ProfileModal.show function not found. Cannot display walker profile.");
            alert("Profile viewing feature is temporarily unavailable.");
        }
    }

    function toggleNewRideForm(show) {
        if (!_domElements.newRideForm || !_domElements.formMessage || !_domElements.dateTimeInput) return;
        if (show) {
            _domElements.newRideForm.classList.remove('hidden');
            _domElements.formMessage.textContent = '';
            _domElements.newRideForm.reset();

            const now = new Date();
            now.setMinutes(now.getMinutes() + 15);
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            _domElements.dateTimeInput.min = `${year}-${month}-${day}T${hours}:${minutes}`;
            _domElements.dateTimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;

            if(_ownerDogs.length === 0 && _domElements.dogSelect) {
                _domElements.dogSelect.innerHTML = '<option value="">Please add a dog in your Profile first.</option>';
                _domElements.dogSelect.disabled = true;
                if (_domElements.submitQuickRideBtn) _domElements.submitQuickRideBtn.disabled = true;
            } else if (_domElements.dogSelect) {
                 _domElements.dogSelect.disabled = false;
                 if (_domElements.submitQuickRideBtn) _domElements.submitQuickRideBtn.disabled = false;
            }
        } else {
            _domElements.newRideForm.classList.add('hidden');
        }
    }

    App.QuickRideOwner = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _domElements = domRefs;

            if (!_domElements.myRidesListDiv || !_domElements.newRideBtn || !_domElements.newRideForm) {
                console.warn("[QuickRideOwnerModule] Essential DOM elements for QuickRideOwner not found.");
            }
            console.log('[QuickRideOwnerModule] Initialized.');

            if (_domElements.newRideBtn) {
                _domElements.newRideBtn.addEventListener('click', () => toggleNewRideForm(true));
            }
            if (_domElements.cancelNewQuickRideBtn) {
                _domElements.cancelNewQuickRideBtn.addEventListener('click', () => toggleNewRideForm(false));
            }
            if (_domElements.newRideForm) {
                _domElements.newRideForm.addEventListener('submit', handleNewRideFormSubmit);
            }

            if (_domElements.myRidesListDiv) {
                _domElements.myRidesListDiv.addEventListener('click', (e) => {
                    const cancelButton = e.target.closest('.cancel-ride-btn');
                    const viewWalkerButton = e.target.closest('.view-walker-profile-btn');

                    if (cancelButton) {
                        e.preventDefault();
                        handleCancelRide(e);
                    } else if (viewWalkerButton) {
                        e.preventDefault();
                        handleViewWalkerProfileClick(e);
                    }
                });
            }

            fetchOwnerDogs().then(() => {
                populateDogSelect();
                if (_domElements.newRideForm.classList.contains('hidden') === false) {
                    if(_ownerDogs.length === 0 && _domElements.dogSelect) {
                        if (_domElements.submitQuickRideBtn) _domElements.submitQuickRideBtn.disabled = true;
                    } else if (_domElements.dogSelect) {
                        if (_domElements.submitQuickRideBtn) _domElements.submitQuickRideBtn.disabled = false;
                    }
                }
            });
            fetchMyRides();
        },
        refreshMyRides: fetchMyRides
    };

})(window.App = window.App || {});