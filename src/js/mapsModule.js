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

    // Helper for modal, can be moved to pawsitiveCommon if used elsewhere
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
                console.error("[MapsModule] Error executing ready callback immediately:", e);
            }
        } else {
            apiReadyCallbacks.push(callback);
            console.log("[MapsModule] Queued callback. Current queue length:", apiReadyCallbacks.length);
        }
    }

    // This function is called by the global initMap in profile.html
    function _handleGoogleMapsApiLoadedAndTriggered() {
        console.log("[MapsModule] _handleGoogleMapsApiLoadedAndTriggered called (via global initMap).");
        if (mapsApiReady) {
            console.log("[MapsModule] API already marked as ready. Skipping re-initialization.");
            return;
        }

        if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder || !google.maps.places) {
            console.error("[MapsModule] Google Maps objects not available even after global initMap! This is unexpected.");
            // Display error on page if possible
            if (_domElements.mapContainer) {
                _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Critical Error: Google Maps components failed to load. Try refreshing.</p>`;
            }
            return;
        }

        try {
            geocoder = new google.maps.Geocoder();
            console.log("[MapsModule] Geocoder initialized successfully.");
            mapsApiReady = true; // Mark our module's readiness
            console.log("[MapsModule] mapsApiReady set to true. Processing queued callbacks.");
        } catch (e) {
            console.error("[MapsModule] Error initializing Geocoder:", e);
            mapsApiReady = false; // Ensure it's false on error
            if (_domElements.mapContainer) {
                _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Error initializing map services. Please refresh.</p>`;
            }
        }
        
        // Execute any queued callbacks
        let callbackCount = apiReadyCallbacks.length;
        while (apiReadyCallbacks.length > 0) {
            const cb = apiReadyCallbacks.shift();
            try {
                console.log("[MapsModule] Executing queued callback:", cb.name || "anonymous");
                cb();
            } catch (e) {
                console.error("[MapsModule] Error executing queued ready callback:", e, cb.name || "anonymous");
            }
        }
        if (callbackCount > 0) console.log(`[MapsModule] Processed ${callbackCount} queued callbacks.`);


        // If main map view is active AND its map instance not created, initialize it now.
        // This ensures that if the map tab was clicked before the API was fully ready, it gets initialized.
        if (_domElements.mapContainer && _domElements.mapContainer.closest('.content-section.active') && !mainMapInstance) {
            console.log("[MapsModule] Main map view is active post-API ready, ensuring map initializes.");
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
            console.warn("[MapsModule] Main map instance not ready for loading data. Attempting to initialize map first.");
            if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message">Map initializing, please wait...</p>';
            _initMainMapViewMap(); // Try to init if not already
            if (!mainMapInstance) { // If still not initialized, bail
                console.error("[MapsModule] Failed to initialize main map instance for data loading.");
                if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message text-red-500">Error: Map could not be initialized for data.</p>';
                return;
            }
        }
        if (!_userProfileData) {
            console.warn("[MapsModule] User profile data not available for loading map data.");
            if (_domElements.mapContainer) _domElements.mapContainer.innerHTML = '<p class="map-loading-message text-red-500">Your profile data is missing. Cannot load map.</p>';
            return;
        }

        mainMapDataLoaded = false; // Reset flag before loading
        _clearMainMapMarkers();
        console.log("[MapsModule] Loading data for main map view. User:", _userProfileData.full_name);

        // --- Corrected Loading Message Handling ---
        let mapLoadingMessage = _domElements.mapContainer.querySelector('.map-loading-message.map-overlay-message');
        if (!mapLoadingMessage) {
            mapLoadingMessage = window.pawsitiveCommon.createSafeElement('p', {
                className: 'map-loading-message map-overlay-message text-gray-600 p-4'
            });
            mapLoadingMessage.style.position = 'absolute';
            mapLoadingMessage.style.top = '50%';
            mapLoadingMessage.style.left = '50%';
            mapLoadingMessage.style.transform = 'translate(-50%, -50%)';
            mapLoadingMessage.style.backgroundColor = 'rgba(249, 250, 251, 0.9)';
            mapLoadingMessage.style.padding = '1em';
            mapLoadingMessage.style.borderRadius = '8px';
            mapLoadingMessage.style.zIndex = '10';
            mapLoadingMessage.style.textAlign = 'center';
            _domElements.mapContainer.appendChild(mapLoadingMessage);
        }
        mapLoadingMessage.textContent = 'Loading your location...';
        mapLoadingMessage.style.display = 'block';
        // --- End Corrected Loading Message Handling ---

        let userCoords = null;
        const bounds = new google.maps.LatLngBounds();

        if (_userProfileData.latitude && _userProfileData.longitude) {
            userCoords = { lat: _userProfileData.latitude, lng: _userProfileData.longitude };
            mainMapUserMarker = new google.maps.Marker({
                position: userCoords, map: mainMapInstance, title: 'Your Location',
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#8B5CF6', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
                zIndex: 100
            });
            bounds.extend(userCoords);
            // Update message after plotting user
            mapLoadingMessage.textContent = `Finding nearby ${_userProfileData.role === 'owner' ? 'walkers' : 'owners'}...`;
        } else {
            mapLoadingMessage.textContent = 'Your location is not set. Please update your profile address to see nearby users.';
            mainMapInstance.setCenter(INDIA_CENTER);
            mainMapInstance.setZoom(DEFAULT_ZOOM);
            mainMapDataLoaded = true; // Mark as loaded even if no data due to user location missing
            return; // Stop further processing
        }

        const targetRole = _userProfileData.role === 'owner' ? 'walker' : 'owner';
        if (_domElements.mapTitleRole) _domElements.mapTitleRole.textContent = targetRole === 'walker' ? 'Dog Walkers' : 'Pet Owners';
        if (_domElements.mapDescriptionRole) _domElements.mapDescriptionRole.textContent = targetRole === 'walker' ? 'dog walkers' : 'pet owners';

        const rpcParams = {
            user_lat: userCoords.lat, user_lng: userCoords.lng,
            search_radius_km: SEARCH_RADIUS_KM, target_role: targetRole,
            exclude_user_id: _currentUser.id
        };
        console.log("[MapsModule] Calling RPC 'find_nearby_users' with params:", rpcParams);

        try {
            const { data: nearbyUsers, error: rpcError } = await _supabase.rpc('find_nearby_users', rpcParams);
            if (rpcError) throw rpcError;

            console.log(`[MapsModule] RPC returned ${nearbyUsers?.length || 0} nearby ${targetRole}s.`);
            let plottedCount = 0;
            const infowindow = new google.maps.InfoWindow();

            if (nearbyUsers && nearbyUsers.length > 0) {
                nearbyUsers.forEach(otherUser => {
                    if (typeof otherUser.latitude === 'number' && typeof otherUser.longitude === 'number') {
                        const otherCoords = { lat: otherUser.latitude, lng: otherUser.longitude };
                        const marker = new google.maps.Marker({
                            position: otherCoords, map: mainMapInstance,
                            title: window.pawsitiveCommon.sanitizeHTML(otherUser.full_name || 'User'),
                            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: targetRole === 'walker' ? '#10B981' : '#F59E0B', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
                        });
                        mainMapOtherUserMarkers.push(marker);
                        bounds.extend(otherCoords);
                        plottedCount++;

                        marker.addListener('click', () => {
                            const contentString = `
                                <div class="p-2">
                                    <strong>${window.pawsitiveCommon.sanitizeHTML(otherUser.full_name || 'N/A')}</strong><br>
                                    ${window.pawsitiveCommon.sanitizeHTML(otherUser.role === 'owner' ? 'Pet Owner' : 'Dog Walker')}<br>
                                    <small>Approx. ${otherUser.distance_km?.toFixed(1) ?? '?'} km away</small>
                                    <div class="mt-2">
                                        <button class="view-profile-btn-map bg-purple-600 text-white text-xs px-3 py-1 rounded hover:bg-purple-700"
                                                data-user-id="${otherUser.id}"
                                                data-user-role="${otherUser.role}"
                                                data-user-name="${window.pawsitiveCommon.sanitizeHTML(otherUser.full_name || 'User')}"
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
            
            // Add event listener for dynamically created buttons in infowindow
            // This should be robust enough to handle multiple infowindows if they stay open.
            // However, typically only one InfoWindow is shown at a time by Google Maps API.
             google.maps.event.addListener(infowindow, 'domready', () => {
                const viewProfileBtn = document.querySelector('.view-profile-btn-map'); // Get the button from the current infowindow
                if (viewProfileBtn && !viewProfileBtn.dataset.listenerAttachedMap) { // Check if listener already attached
                    viewProfileBtn.addEventListener('click', (e) => {
                        const btn = e.currentTarget; // Use currentTarget for safety
                         _viewUserProfileInModal(btn.dataset.userId, btn.dataset.userRole, btn.dataset.userName, btn.dataset.userDistance);
                    });
                    viewProfileBtn.dataset.listenerAttachedMap = 'true'; // Mark as attached
                }
            });


            // Update map view and loading message based on results
            if (plottedCount > 0 || mainMapUserMarker) { // If user marker OR other markers are plotted
                if (!bounds.isEmpty()) {
                    mainMapInstance.fitBounds(bounds);
                    // Adjust zoom after fitBounds if it's too high
                    google.maps.event.addListenerOnce(mainMapInstance, 'idle', function() {
                        if (this.getZoom() > DETAIL_ZOOM + 1) { // Allow slightly higher zoom than detail
                            this.setZoom(DETAIL_ZOOM + 1);
                        }
                    });
                } else if (userCoords) { // Only user marker was plotted
                    mainMapInstance.setCenter(userCoords);
                    mainMapInstance.setZoom(DETAIL_ZOOM);
                }
                mapLoadingMessage.style.display = 'none'; // Hide loading message if map has content
            } else { // Should only happen if userCoords was missing initially, handled above.
                mainMapInstance.setCenter(INDIA_CENTER);
                mainMapInstance.setZoom(DEFAULT_ZOOM);
                mapLoadingMessage.textContent = 'Could not display map content.'; // Fallback message
                mapLoadingMessage.style.display = 'block';
            }

            if (plottedCount === 0 && mainMapUserMarker) { // Only user is plotted, no others found
                mapLoadingMessage.textContent = `No nearby ${targetRole}s found within ${SEARCH_RADIUS_KM}km.`;
                mapLoadingMessage.style.display = 'block';
            }

        } catch (error) {
            console.error("[MapsModule] Error calling RPC or plotting nearby users:", error);
            mapLoadingMessage.textContent = `Error loading map data: ${error.message}`;
            mapLoadingMessage.style.display = 'block'; // Keep message visible with error
        } finally {
            mainMapDataLoaded = true;
            console.log("[MapsModule] Finished loading data for main map view.");
        }
    }

    function _initMainMapViewMap() {
        if (mainMapInstance) {
            console.log("[MapsModule] _initMainMapViewMap called, but instance already exists. Ensuring resize.");
            // If instance exists, just ensure it's visible and trigger resize
            if (google && _domElements.mapContainer.offsetHeight > 0) { // Check if container has height
                google.maps.event.trigger(mainMapInstance, 'resize');
            }
            return; // Don't re-create
        }
    
        if (!_domElements.mapContainer) {
            console.error("[MapsModule] Main map container element not found for _initMainMapViewMap.");
            return;
        }
        _domElements.mapContainer.innerHTML = ''; // Clear any placeholders like "Map loading..."
        
        console.log("[MapsModule] Attempting to create main map view instance.");
        try {
            mainMapInstance = new google.maps.Map(_domElements.mapContainer, {
                center: INDIA_CENTER,
                zoom: DEFAULT_ZOOM,
                mapId: '8a23b4bdd9ef4f8c', // Your Map ID
                mapTypeControl: false,
                streetViewControl: false,
            });
            console.log("[MapsModule] Main map view instance CREATED.");
    
            // Defer resize slightly to allow the DOM to fully update after section becomes active
            requestAnimationFrame(() => { // Use requestAnimationFrame for better timing
                if (google && mainMapInstance && _domElements.mapContainer.offsetHeight > 0) {
                    google.maps.event.trigger(mainMapInstance, 'resize');
                    console.log("[MapsModule] Resize triggered shortly after mainMapInstance creation.");
                    // If bounds need to be set immediately after creation, do it here *after* resize
                    // e.g., if (_userProfileData && _userProfileData.latitude) {
                    //    const userPos = { lat: _userProfileData.latitude, lng: _userProfileData.longitude };
                    //    mainMapInstance.setCenter(userPos);
                    //    mainMapInstance.setZoom(DETAIL_ZOOM); // Or fitBounds if you have multiple markers
                    // }
                } else if (google && mainMapInstance) {
                    console.warn("[MapsModule] Post-creation: mapContainer might not have dimensions yet. Resize might be ineffective now.");
                }
            });
    
        } catch (error) {
            console.error("[MapsModule] Error creating main map view instance:", error);
            if (_domElements.mapContainer) {
                _domElements.mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Could not initialize map: ${error.message}</p>`;
            }
        }
    }
    
    App.Maps = {
        // ... (init, loadGoogleMapsApiKeyAndScript, _triggerInternalApiReady, etc. remain the same) ...
    
        onMapViewActivated: function(updatedProfileData) {
            console.log("[MapsModule] Map View Activated. Profile data passed:", !!updatedProfileData);
            if(updatedProfileData) _userProfileData = updatedProfileData; // Update if fresh data is passed
    
            _whenGoogleMapsReady(() => { // Ensures google.maps objects are available
                console.log("[MapsModule] Google API ready for Map View Activation.");
    
                if (!_domElements.mapContainer) {
                    console.error("[MapsModule] mapContainer DOM element not found for onMapViewActivated.");
                    return;
                }
    
                // Ensure the map section (and thus mapContainer) is actually visible
                // The 'active' class should be on mapContainer's parent section
                const mapSectionElement = _domElements.mapContainer.closest('.content-section');
                if (!mapSectionElement || !mapSectionElement.classList.contains('active')) {
                    console.warn("[MapsModule] Map section is not active. Map rendering might be deferred or incorrect.");
                    // Potentially wait or re-check, but dashboard-main should handle active class.
                }
    
    
                if (!mainMapInstance) {
                    console.log("[MapsModule] Main map instance doesn't exist, calling _initMainMapViewMap.");
                    _initMainMapViewMap(); // This will create the map and attempt an initial resize
                } else {
                    // Map instance exists. Container might have just become visible.
                    // Trigger resize to ensure it picks up correct dimensions.
                    console.log("[MapsModule] Main map instance exists. Ensuring resize.");
                    requestAnimationFrame(() => { // Use rAF for better timing with DOM changes
                        if (google && mainMapInstance && _domElements.mapContainer.offsetHeight > 0) {
                            google.maps.event.trigger(mainMapInstance, 'resize');
                            console.log("[MapsModule] Resize triggered on existing mainMapInstance (onMapViewActivated).");
                            // If map was already centered/zoomed, re-apply if necessary, e.g.,
                            // if (mainMapInstance.getCenter()) mainMapInstance.setCenter(mainMapInstance.getCenter());
                            // if (mainMapInstance.getZoom()) mainMapInstance.setZoom(mainMapInstance.getZoom());
                        } else if (google && mainMapInstance) {
                             console.warn("[MapsModule] onMapViewActivated: mapContainer still might not have dimensions. Resize might be ineffective.");
                        }
                    });
                }
    
                // Proceed to load data only if the map instance is now valid
                // and data hasn't been loaded or needs refresh
                if (mainMapInstance && (!mainMapDataLoaded || (_userProfileData && _userProfileData.id !== _currentUser.id))) { // Simple check for now
                    console.log("[MapsModule] Conditions met, calling _loadDataForMainMapView.");
                    _loadDataForMainMapView();
                } else if(mainMapInstance) {
                    console.log("[MapsModule] Map data appears current or no need to refresh for this activation.");
                }
            });
        },
    
        // ... (rest of App.Maps methods: onUserProfileUpdated, initAddressAutocomplete, showLocationPicker, etc.)
        // ... (ensure _loadDataForMainMapView, _clearMainMapMarkers are also present and correct)
        // ... (ensure modal functions are present and correct)
    };

    function _initLocationPickerMap(initialCoords, currentAddressText, callback) {
        if (!_domElements.pickerMapContainer) {
            console.error("[MapsModule] Location picker map container not found.");
            if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = "Picker map error.";
            return;
        }
        _domElements.pickerMapContainer.classList.remove('hidden');
        _domElements.pickerMapContainer.innerHTML = '<p class="map-loading-message p-4 text-gray-600">Loading map picker...</p>';
        currentPickerCallback = callback;

        _whenGoogleMapsReady(() => { // Ensures geocoder is ready
            if (!geocoder) {
                console.error("[MapsModule] Geocoder not ready for picker map.");
                 _domElements.pickerMapContainer.innerHTML = '<p class="map-loading-message text-red-500 p-4">Map services error for picker.</p>';
                return;
            }
            let centerPos = initialCoords || INDIA_CENTER;
            let zoomLevel = initialCoords ? DETAIL_ZOOM : DEFAULT_ZOOM;

            const createMapWithPosition = (pos, zl) => {
                 _domElements.pickerMapContainer.innerHTML = ''; // Clear loading
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
                            position: pos, map: locationPickerMap, draggable: true, title: "Drag to set location"
                        });
                        locationPickerMarker.addListener('dragend', _handlePickerMarkerDragEnd);
                    } else {
                        locationPickerMarker.setPosition(pos); locationPickerMarker.setMap(locationPickerMap);
                    }
                     if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = 'Drag marker or use address search.';
                } catch(e) {
                    console.error("[MapsModule] Error creating picker map instance:", e);
                    _domElements.pickerMapContainer.innerHTML = `<p class="map-loading-message text-red-500 p-4">Error loading picker: ${e.message}</p>`;
                }
            };

            if (!initialCoords && currentAddressText) {
                geocoder.geocode({ address: currentAddressText, componentRestrictions: { country: 'IN' } }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        createMapWithPosition(results[0].geometry.location, DETAIL_ZOOM);
                    } else { createMapWithPosition(INDIA_CENTER, DEFAULT_ZOOM); } // Fallback
                });
            } else {
                createMapWithPosition(centerPos, zoomLevel);
            }
        });
    }

    function _handlePickerMarkerDragEnd(event) {
        const latLng = event.latLng;
        if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = 'Finding address...';
        
        _whenGoogleMapsReady(() => { // Ensure geocoder is ready
            if (!geocoder) { /* ... error ... */ return; }
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    const pickedLocation = { lat: latLng.lat(), lng: latLng.lng(), address: results[0].formatted_address };
                    if (currentPickerCallback) currentPickerCallback(pickedLocation);
                } else {
                    console.warn("[MapsModule] Reverse geocoding failed for picker:", status);
                    if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = `Could not find address: ${status}`;
                    if (currentPickerCallback) currentPickerCallback({ lat: latLng.lat(), lng: latLng.lng(), address: null });
                }
            });
        });
    }

    async function _viewUserProfileInModal(userId, userRole, userName, userDistance) {
        // ... (Modal population logic - assumed to be mostly correct from previous version)
        // Ensure all sanitizeHTML and createSafeElement calls are used.
        // The key is that this function is called.
        if (!_domElements.userProfileModal || !_domElements.modalUserName || !_domElements.modalUserRole || !_domElements.modalUserDistance ||
            !_domElements.modalLoading || !_domElements.modalError || !_domElements.modalWalkerContent || !_domElements.modalOwnerContent) {
            console.error("[MapsModule] One or more modal DOM elements are missing.");
            return;
        }
        console.log(`[MapsModule] Viewing profile for modal: ${userRole} ${userName} (ID: ${userId})`);

        _domElements.modalUserName.textContent = window.pawsitiveCommon.sanitizeHTML(userName || 'User');
        _domElements.modalUserRole.textContent = userRole === 'owner' ? 'Pet Owner' : 'Dog Walker';
        _domElements.modalUserDistance.textContent = userDistance ? `${userDistance} km away` : '';

        _domElements.modalLoading.classList.remove('hidden');
        _domElements.modalError.classList.add('hidden');
        _domElements.modalWalkerContent.classList.add('hidden');
        _domElements.modalOwnerContent.classList.add('hidden');
        _domElements.userProfileModal.classList.remove('hidden');
        _domElements.userProfileModal.classList.add('flex'); // Tailwind class for flex display

        try {
            const { data: profileData, error: profileError } = await _supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            if (profileError) throw profileError;

            const displayEmail = 'Email not publicly available'; 

            if (profileData.role === 'walker') {
                _populateWalkerModalContent(profileData, displayEmail);
            } else if (profileData.role === 'owner') {
                await _populateOwnerModalContent(profileData, displayEmail, userId);
            }
            _domElements.modalLoading.classList.add('hidden');
        } catch (error) {
            console.error('[MapsModule] Error fetching profile for modal:', error);
            _domElements.modalLoading.classList.add('hidden');
            _domElements.modalError.classList.remove('hidden');
            const errorPEl = _domElements.modalError.querySelector('p');
            if(errorPEl) errorPEl.textContent = `Error loading profile: ${error.message}`;
        }
    }
    
    function _populateWalkerModalContent(profile, email) {
        // Check if _domElements.modalWalkerContent is valid
        if (!_domElements.modalWalkerContent) {
            console.error("[MapsModule] modalWalkerContent DOM element is null.");
            return;
        }
        const el = (selector) => _domElements.modalWalkerContent.querySelector(selector);
    
        const walkerAbout = el('#modal-walker-about');
        if (walkerAbout) walkerAbout.textContent = window.pawsitiveCommon.sanitizeHTML(profile.about_me || 'N/A');
    
        const walkerExpYears = el('#modal-walker-experience-years');
        if (walkerExpYears) walkerExpYears.textContent = profile.experience_years ? `${profile.experience_years} years` : 'N/A';
    
        const walkerExpSummary = el('#modal-walker-experience-summary');
        if (walkerExpSummary) walkerExpSummary.textContent = window.pawsitiveCommon.sanitizeHTML(profile.experience_summary || 'N/A');
    
        const walkerEmail = el('#modal-walker-email');
        if (walkerEmail) walkerEmail.textContent = window.pawsitiveCommon.sanitizeHTML(email);
    
        const walkerMobile = el('#modal-walker-mobile');
        if (walkerMobile) walkerMobile.textContent = window.pawsitiveCommon.sanitizeHTML(profile.mobile || 'N/A');
    
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
                            const dayContainer = window.pawsitiveCommon.createSafeElement('div', {className: 'mb-1'});
                            dayContainer.appendChild(window.pawsitiveCommon.createSafeElement('strong', {className: 'block text-xs'}, day));
                            schedule[day].forEach(slot => {
                                const [from, to] = slot.split('-');
                                dayContainer.appendChild(window.pawsitiveCommon.createSafeElement('span', {className: 'text-xs block'}, `${formatTimeDisplay(from)} - ${formatTimeDisplay(to)}`));
                            });
                            availabilityDiv.appendChild(dayContainer);
                        }
                    });
                    if(!hasAvailability) availabilityDiv.textContent = 'Availability not specified.';
                } catch (e) { availabilityDiv.textContent = 'Error loading availability.'; console.error("Error parsing walker availability for modal:", e); }
            } else {
                availabilityDiv.textContent = 'Availability not specified.';
            }
        }
        _domElements.modalWalkerContent.classList.remove('hidden');
    }
    
    async function _populateOwnerModalContent(profile, email, ownerId) {
        if (!_domElements.modalOwnerContent) {
            console.error("[MapsModule] modalOwnerContent DOM element is null.");
            return;
        }
        const el = (selector) => _domElements.modalOwnerContent.querySelector(selector);
    
        const ownerEmail = el('#modal-owner-email');
        if(ownerEmail) ownerEmail.textContent = window.pawsitiveCommon.sanitizeHTML(email);
    
        const ownerMobile = el('#modal-owner-mobile');
        if(ownerMobile) ownerMobile.textContent = window.pawsitiveCommon.sanitizeHTML(profile.mobile || 'N/A');
    
        const ownerAddress = el('#modal-owner-address');
        if(ownerAddress) ownerAddress.textContent = window.pawsitiveCommon.sanitizeHTML(profile.address || 'N/A');
    
        const ownerComm = el('#modal-owner-communication');
        if(ownerComm) ownerComm.textContent = window.pawsitiveCommon.sanitizeHTML(profile.preferred_communication || 'N/A');
    
        const ownerNotes = el('#modal-owner-notes');
        if(ownerNotes) ownerNotes.textContent = window.pawsitiveCommon.sanitizeHTML(profile.owner_notes_for_walker || 'N/A');
    
        const dogsDiv = el('#modal-owner-dogs');
        const noDogsMsg = el('#modal-no-dogs');
    
        if (dogsDiv && noDogsMsg) {
            dogsDiv.innerHTML = ''; 
            noDogsMsg.classList.add('hidden');
    
            try {
                const { data: dogs, error } = await _supabase.from('dogs').select('*').eq('owner_id', ownerId);
                if (error) throw error;
                if (dogs && dogs.length > 0) {
                    dogs.forEach(dog => {
                        const dogCard = window.pawsitiveCommon.createSafeElement('div', {className: 'dog-card p-3 border rounded mb-2 text-sm'});
                        dogCard.appendChild(window.pawsitiveCommon.createSafeElement('h5', {className: 'font-semibold text-base mb-1'}, dog.name));
                        const addDogDetail = (label, value) => {
                            if (value) dogCard.appendChild(window.pawsitiveCommon.createSafeElement('p', {className:'text-xs'}, `${label}: ${window.pawsitiveCommon.sanitizeHTML(value)}`));
                        };
                        addDogDetail('Breed', dog.breed);
                        addDogDetail('Age', dog.age ? `${dog.age} years` : null);
                        addDogDetail('Gender', dog.gender);
                        dogsDiv.appendChild(dogCard);
                    });
                } else {
                    noDogsMsg.classList.remove('hidden');
                }
            } catch(e) {
                dogsDiv.textContent = 'Error loading dog details.'; console.error("Error fetching dogs for modal:", e);
            }
        }
        _domElements.modalOwnerContent.classList.remove('hidden');
    }


    // --- Public Interface of MapsModule ---
    App.Maps = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData; // Initial profile data
            _domElements = domRefs;

            console.log('[MapsModule] Initialized. User:', _userProfileData.full_name, 'DOM Refs:', _domElements);
            this.loadGoogleMapsApiKeyAndScript(); // Load API script

            if (_domElements.closeProfileModalButton && _domElements.userProfileModal) {
                _domElements.closeProfileModalButton.addEventListener('click', () => {
                    _domElements.userProfileModal.classList.add('hidden');
                    _domElements.userProfileModal.classList.remove('flex');
                });
            }
        },

        onMapViewActivated: function(updatedProfileData) {
            console.log("[MapsModule] Map View Activated. Profile data passed:", updatedProfileData ? "Yes" : "No");
            if(updatedProfileData) _userProfileData = updatedProfileData;

            _whenGoogleMapsReady(() => {
                console.log("[MapsModule] Google API ready for Map View Activation.");
                if (!mainMapInstance) {
                    console.log("[MapsModule] Main map instance doesn't exist, calling _initMainMapViewMap.");
                    _initMainMapViewMap();
                } else {
                    console.log("[MapsModule] Main map instance exists. Triggering resize.");
                     setTimeout(() => { // Ensure DOM is fully visible
                        if (google && mainMapInstance && _domElements.mapContainer.offsetHeight > 0) {
                            google.maps.event.trigger(mainMapInstance, 'resize');
                            console.log("[MapsModule] Resize on existing mainMapInstance (onMapViewActivated).");
                        }
                    }, 50);
                }

                // Load data if map is now initialized and data isn't loaded or profile context changed
                if (mainMapInstance && (!mainMapDataLoaded || (updatedProfileData && updatedProfileData.id !== _currentUser.id))) {
                     console.log("[MapsModule] Conditions met, calling _loadDataForMainMapView.");
                    _loadDataForMainMapView();
                } else if(mainMapInstance) {
                    console.log("[MapsModule] Map data already loaded or no new profile context to force reload.");
                } else {
                    console.warn("[MapsModule] Main map instance still not available after _init attempt in onMapViewActivated.");
                }
            });
        },
        
        onUserProfileUpdated: function(updatedProfile) {
            console.log("[MapsModule] User profile was updated. New profile data:", updatedProfile);
            _userProfileData = updatedProfile; // Update internal profile data
            mainMapDataLoaded = false; // Mark map data as stale
            // If map view is currently active, reload its data
            if (_domElements.mapContainer && _domElements.mapContainer.closest('.content-section.active')) {
                 console.log("[MapsModule] Map view is active, reloading data due to profile update.");
                 _whenGoogleMapsReady(() => { // Ensure API is ready before trying to load data
                     if (mainMapInstance) _loadDataForMainMapView();
                 });
            }
        },

        loadGoogleMapsApiKeyAndScript: async function() {
            // ... (Keep the existing robust loading logic from your previous mapsModule.js)
            // Ensure the callback in script.src is 'initMap' to match profile.html
            if (document.getElementById(MAPS_SCRIPT_ID) || mapsApiLoading) {
                console.log("[MapsModule] Google Maps script already loaded or loading attempt in progress.");
                return;
            }
            mapsApiLoading = true;
            console.log("[MapsModule] Attempting to load Google Maps API Key and Script...");

            if (_domElements.mapContainer) { /* ... set loading message ... */ }
            
            try {
                const sessionResponse = await _supabase.auth.getSession();
                const session = sessionResponse.data.session;
                if (!session?.access_token) throw new Error("Not authenticated to fetch API key.");

                const functionUrl = `${window.pawsitiveCommon.SUPABASE_URL}/functions/v1/get-maps-key`;
                const response = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': window.pawsitiveCommon.SUPABASE_ANON_KEY }
                });
                if (!response.ok) { /* ... handle error ... */ throw new Error(`Failed to fetch API key: ${response.status}`); }
                const data = await response.json();
                const apiKey = data.apiKey;
                if (!apiKey) throw new Error('API key not received.');

                console.log("[MapsModule] API Key received.");
                if (_domElements.mapContainer && _domElements.mapContainer.querySelector('.map-loading-message')) {
                     _domElements.mapContainer.querySelector('.map-loading-message').remove();
                }

                const script = document.createElement('script');
                script.id = MAPS_SCRIPT_ID;
                if (typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('Invalid API key format');
                
                // ***** ENSURE THIS USES 'initMap' if that's your global function in profile.html *****
                script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=marker,geometry,places&v=beta`;
                
                script.async = true; script.defer = true; // Defer is fine, async also good.
                script.onerror = () => { /* ... handle script load error ... */ };
                document.head.appendChild(script);
                console.log("[MapsModule] Google Maps script tag appended with callback 'initMap'.");

            } catch (error) { /* ... handle fetch/setup error ... */ }
        },

        _triggerInternalApiReady: _handleGoogleMapsApiLoadedAndTriggered, // Called by global initMap

        initAddressAutocomplete: function(inputElement, onPlaceSelectedCallback) {
             _whenGoogleMapsReady(() => {
                if (!google.maps.places || !google.maps.places.AutocompleteService) { // Check AutocompleteService
                    console.error("[MapsModule] Google Places Autocomplete service not available.");
                    return;
                }
                if (addressAutocomplete) google.maps.event.clearInstanceListeners(addressAutocomplete); // Clear old
                try {
                    const options = { componentRestrictions: { country: "in" }, fields: ["geometry.location", "formatted_address", "name"], strictBounds: false };
                    addressAutocomplete = new google.maps.places.Autocomplete(inputElement, options); // Use the service
                    addressAutocomplete.addListener('place_changed', () => {
                        const place = addressAutocomplete.getPlace();
                        if (onPlaceSelectedCallback) onPlaceSelectedCallback(place); // place can be null if no valid selection
                    });
                    inputElement.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
                    console.log("[MapsModule] Address Autocomplete initialized for:", inputElement.id);
                } catch (e) { console.error("[MapsModule] Error initializing Autocomplete:", e); }
            });
        },

        showLocationPicker: function(pickerContainerElement, initialCoords, currentAddressText, onLocationPickedCallback) {
            _domElements.pickerMapContainer = pickerContainerElement; // Update internal ref if needed
            _initLocationPickerMap(initialCoords, currentAddressText, onLocationPickedCallback);
        },
        hideLocationPicker: function() {
            if (locationPickerMap && _domElements.pickerMapContainer) {
                 _domElements.pickerMapContainer.classList.add('hidden');
            }
            if(locationPickerMarker) locationPickerMarker.setMap(null);
            currentPickerCallback = null; // Clear callback
        }
    };

})(window.App = window.App || {});