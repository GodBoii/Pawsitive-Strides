// js/mapsModule.js

(function(App) {
    'use strict';

    let _supabase;
    let _currentUser;
    let _userProfileData; // Logged-in user's profile
    let _domElements = {}; // Stores { mapContainer, mapTitleRole, ... }

    // --- Module-Specific State for Maps ---
    const MAPS_SCRIPT_ID = 'google-maps-api-script';
    let mapsApiLoading = false;
    let mapsApiReady = false; // True when Google API is loaded AND our Geocoder is ready
    let apiReadyCallbacks = []; // Queue for functions waiting for mapsApiReady

    let geocoder = null;
    let mainMapInstance = null;
    let mainMapUserMarker = null;
    let mainMapOtherUserMarkers = [];
    let mainMapDataLoaded = false;

    let addressAutocomplete = null;
    let locationPickerMap = null;
    let locationPickerMarker = null;
    let currentPickerCallback = null;

    const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
    const DEFAULT_ZOOM = 5;
    const DETAIL_ZOOM = 15;
    const SEARCH_RADIUS_KM = 50.0;

    // Ensure pawsitiveCommon and its utilities are loaded
    if (!window.pawsitiveCommon || !window.pawsitiveCommon.createSafeElement || !window.pawsitiveCommon.sanitizeHTML) {
        App.Maps = { init: () => {}, onMapViewActivated: () => {} }; // Provide dummy functions
        return;
    }
    const { createSafeElement, sanitizeHTML } = window.pawsitiveCommon;

    const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    function formatTimeDisplay(time24h) {
        if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return 'Invalid Time';
        const [hourStr, minuteStr] = time24h.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        if (isNaN(hour) || isNaN(minute)) return 'Invalid Time';
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        return `${h12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
    }


    // --- Private Helper Functions ---

    function _whenGoogleMapsReady(callback) {
        if (mapsApiReady) {
            try {
                callback();
            } catch (e) {
            }
        } else {
            apiReadyCallbacks.push(callback);
        }
    }

    function _handleGoogleMapsApiLoadedAndTriggered() {
        if (mapsApiReady) {
            return;
        }

        if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder || !google.maps.places) {
            if (_domElements.mapContainer) {
                _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Critical Error: Google Maps components failed to load. Try refreshing.</p>`;
            }
            return;
        }

        try {
            geocoder = new google.maps.Geocoder();
            mapsApiReady = true; // Mark our module's readiness
        } catch (e) {
            mapsApiReady = false; // Ensure it's false on error
            if (_domElements.mapContainer) {
                _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Error initializing map services. Please refresh.</p>`;
            }
        }
        
        let callbackCount = apiReadyCallbacks.length;
        while (apiReadyCallbacks.length > 0) {
            const cb = apiReadyCallbacks.shift();
            try {
                cb();
            } catch (e) {
            }
        }

        if (_domElements.mapContainer && _domElements.mapContainer.closest('.content-section.active') && !mainMapInstance) {
            _initMainMapViewMap();
            if (mainMapInstance && !mainMapDataLoaded) {
                 _loadDataForMainMapView();
            }
        }
    }

    function _clearMainMapMarkers() {
        if (mainMapUserMarker) mainMapUserMarker.setMap(null);
        mainMapOtherUserMarkers.forEach(marker => marker.setMap(null));
        mainMapUserMarker = null;
        mainMapOtherUserMarkers = [];
    }

    async function _loadDataForMainMapView() {
        if (!mainMapInstance) {
            if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message">Map initializing, please wait...</p>';
            _initMainMapViewMap(); 
            if (!mainMapInstance) { 
                if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message text-red-500">Error: Map could not be initialized for data.</p>';
                return;
            }
        }
        if (!_userProfileData) {
            if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message text-red-500">Your profile data is missing. Cannot load map.</p>';
            return;
        }

        mainMapDataLoaded = false; 
        _clearMainMapMarkers();
        let mapLoadingMessage = _domElements.mapContainer.querySelector('.map-loading-message.map-overlay-message');
        if (!mapLoadingMessage) {
            mapLoadingMessage = createSafeElement('p', {
                className: 'map-loading-message map-overlay-message text-stone-600 p-4' // Themed text
            });
            mapLoadingMessage.style.position = 'absolute';
            mapLoadingMessage.style.top = '50%';
            mapLoadingMessage.style.left = '50%';
            mapLoadingMessage.style.transform = 'translate(-50%, -50%)';
            mapLoadingMessage.style.backgroundColor = 'rgba(236, 253, 245, 0.9)'; // emerald-50 with opacity
            mapLoadingMessage.style.padding = '1em';
            mapLoadingMessage.style.borderRadius = '0.75rem'; // rounded-xl
            mapLoadingMessage.style.zIndex = '10';
            mapLoadingMessage.style.textAlign = 'center';
            _domElements.mapContainer.appendChild(mapLoadingMessage);
        }
        mapLoadingMessage.textContent = 'Loading your location...';
        mapLoadingMessage.style.display = 'block';

        let userCoords = null;
        const bounds = new google.maps.LatLngBounds();

        if (_userProfileData.latitude && _userProfileData.longitude) {
            userCoords = { lat: _userProfileData.latitude, lng: _userProfileData.longitude };
            mainMapUserMarker = new google.maps.Marker({
                position: userCoords, map: mainMapInstance, title: 'Your Location',
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#059669', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }, // emerald-600
                zIndex: 100
            });
            bounds.extend(userCoords);
            mapLoadingMessage.textContent = `Finding nearby ${_userProfileData.role === 'owner' ? 'walkers' : 'owners'}...`;
        } else {
            mapLoadingMessage.textContent = 'Your location is not set. Please update your profile address to see nearby users.';
            mainMapInstance.setCenter(INDIA_CENTER);
            mainMapInstance.setZoom(DEFAULT_ZOOM);
            mainMapDataLoaded = true; 
            return; 
        }

        const targetRole = _userProfileData.role === 'owner' ? 'walker' : 'owner';
        if (_domElements.mapTitleRole) _domElements.mapTitleRole.textContent = targetRole === 'walker' ? 'Dog Walkers' : 'Pet Owners';
        if (_domElements.mapDescriptionRole) _domElements.mapDescriptionRole.textContent = targetRole === 'walker' ? 'dog walkers' : 'pet owners';

        const rpcParams = {
            user_lat: userCoords.lat, user_lng: userCoords.lng,
            search_radius_km: SEARCH_RADIUS_KM, target_role: targetRole,
            exclude_user_id: _currentUser.id
        };
        try {
            const { data: nearbyUsers, error: rpcError } = await _supabase.rpc('find_nearby_users', rpcParams);
            if (rpcError) throw rpcError;

            let plottedCount = 0;
            const infowindow = new google.maps.InfoWindow();

            if (nearbyUsers && nearbyUsers.length > 0) {
                nearbyUsers.forEach(otherUser => {
                    if (typeof otherUser.latitude === 'number' && typeof otherUser.longitude === 'number') {
                        const otherCoords = { lat: otherUser.latitude, lng: otherUser.longitude };
                        const marker = new google.maps.Marker({
                            position: otherCoords, map: mainMapInstance,
                            title: sanitizeHTML(otherUser.full_name || 'User'),
                            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: targetRole === 'walker' ? '#10b981' : '#f59e0b', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } // emerald-500 or amber-500
                        });
                        mainMapOtherUserMarkers.push(marker);
                        bounds.extend(otherCoords);
                        plottedCount++;

                        marker.addListener('click', () => {
                            const contentString = `
                                <div class="p-2 font-sans">
                                    <strong class="font-serif text-stone-800">${sanitizeHTML(otherUser.full_name || 'N/A')}</strong><br>
                                    <span class="text-sm text-stone-600">${sanitizeHTML(otherUser.role === 'owner' ? 'Pet Owner' : 'Dog Walker')}</span><br>
                                    <small class="text-xs text-stone-500">Approx. ${otherUser.distance_km?.toFixed(1) ?? '?'} km away</small>
                                    <div class="mt-2">
                                        <button class="view-profile-btn-map bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-emerald-700 transition-colors duration-150"
                                                data-user-id="${otherUser.id}"
                                                data-user-role="${otherUser.role}"
                                                data-user-name="${sanitizeHTML(otherUser.full_name || 'User')}"
                                                data-user-distance="${otherUser.distance_km?.toFixed(1) || '?'}">
                                            View Profile
                                        </button>
                                    </div>
                                </div>`;
                            infowindow.setContent(contentString);
                            infowindow.open(mainMapInstance, marker);
                        });
                    }
                });
            }
            
             google.maps.event.addListener(infowindow, 'domready', () => {
                const viewProfileBtn = document.querySelector('.view-profile-btn-map'); 
                if (viewProfileBtn && !viewProfileBtn.dataset.listenerAttachedMap) { 
                    viewProfileBtn.addEventListener('click', (e) => {
                        const btn = e.currentTarget; 
                         _viewUserProfileInModal(btn.dataset.userId, btn.dataset.userRole, btn.dataset.userName, btn.dataset.userDistance);
                    });
                    viewProfileBtn.dataset.listenerAttachedMap = 'true'; 
                }
            });

            if (plottedCount > 0 || mainMapUserMarker) { 
                if (!bounds.isEmpty()) {
                    mainMapInstance.fitBounds(bounds);
                    google.maps.event.addListenerOnce(mainMapInstance, 'idle', function() {
                        if (this.getZoom() > DETAIL_ZOOM + 1) { 
                            this.setZoom(DETAIL_ZOOM + 1);
                        }
                    });
                } else if (userCoords) { 
                    mainMapInstance.setCenter(userCoords);
                    mainMapInstance.setZoom(DETAIL_ZOOM);
                }
                mapLoadingMessage.style.display = 'none'; 
            } else { 
                mainMapInstance.setCenter(INDIA_CENTER);
                mainMapInstance.setZoom(DEFAULT_ZOOM);
                mapLoadingMessage.textContent = 'Could not display map content.'; 
                mapLoadingMessage.style.display = 'block';
            }

            if (plottedCount === 0 && mainMapUserMarker) { 
                mapLoadingMessage.textContent = `No nearby ${targetRole}s found within ${SEARCH_RADIUS_KM}km.`;
                mapLoadingMessage.style.display = 'block';
            }

        } catch (error) {
            mapLoadingMessage.textContent = `Error loading map data: ${error.message}`;
            mapLoadingMessage.style.display = 'block'; 
        } finally {
            mainMapDataLoaded = true;
        }
    }

    function _initMainMapViewMap() {
        if (mainMapInstance) {
            if (google && _domElements.mapContainer.offsetHeight > 0) { 
                google.maps.event.trigger(mainMapInstance, 'resize');
            }
            return; 
        }
    
        if (!_domElements.mapContainer) {
            return;
        }
        _domElements.mapContainer.innerHTML = ''; 
        
        try {
            mainMapInstance = new google.maps.Map(_domElements.mapContainer, {
                center: INDIA_CENTER,
                zoom: DEFAULT_ZOOM,
                mapId: '8a23b4bdd9ef4f8c', 
                mapTypeControl: false,
                streetViewControl: false,
            });
    
            requestAnimationFrame(() => { 
                if (google && mainMapInstance && _domElements.mapContainer.offsetHeight > 0) {
                    google.maps.event.trigger(mainMapInstance, 'resize');
                } else if (google && mainMapInstance) {
                }
            });
    
        } catch (error) {
            if (_domElements.mapContainer) {
                _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Could not initialize map: ${error.message}</p>`;
            }
        }
    }
    
    function _initLocationPickerMap(initialCoords, currentAddressText, callback) {
        if (!_domElements.pickerMapContainer) {
            if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = "Picker map error.";
            return;
        }
        _domElements.pickerMapContainer.classList.remove('hidden');
        _domElements.pickerMapContainer.innerHTML = `<p class="map-loading-message p-4 text-stone-500">Loading map picker...</p>`; // Themed text
        currentPickerCallback = callback;

        _whenGoogleMapsReady(() => { 
            if (!geocoder) {
                 _domElements.pickerMapContainer.innerHTML = `<p class="map-loading-message text-red-500 p-4">Map services error for picker.</p>`;
                return;
            }
            let centerPos = initialCoords || INDIA_CENTER;
            let zoomLevel = initialCoords ? DETAIL_ZOOM : DEFAULT_ZOOM;

            const createMapWithPosition = (pos, zl) => {
                 _domElements.pickerMapContainer.innerHTML = ''; 
                try {
                    if (!locationPickerMap) {
                        locationPickerMap = new google.maps.Map(_domElements.pickerMapContainer, {
                            center: pos, zoom: zl,
                            mapTypeControl: false, streetViewControl: false, fullscreenControl: false
                        });
                    } else {
                        locationPickerMap.setCenter(pos); locationPickerMap.setZoom(zl);
                    }

                    if (!locationPickerMarker) {
                        locationPickerMarker = new google.maps.Marker({
                            position: pos, map: locationPickerMap, draggable: true, title: "Drag to set location",
                            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#059669', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } // emerald-600
                        });
                        locationPickerMarker.addListener('dragend', _handlePickerMarkerDragEnd);
                    } else {
                        locationPickerMarker.setPosition(pos); locationPickerMarker.setMap(locationPickerMap);
                    }
                     if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = 'Drag marker or use address search.';
                } catch(e) {
                    _domElements.pickerMapContainer.innerHTML = `<p class="map-loading-message text-red-500 p-4">Error loading picker: ${e.message}</p>`;
                }
            };

            if (!initialCoords && currentAddressText) {
                geocoder.geocode({ address: currentAddressText, componentRestrictions: { country: 'IN' } }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        createMapWithPosition(results[0].geometry.location, DETAIL_ZOOM);
                    } else { createMapWithPosition(INDIA_CENTER, DEFAULT_ZOOM); } 
                });
            } else {
                createMapWithPosition(centerPos, zoomLevel);
            }
        });
    }

    function _handlePickerMarkerDragEnd(event) {
        const latLng = event.latLng;
        if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = 'Finding address...';
        
        _whenGoogleMapsReady(() => { 
            if (!geocoder) { 
                if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = 'Geocoder service not ready.';
                return; 
            }
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    const pickedLocation = { lat: latLng.lat(), lng: latLng.lng(), address: results[0].formatted_address };
                    if (currentPickerCallback) currentPickerCallback(pickedLocation);
                } else {
                    if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = `Could not find address: ${status}`;
                    if (currentPickerCallback) currentPickerCallback({ lat: latLng.lat(), lng: latLng.lng(), address: null });
                }
            });
        });
    }

    async function _viewUserProfileInModal(userId, userRole, userName, userDistance) {
        if (!_domElements.userProfileModal || !_domElements.modalUserName || !_domElements.modalUserRole || !_domElements.modalUserDistance ||
            !_domElements.modalLoading || !_domElements.modalError || !_domElements.modalWalkerContent || !_domElements.modalOwnerContent) {
            return;
        }

        _domElements.modalUserName.textContent = sanitizeHTML(userName || 'User');
        _domElements.modalUserRole.textContent = userRole === 'owner' ? 'Pet Owner' : 'Dog Walker'; // This is already themed in HTML
        _domElements.modalUserDistance.textContent = userDistance ? `${userDistance} km away` : '';

        _domElements.modalLoading.classList.remove('hidden');
        _domElements.modalError.classList.add('hidden');
        _domElements.modalWalkerContent.classList.add('hidden');
        _domElements.modalOwnerContent.classList.add('hidden');
        _domElements.userProfileModal.classList.remove('hidden');
        _domElements.userProfileModal.classList.add('flex'); 

        try {
            const { data: profileData, error: profileError } = await _supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            if (profileError) throw profileError;

            // Email is intentionally not displayed directly from profileData.email for privacy
            const displayEmailForModal = 'Contact via platform'; 

            if (profileData.role === 'walker') {
                _populateWalkerModalContent(profileData, displayEmailForModal);
            } else if (profileData.role === 'owner') {
                await _populateOwnerModalContent(profileData, displayEmailForModal, userId);
            }
            _domElements.modalLoading.classList.add('hidden');
        } catch (error) {
            _domElements.modalLoading.classList.add('hidden');
            _domElements.modalError.classList.remove('hidden');
            const errorPEl = _domElements.modalError.querySelector('p');
            if(errorPEl) errorPEl.textContent = `Error loading profile: ${error.message}`;
        }
    }
    
    function _populateWalkerModalContent(profile, email) {
        if (!_domElements.modalWalkerContent) {
            return;
        }
        const el = (selector) => _domElements.modalWalkerContent.querySelector(selector);
    
        const walkerAbout = el('#modal-walker-about'); // Assumes this ID exists within modalWalkerContent
        if (walkerAbout) walkerAbout.innerHTML = sanitizeHTML(profile.about_me || 'N/A').replace(/\n/g, '<br>'); // Themed classes on parent
    
        const walkerExpYears = el('#modal-walker-experience-years');
        if (walkerExpYears) walkerExpYears.textContent = profile.experience_years ? `${profile.experience_years} years` : 'N/A';
    
        const walkerExpSummary = el('#modal-walker-experience-summary');
        if (walkerExpSummary) walkerExpSummary.innerHTML = sanitizeHTML(profile.experience_summary || 'N/A').replace(/\n/g, '<br>');
    
        const walkerEmail = el('#modal-walker-email');
        if (walkerEmail) walkerEmail.textContent = sanitizeHTML(email); // email is 'Contact via platform'
    
        const walkerMobile = el('#modal-walker-mobile');
        if (walkerMobile) walkerMobile.textContent = sanitizeHTML(profile.mobile || 'Not Provided');
    
        const availabilityDiv = el('#modal-walker-availability');
        if (availabilityDiv) {
            availabilityDiv.innerHTML = ''; // Clear previous
            if (profile.availability_schedule) {
                try {
                    const schedule = typeof profile.availability_schedule === 'string' ? JSON.parse(profile.availability_schedule) : profile.availability_schedule;
                    let hasAvailability = false;
                    DAYS_OF_WEEK.forEach(day => {
                        if (schedule[day] && schedule[day].length > 0) {
                            hasAvailability = true;
                            const dayContainer = createSafeElement('div', {className: 'mb-1'});
                            dayContainer.appendChild(createSafeElement('strong', {className: 'block text-xs font-medium text-stone-700'}, day)); // Themed
                            schedule[day].forEach(slot => {
                                const [from, to] = slot.split('-');
                                dayContainer.appendChild(createSafeElement('span', {className: 'text-xs block text-stone-600 ml-2'}, `${formatTimeDisplay(from)} - ${formatTimeDisplay(to)}`)); // Themed
                            });
                            availabilityDiv.appendChild(dayContainer);
                        }
                    });
                    if(!hasAvailability) availabilityDiv.textContent = 'Availability not specified.';
                } catch (e) { availabilityDiv.textContent = 'Error loading availability.'; }
            } else {
                availabilityDiv.textContent = 'Availability not specified.';
            }
        }
        _domElements.modalWalkerContent.classList.remove('hidden');
    }
    
    async function _populateOwnerModalContent(profile, email, ownerId) {
        if (!_domElements.modalOwnerContent) {
            return;
        }
        const el = (selector) => _domElements.modalOwnerContent.querySelector(selector);
    
        const ownerEmail = el('#modal-owner-email');
        if(ownerEmail) ownerEmail.textContent = sanitizeHTML(email); // email is 'Contact via platform'
    
        const ownerMobile = el('#modal-owner-mobile');
        if(ownerMobile) ownerMobile.textContent = sanitizeHTML(profile.mobile || 'Not Provided');
    
        const ownerAddress = el('#modal-owner-address');
        if(ownerAddress) ownerAddress.textContent = sanitizeHTML(profile.address || 'N/A');
    
        const ownerComm = el('#modal-owner-communication');
        if(ownerComm) ownerComm.textContent = sanitizeHTML(profile.preferred_communication || 'N/A');
    
        const ownerNotes = el('#modal-owner-notes');
        if(ownerNotes) ownerNotes.innerHTML = sanitizeHTML(profile.owner_notes_for_walker || 'N/A').replace(/\n/g, '<br>');
    
        const dogsDiv = el('#modal-owner-dogs'); // This is the container for dog cards
        const noDogsMsg = el('#modal-no-dogs'); // This is the <p> tag for "No dogs available"
    
        if (dogsDiv && noDogsMsg) {
            dogsDiv.innerHTML = ''; 
            noDogsMsg.classList.add('hidden');
    
            try {
                const { data: dogs, error } = await _supabase.from('dogs').select('name, breed, age, gender').eq('owner_id', ownerId);
                if (error) throw error;
                if (dogs && dogs.length > 0) {
                    dogs.forEach(dog => {
                        // THEMED Dog Card
                        const dogCard = createSafeElement('div', {className: 'bg-emerald-50 p-3 border border-emerald-200 rounded-lg mb-2 text-sm shadow-sm'});
                        dogCard.appendChild(createSafeElement('h5', {className: 'font-serif font-semibold text-base text-emerald-700 mb-1'}, sanitizeHTML(dog.name)));
                        const addDogDetail = (label, value) => {
                            if (value) dogCard.appendChild(createSafeElement('p', {className:'text-xs text-stone-600'}, [ // Themed
                                createSafeElement('strong', {className: 'text-stone-700'}, `${label}: `), // Themed
                                document.createTextNode(sanitizeHTML(String(value)))
                            ]));
                        };
                        addDogDetail('Breed', dog.breed);
                        addDogDetail('Age', dog.age ? `${dog.age} years` : null);
                        addDogDetail('Gender', dog.gender);
                        dogsDiv.appendChild(dogCard);
                    });
                } else {
                    noDogsMsg.classList.remove('hidden');
                    noDogsMsg.textContent = 'No dogs listed by this owner.';
                }
            } catch(e) {
                dogsDiv.textContent = 'Error loading dog details.';
            }
        }
        _domElements.modalOwnerContent.classList.remove('hidden');
    }


    // --- Public Interface of MapsModule ---
    App.Maps = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData; 
            _domElements = domRefs;

            this.loadGoogleMapsApiKeyAndScript(); 

            if (_domElements.closeProfileModalButton && _domElements.userProfileModal) {
                _domElements.closeProfileModalButton.addEventListener('click', () => {
                    _domElements.userProfileModal.classList.add('hidden');
                    _domElements.userProfileModal.classList.remove('flex');
                });
            }
        },

        onMapViewActivated: function(updatedProfileData) {
            if(updatedProfileData) _userProfileData = updatedProfileData;

            _whenGoogleMapsReady(() => {
                if (!mainMapInstance) {
                    _initMainMapViewMap();
                } else {
                     setTimeout(() => { 
                        if (google && mainMapInstance && _domElements.mapContainer.offsetHeight > 0) {
                            google.maps.event.trigger(mainMapInstance, 'resize');
                        }
                    }, 50);
                }
                if (mainMapInstance && (!mainMapDataLoaded || (updatedProfileData && updatedProfileData.id !== _currentUser.id))) {
                     _loadDataForMainMapView();
                } else if(mainMapInstance) {
                } else {
                }
            });
        },
        
        onUserProfileUpdated: function(updatedProfile) {
            _userProfileData = updatedProfile; 
            mainMapDataLoaded = false; 
            if (_domElements.mapContainer && _domElements.mapContainer.closest('.content-section.active')) {
                 _whenGoogleMapsReady(() => { 
                     if (mainMapInstance) _loadDataForMainMapView();
                 });
            }
        },

        loadGoogleMapsApiKeyAndScript: async function() {
            if (document.getElementById(MAPS_SCRIPT_ID) || mapsApiLoading) {
                return;
            }
            mapsApiLoading = true;

            if (_domElements.mapContainer) {
                const existingMsg = _domElements.mapContainer.querySelector('.map-loading-message');
                if(existingMsg) existingMsg.textContent = "Fetching API key...";
                else _domElements.mapContainer.innerHTML = '<p class="map-loading-message text-stone-600 p-4">Fetching API key...</p>';
            }
            
            try {
                const sessionResponse = await _supabase.auth.getSession();
                const session = sessionResponse.data.session;
                if (!session?.access_token) throw new Error("Not authenticated to fetch API key.");

                const functionUrl = `${window.pawsitiveCommon.SUPABASE_URL}/functions/v1/get-maps-key`;
                const response = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': window.pawsitiveCommon.SUPABASE_ANON_KEY }
                });
                if (!response.ok) { throw new Error(`Failed to fetch API key: ${response.status}`); }
                const data = await response.json();
                const apiKey = data.apiKey;
                if (!apiKey) throw new Error('API key not received.');

                if (_domElements.mapContainer && _domElements.mapContainer.querySelector('.map-loading-message')) {
                     const loadingMsgEl = _domElements.mapContainer.querySelector('.map-loading-message');
                     if(loadingMsgEl) loadingMsgEl.textContent = 'Loading Google Maps...'; // Update message
                }

                const script = document.createElement('script');
                script.id = MAPS_SCRIPT_ID;
                if (typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('Invalid API key format');
                
                script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=marker,geometry,places&v=beta`;
                
                script.async = true; script.defer = true; 
                script.onerror = () => { 
                    if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message text-red-500 p-4">Error: Could not load Google Maps script.</p>';
                    mapsApiLoading = false;
                };
                document.head.appendChild(script);

            } catch (error) { 
                if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-500 p-4">Error fetching map resources: ${error.message}</p>`;
                mapsApiLoading = false;
            }
        },

        _triggerInternalApiReady: _handleGoogleMapsApiLoadedAndTriggered,

        initAddressAutocomplete: function(inputElement, onPlaceSelectedCallback) {
             _whenGoogleMapsReady(() => {
                if (!google.maps.places || !google.maps.places.Autocomplete) { 
                    return;
                }
                if (addressAutocomplete) google.maps.event.clearInstanceListeners(addressAutocomplete); 
                try {
                    const options = { componentRestrictions: { country: "in" }, fields: ["geometry.location", "formatted_address", "name"], types: ['address'], strictBounds: false };
                    addressAutocomplete = new google.maps.places.Autocomplete(inputElement, options); 
                    addressAutocomplete.addListener('place_changed', () => {
                        const place = addressAutocomplete.getPlace();
                        if (onPlaceSelectedCallback) onPlaceSelectedCallback(place); 
                    });
                    inputElement.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
                } catch (e) { }
            });
        },

        showLocationPicker: function(pickerContainerElement, initialCoords, currentAddressText, onLocationPickedCallback) {
            _domElements.pickerMapContainer = pickerContainerElement; 
            _initLocationPickerMap(initialCoords, currentAddressText, onLocationPickedCallback);
        },
        hideLocationPicker: function() {
            if (locationPickerMap && _domElements.pickerMapContainer) {
                 _domElements.pickerMapContainer.classList.add('hidden');
            }
            if(locationPickerMarker) locationPickerMarker.setMap(null);
            currentPickerCallback = null; 
        }
    };

})(window.App = window.App || {});