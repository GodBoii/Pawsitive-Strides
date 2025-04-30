// Profile/Dashboard functionality for Pawsitive Strides
// Uses RPC function for finding nearby users.
// Includes detailed logging.

document.addEventListener('DOMContentLoaded', async () => {
    // --- Supabase Init & Auth Check ---
    const _supabase = pawsitiveCommon.createSupabaseClient();
    console.log('Supabase Initialized (Dashboard)');
    const currentUser = await pawsitiveCommon.requireAuth(_supabase);
    if (!currentUser) return;
    pawsitiveCommon.setupLogout(_supabase);

    // --- DOM Elements ---
    const loadingState = document.getElementById('loading-state');
    const mainContent = document.getElementById('main-content');
    const profileLoadErrorDiv = document.getElementById('profile-load-error');
    const userEmailDisplay = document.getElementById('user-email');
    const contentSections = document.querySelectorAll('.content-section');
    const profileSection = document.getElementById('profile-section');
    const mapSection = document.getElementById('map-section'); // Main map view tab/section
    const profileForm = document.getElementById('profile-form');
    const profileMessage = profileForm.querySelector('.profile-message');
    const profileAddressInput = profileForm.querySelector('#profile-address');
    const pinLocationButton = document.getElementById('pin-location-btn');
    const pickerMapContainer = document.getElementById('picker-map-container');
    const reverseGeocodeResultDiv = document.getElementById('reverse-geocode-result');
    const ownerContent = document.getElementById('owner-profile-content');
    const walkerContent = document.getElementById('walker-profile-content');
    const addDogForm = ownerContent.querySelector('#add-dog-form');
    const dogListDiv = ownerContent.querySelector('#dog-list');
    const noDogsMessage = ownerContent.querySelector('#no-dogs-message');
    const dogMessage = addDogForm ? addDogForm.querySelector('.dog-message') : null;
    const walkerDetailsForm = walkerContent.querySelector('#walker-details-form');
    const walkerAgeInput = walkerContent.querySelector('#walker-age');
    const mapContainer = document.getElementById('map-container'); // Main map view map element
    const mapTitleRole = document.getElementById('map-title-role');
    const mapDescriptionRole = document.getElementById('map-description-role');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');

    // --- Global State ---
    let userProfile = null;
    let mainMap = null;
    let geocoder = null;
    let mapInitialized = false;
    let mapDataLoaded = false;
    let userMarker = null;
    let otherUserMarkers = [];
    let autocomplete = null;
    let pickerMap = null;
    let pickerMarker = null;
    let selectedLocation = null;

    // --- Constants ---
    const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
    const DEFAULT_ZOOM = 5;
    const DETAIL_ZOOM = 15;
    const SEARCH_RADIUS_KM = 50.0; // Define search radius in kilometers

    // --- Utility Function ---
    function checkMapsApiLoaded() {
       return typeof google !== 'undefined' && google.maps && google.maps.Map && google.maps.Geocoder && google.maps.places;
    }

    // --- Core Map Initialization Logic ---
    function initializeMapRelatedFeatures() {
        console.log(">>> START initializeMapRelatedFeatures (profile.js)");
        if (mapInitialized) { console.log("    Map features already initialized. Exiting."); return; }
        if (!checkMapsApiLoaded()) { console.error("    !!! Google Maps API objects not ready inside initializeMapRelatedFeatures. Exiting."); profileLoadErrorDiv.textContent = 'Failed to load map services components.'; profileLoadErrorDiv.classList.remove('hidden'); return; }

        try {
            console.log("    Initializing Geocoder...");
            geocoder = new google.maps.Geocoder(); console.log('    Geocoder initialized.');
            console.log("    Initializing Autocomplete..."); initAutocomplete(); console.log("    Autocomplete initialization attempted.");
            console.log("    Initializing Main Map...");
            if (!mapContainer) { console.error("    !!! Main map container element (#map-container) not found."); }
            else {
                 mainMap = new google.maps.Map(mapContainer, { center: INDIA_CENTER, zoom: DEFAULT_ZOOM, mapId: '8a23b4bdd9ef4f8c', mapTypeControl: false, streetViewControl: false });
                 console.log('    Main map view initialized.');
                 const loadingMsg = mapContainer.querySelector('.map-loading-message'); if(loadingMsg) loadingMsg.style.display = 'none'; else console.warn("Could not find loading message to hide in main map init.");
            }
            console.log("    Setting mapInitialized = true"); mapInitialized = true;
            if (mapSection?.classList.contains('active') && !mapDataLoaded) {
                 if(mainMap) { console.log('    Main map section is active, calling loadMapData.'); loadMapData(); }
                 else { console.warn('    Main map section is active, but mainMap instance is null.'); if(mapContainer) { const loadingMsg = mapContainer.querySelector('.map-loading-message'); if (loadingMsg) loadingMsg.textContent = 'Error: Map could not be initialized.'; else mapContainer.innerHTML = '<p class="map-loading-message text-red-500 p-4">Error: Map could not be initialized.</p>'; } }
            }
             console.log("<<< SUCCESS initializeMapRelatedFeatures (profile.js)");
        } catch (error) {
            console.error('    !!! Error during initializeMapRelatedFeatures:', error); mapInitialized = false; profileLoadErrorDiv.textContent = 'Error setting up map features: ' + error.message; profileLoadErrorDiv.classList.remove('hidden');
             if (mapContainer) { mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Error initializing map: ${error.message}</p>`; }
             console.log("<<< FAILED initializeMapRelatedFeatures (profile.js)");
        }
    }

    // --- Profile & Dog Functions ---
    async function fetchUserProfile(userId) {
        console.log(`[fetchUserProfile] Fetching profile for user ID: ${userId}`);
        const { data, error } = await _supabase.from('profiles').select('*, latitude, longitude').eq('id', userId).single();
         if (error) { console.error('[fetchUserProfile] Error:', error); loadingState.style.display = 'none'; profileLoadErrorDiv.textContent = `Error fetching profile: ${error.message}. Please refresh.`; profileLoadErrorDiv.classList.remove('hidden'); mainContent.classList.add('hidden'); return null; }
         if (!data) { console.error('[fetchUserProfile] No profile data found.'); loadingState.style.display = 'none'; profileLoadErrorDiv.textContent = 'Profile data not found.'; profileLoadErrorDiv.classList.remove('hidden'); mainContent.classList.add('hidden'); return null; }
        console.log('[fetchUserProfile] Success:', data);
        return data;
    }

    function populateProfileForm(profile) {
        if (!profile || !profileForm) return;
        console.log('[populateProfileForm] Populating form with:', profile);
        profileForm.querySelector('#profile-name').value = profile.full_name || '';
        profileForm.querySelector('#profile-email').value = currentUser.email || '';
        profileForm.querySelector('#profile-mobile').value = profile.mobile || '';
        if(profileAddressInput) profileAddressInput.value = profile.address || '';
        if (profile.role === 'walker' && walkerAgeInput) { walkerAgeInput.value = profile.age || ''; }
        selectedLocation = null;
        if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = '';
        console.log('[populateProfileForm] selectedLocation reset.');
    }

    async function fetchUserDogs(userId) {
         const { data, error } = await _supabase.from('dogs').select('*').eq('owner_id', userId).order('created_at', { ascending: false });
        if (error) { console.error('Error fetching dogs:', error); return []; }
        return data || [];
    }

    function displayDogs(dogs) {
         if (!dogListDiv || !noDogsMessage) return;
         if (!dogs || dogs.length === 0) { noDogsMessage.style.display = 'block'; dogListDiv.innerHTML = ''; return; }
        noDogsMessage.style.display = 'none'; dogListDiv.innerHTML = '';
        dogs.forEach(dog => {
            const dogCard = document.createElement('div'); dogCard.className = 'dog-card';
            dogCard.innerHTML = `<h4>${dog.name}</h4><div class="grid grid-cols-2 gap-2 text-sm">${dog.breed ? `<div><span class="font-medium">Breed:</span> ${dog.breed}</div>` : ''}${dog.age ? `<div><span class="font-medium">Age:</span> ${dog.age} years</div>` : ''}${dog.gender ? `<div><span class="font-medium">Gender:</span> ${dog.gender}</div>` : ''}</div>${dog.special_needs ? `<div class="mt-2 text-sm"><span class="font-medium">Special Needs:</span> ${dog.special_needs}</div>` : ''}<div class="mt-3 pt-2 border-t border-gray-100 text-right"><button class="text-red-500 hover:text-red-700 text-sm font-medium remove-dog" data-dog-id="${dog.id}">Remove</button></div>`;
            dogListDiv.appendChild(dogCard);
        });
        dogListDiv.querySelectorAll('.remove-dog').forEach(button => button.addEventListener('click', handleRemoveDogClick));
    }

    async function handleRemoveDogClick(e) {
         const dogId = e.target.dataset.dogId;
         if (confirm('Are you sure you want to remove this dog?')) {
             const { error } = await _supabase.from('dogs').delete().eq('id', dogId);
             if (error) { console.error('Error removing dog:', error); if(dogMessage) { dogMessage.textContent = 'Error removing dog: '+error.message; dogMessage.style.color = 'red'; } }
             else { if(dogMessage) { dogMessage.textContent = 'Dog removed successfully.'; dogMessage.style.color = 'green'; } const updatedDogs = await fetchUserDogs(currentUser.id); displayDogs(updatedDogs); }
         }
    }

     async function handleAddDog(event) {
         event.preventDefault();
         if (!dogMessage || !addDogForm) return;
         dogMessage.textContent = 'Adding dog...'; dogMessage.style.color = 'inherit';
         const formData = new FormData(addDogForm);
         const newDog = { owner_id: currentUser.id, name: formData.get('name')?.trim(), breed: formData.get('breed')?.trim() || null, age: formData.get('age') ? parseInt(formData.get('age')) : null, gender: formData.get('gender') || null, special_needs: formData.get('special_needs')?.trim() || null, created_at: new Date(), updated_at: new Date() };
         if (!newDog.name) { dogMessage.textContent = 'Dog name is required.'; dogMessage.style.color = 'red'; return; }
         const { data, error } = await _supabase.from('dogs').insert([newDog]).select();
         if (error) { console.error("Error adding dog:", error); dogMessage.textContent = `Error: ${error.message}`; dogMessage.style.color = 'red'; }
         else { dogMessage.textContent = 'Dog added successfully!'; dogMessage.style.color = 'green'; addDogForm.reset(); const dogs = await fetchUserDogs(currentUser.id); displayDogs(dogs); }
    }

     async function handleProfileUpdate(event) {
          event.preventDefault();
          if (!profileMessage || !profileAddressInput) return;
          profileMessage.textContent = 'Updating...'; profileMessage.style.color = 'inherit';
          const formData = new FormData(profileForm);
          const updates = {
              full_name: formData.get('full_name')?.trim(), mobile: formData.get('mobile')?.trim(), address: profileAddressInput.value.trim() || null, updated_at: new Date(),
              latitude: selectedLocation ? selectedLocation.lat : userProfile?.latitude, longitude: selectedLocation ? selectedLocation.lng : userProfile?.longitude,
          };
           if (selectedLocation && selectedLocation.address) { updates.address = selectedLocation.address; }
          if (!updates.address) { updates.latitude = null; updates.longitude = null; }
          console.log('[handleProfileUpdate] Sending updates to Supabase:', updates);
          const { data: updatedProfile, error } = await _supabase.from('profiles').update(updates).eq('id', currentUser.id).select('*, latitude, longitude').single();
          if (error) { console.error("[handleProfileUpdate] Error:", error); profileMessage.textContent = `Error: ${error.message}`; profileMessage.style.color = 'red'; }
          else {
              profileMessage.textContent = 'Profile updated successfully!'; profileMessage.style.color = 'green';
              userProfile = updatedProfile; mapDataLoaded = false;
              console.log("[handleProfileUpdate] Profile updated locally:", userProfile);
              populateProfileForm(userProfile);
              pickerMapContainer?.classList.add('hidden'); pickerMarker?.setMap(null);
              if (mapSection?.classList.contains('active')) { console.log("[handleProfileUpdate] Main map view active, reloading its data."); loadMapData(); }
          }
    }

    // --- Location Picker Functions ---
    function initAutocomplete() {
        if (!profileAddressInput || !geocoder) { console.warn("Autocomplete init skipped: Input field or Geocoder not ready."); return; }
        if (autocomplete) { console.log("Autocomplete already initialized."); return; }
        console.log("[initAutocomplete] Initializing Places Autocomplete");
        try {
             const options = { componentRestrictions: { country: "in" }, fields: ["geometry.location", "formatted_address", "name"], strictBounds: false, };
             autocomplete = new google.maps.places.Autocomplete(profileAddressInput, options);
             autocomplete.addListener('place_changed', () => { /* ... same as before ... */ });
             profileAddressInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
         } catch (error) { console.error("Error initializing Autocomplete:", error); }
    }

    function initPickerMap() {
         if (!mapInitialized || !geocoder) { console.warn("Cannot init picker map yet: Map services not ready."); if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = "Map services loading..."; return; }
         if(!pickerMapContainer) { console.error("Picker map container not found."); return; }
         pickerMapContainer.classList.remove('hidden'); pickerMapContainer.innerHTML = '';
         let initialPosition = INDIA_CENTER; let initialZoom = DEFAULT_ZOOM;
         if (selectedLocation) { initialPosition = { lat: selectedLocation.lat, lng: selectedLocation.lng }; initialZoom = DETAIL_ZOOM; }
         else if (userProfile?.latitude && userProfile?.longitude) { initialPosition = { lat: userProfile.latitude, lng: userProfile.longitude }; initialZoom = DETAIL_ZOOM; }
         console.log("[initPickerMap] Initial position:", initialPosition, "Zoom:", initialZoom);
         try {
             if (!pickerMap) { pickerMap = new google.maps.Map(pickerMapContainer, { center: initialPosition, zoom: initialZoom, mapTypeControl: false, streetViewControl: false, fullscreenControl: false }); }
             else { pickerMap.setCenter(initialPosition); pickerMap.setZoom(initialZoom); }
             if (!pickerMarker) { pickerMarker = new google.maps.Marker({ position: initialPosition, map: pickerMap, draggable: true, title: "Drag me!" }); pickerMarker.addListener('dragend', handleMarkerDragEnd); }
             else { pickerMarker.setPosition(initialPosition); pickerMarker.setMap(pickerMap); }
              if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = 'Drag the marker to set location.';
          } catch (error) { console.error("Error creating picker map/marker:", error); pickerMapContainer.innerHTML = `<p class="text-red-500 p-4">Error loading map: ${error.message}</p>`; }
    }

    function handleMarkerDragEnd(event) {
        if (!event?.latLng) return;
        const lat = event.latLng.lat(); const lng = event.latLng.lng();
        console.log(`[handleMarkerDragEnd] Marker dragged to: Lat: ${lat}, Lng: ${lng}`);
        if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = 'Finding address...';
        reverseGeocodeLatLng(event.latLng);
    }

    function reverseGeocodeLatLng(latLng) {
        if (!geocoder) { console.error("Geocoder not available for reverse geocoding."); if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = 'Error: Geocoding service not ready.'; return; }
        console.log("[reverseGeocodeLatLng] Requesting address for:", latLng.toString());
        geocoder.geocode({ 'location': latLng }, (results, status) => {
             // ... (same logic as before) ...
            console.log(`[reverseGeocodeLatLng] Status: ${status}`, results);
            if (status === 'OK') {
                if (results?.[0]) {
                    const addressString = results[0].formatted_address; console.log(`[reverseGeocodeLatLng] Found address: ${addressString}`);
                    if(profileAddressInput) profileAddressInput.value = addressString;
                    selectedLocation = { lat: latLng.lat(), lng: latLng.lng(), address: addressString };
                    if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = `Location set: ${addressString.substring(0, 50)}...`;
                    if(profileMessage) profileMessage.textContent = '';
                    console.log("[reverseGeocodeLatLng] Stored selected location:", selectedLocation);
                } else { console.warn('[reverseGeocodeLatLng] No results found.'); if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = 'Could not find address.'; selectedLocation = null; }
            } else { console.error(`[reverseGeocodeLatLng] Geocoder failed: ${status}`); if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = `Error finding address: ${status}`; selectedLocation = null; }
        });
    }

    // --- Main Map View Functions ---

    async function loadMapData() {
        console.log("[loadMapData] Loading data for main map view.");
        if (!mapInitialized || !mainMap) {
            console.log("Skipping map data load - main map services not ready.");
            if (mapContainer) {
                 let loadingMsg = mapContainer.querySelector('.map-loading-message');
                 if (!loadingMsg) { loadingMsg = document.createElement('p'); loadingMsg.className = 'map-loading-message'; mapContainer.prepend(loadingMsg); }
                 loadingMsg.textContent = 'Map services loading... Please wait.'; loadingMsg.style.display = 'block';
            }
            return;
        }

        let loadingMsg = mapContainer.querySelector('.map-loading-message');
        if(!loadingMsg) { console.warn("Map loading msg missing, creating."); loadingMsg = document.createElement('p'); loadingMsg.className = 'map-loading-message'; mapContainer.prepend(loadingMsg); }
        loadingMsg.textContent = 'Loading your location...'; loadingMsg.style.display = 'block';
        mapContainer.style.backgroundColor = '#f9fafb';

        if (userMarker) userMarker.setMap(null);
        otherUserMarkers.forEach(marker => marker.setMap(null));
        otherUserMarkers = []; userMarker = null;

        let userCoords = null;
        let bounds = new google.maps.LatLngBounds();

        // 1. Plot Current User
        if (userProfile?.latitude && userProfile?.longitude) {
            userCoords = { lat: userProfile.latitude, lng: userProfile.longitude };
            console.log("[loadMapData] Plotting current user at:", userCoords);
            try {
                userMarker = new google.maps.Marker({ position: userCoords, map: mainMap, title: 'Your Location', icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#8B5CF6', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }, zIndex: 100 });
                bounds.extend(userCoords);
                loadingMsg.textContent = `Finding nearby ${userProfile.role === 'owner' ? 'walkers' : 'owners'}...`;
            } catch (markerError) { console.error("Error creating user marker:", markerError); loadingMsg.textContent = 'Error displaying your location.'; }
        } else {
            console.warn("[loadMapData] No coordinates for user. Update profile to see nearby users.");
            loadingMsg.textContent = 'Your location not set. Update profile to see nearby users.'; loadingMsg.style.display = 'block';
            mainMap.setCenter(INDIA_CENTER); mainMap.setZoom(DEFAULT_ZOOM); mapDataLoaded = true; return;
        }

        // 2. Determine Target Role & Prepare RPC Params
        const targetRole = userProfile.role === 'owner' ? 'walker' : 'owner';
        if (!userCoords || !currentUser?.id) { console.error("[loadMapData] Missing user data for RPC call."); loadingMsg.textContent = 'Error: Missing user data for search.'; mapDataLoaded = true; return; }

        const rpcParams = {
            // Ensure parameters are numbers, not strings, if necessary
            user_lat: Number(userCoords.lat),
            user_lng: Number(userCoords.lng),
            search_radius_km: Number(SEARCH_RADIUS_KM),
            target_role: targetRole,
            exclude_user_id: currentUser.id
        };
        console.log("[loadMapData] Parameters being sent to RPC 'find_nearby_users':", JSON.stringify(rpcParams, null, 2));

        // 3. Call the RPC Function
        console.log(`[loadMapData] Calling RPC find_nearby_users for role '${targetRole}' within ${SEARCH_RADIUS_KM}km`);
        try {
            const { data: nearbyUsers, error: rpcError } = await _supabase.rpc('find_nearby_users', rpcParams);
            if (rpcError) throw rpcError;
            console.log(`[loadMapData] RPC returned ${nearbyUsers?.length || 0} nearby users.`); // Log the actual count returned

            // 4. Plot Nearby Users
            const infowindow = new google.maps.InfoWindow(); let plottedCount = 0;
            if (nearbyUsers?.length > 0) {
                 nearbyUsers.forEach(user => {
                     if (typeof user.latitude === 'number' && typeof user.longitude === 'number') {
                         const otherCoords = { lat: user.latitude, lng: user.longitude };
                         try {
                             const marker = new google.maps.Marker({ position: otherCoords, map: mainMap, title: user.full_name, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: targetRole === 'walker' ? '#10B981' : '#F59E0B', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } });
                             otherUserMarkers.push(marker); bounds.extend(otherCoords); plottedCount++;
                             marker.addListener('click', () => { infowindow.setContent(`<div class="p-2"><strong>${user.full_name || 'N/A'}</strong><br>${user.role === 'owner' ? 'Pet Owner' : 'Dog Walker'}<br><small>Approx. ${user.distance_km?.toFixed(1) ?? '?'} km away</small></div>`); infowindow.open(mainMap, marker); });
                         } catch(markerError) { console.error(`Error creating marker for ${user.full_name}:`, markerError); }
                     } else { console.warn(`[loadMapData] Nearby user ${user.id} missing coordinates.`); }
                 });
            }

            // 5. Finalize Map View
            loadingMsg.style.display = 'none'; mapDataLoaded = true;
             if (plottedCount > 0 || userMarker) { // Check if there's anything to show
                 if (!bounds.isEmpty()) {
                      console.log("[loadMapData] Fitting map bounds."); mainMap.fitBounds(bounds);
                      google.maps.event.addListenerOnce(mainMap, 'idle', function() { if (this.getZoom() > DETAIL_ZOOM + 1) { this.setZoom(DETAIL_ZOOM + 1); }});
                 } else if (userCoords) { mainMap.setCenter(userCoords); mainMap.setZoom(DETAIL_ZOOM); } // Zoom in if only user marker
             } else { mainMap.setCenter(INDIA_CENTER); mainMap.setZoom(DEFAULT_ZOOM); } // Fallback if nothing plotted

             if (plottedCount === 0 && userMarker) { // Show message if only user is there
                 loadingMsg.textContent = `No nearby ${targetRole}s found within ${SEARCH_RADIUS_KM}km.`; loadingMsg.style.display = 'block';
             }
             console.log(`[loadMapData] Finished. Plotted user: ${!!userMarker}. Plotted others: ${plottedCount}`);

        } catch (error) {
            console.error("[loadMapData] Error calling RPC or plotting:", error);
            loadingMsg.textContent = `Error loading nearby users: ${error.message}`; loadingMsg.style.display = 'block'; mapDataLoaded = true;
        }
    }

    // --- Initialize Dashboard ---
    async function initDashboard() {
        console.log(">>> START initDashboard (profile.js)");
        try {
            // Sidebar Navigation Listener
            sidebarLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetSectionId = link.dataset.section;
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                    contentSections.forEach(section => section.classList.remove('active'));
                    const targetSection = document.getElementById(targetSectionId);
                    if (targetSection) { targetSection.classList.add('active'); } else { console.error(`Target section #${targetSectionId} not found!`); return; }

                    if (targetSectionId === 'map-section') {
                        console.log("Map section activated.");
                        mapDataLoaded = false; // Reset flag to trigger reload check
                        if (mapInitialized) { // Check if OUR init ran
                            console.log("Map initialized, attempting to load map data..."); loadMapData();
                        } else { console.log("Map services not yet initialized."); }
                        pickerMapContainer?.classList.add('hidden'); pickerMarker?.setMap(null);
                    } else {
                         if(targetSectionId !== 'profile-section') { pickerMapContainer?.classList.add('hidden'); pickerMarker?.setMap(null); }
                    }
                });
            });

            // Display User Email
            if(userEmailDisplay) userEmailDisplay.textContent = currentUser.email;

            // Fetch Profile
            userProfile = await fetchUserProfile(currentUser.id);
            if (!userProfile) return;

            // Queue Map Related Initializations
            console.log("    Queueing/running map initialization via whenGoogleMapsReady...");
            whenGoogleMapsReady(initializeMapRelatedFeatures);

            // Setup Non-Map Dependent UI
            if (userProfile.role === 'owner') {
                ownerContent?.classList.remove('hidden');
                if(mapTitleRole) mapTitleRole.textContent = 'Dog Walkers'; if(mapDescriptionRole) mapDescriptionRole.textContent = 'dog walkers';
                const dogs = await fetchUserDogs(currentUser.id); displayDogs(dogs);
                if (addDogForm) addDogForm.addEventListener('submit', handleAddDog);
            } else if (userProfile.role === 'walker') {
                walkerContent?.classList.remove('hidden');
                 if(mapTitleRole) mapTitleRole.textContent = 'Pet Owners'; if(mapDescriptionRole) mapDescriptionRole.textContent = 'pet owners';
            }
            populateProfileForm(userProfile);
            if(profileForm) profileForm.addEventListener('submit', handleProfileUpdate);
            if(pinLocationButton) pinLocationButton.addEventListener('click', initPickerMap);

            loadingState.style.display = 'none'; mainContent.classList.remove('hidden');
            console.log("<<< END initDashboard (profile.js) - Basic setup complete, maps will initialize when ready.");

        } catch (error) {
            console.error('Error initializing dashboard:', error); loadingState.style.display = 'none'; profileLoadErrorDiv.textContent = 'Fatal Error loading dashboard: ' + error.message; profileLoadErrorDiv.classList.remove('hidden'); mainContent.classList.add('hidden');
        }
    }

    // --- Start Dashboard Initialization ---
    initDashboard();

}); // End DOMContentLoaded