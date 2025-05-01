// Profile/Dashboard functionality for Pawsitive Strides
// Uses RPC function for finding nearby users.

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
    
    // Owner details form elements
    const ownerDetailsForm = ownerContent.querySelector('#owner-details-form');
    const ownerEmergencyName = ownerContent.querySelector('#emergency-contact-name');
    const ownerEmergencyPhone = ownerContent.querySelector('#emergency-contact-phone');
    const ownerPreferredComm = ownerContent.querySelector('#preferred-communication');
    const ownerNotes = ownerContent.querySelector('#owner-notes');
    const ownerDetailsMessage = ownerContent.querySelector('.owner-details-message');

    // Walker details form elements
    const walkerAboutMe = walkerContent.querySelector('#walker-about-me');
    const walkerExpYears = walkerContent.querySelector('#walker-exp-years');
    const walkerExpSummary = walkerContent.querySelector('#walker-exp-summary');
    const walkerAvailabilityData = walkerContent.querySelector('#availability-data');
    const walkerRecurringAvail = walkerContent.querySelector('#recurring-availability');
    const walkerMessage = walkerContent.querySelector('.walker-message');
    const availabilityContainer = walkerContent.querySelector('#availability-container');

    // Modal elements
    const userProfileModal = document.getElementById('user-profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const modalUserName = document.getElementById('modal-user-name');
    const modalUserRole = document.getElementById('modal-user-role');
    const modalUserDistance = document.getElementById('modal-user-distance');
    const modalLoading = document.getElementById('modal-loading');
    const modalError = document.getElementById('modal-error');
    const modalWalkerContent = document.getElementById('modal-walker-content');
    const modalOwnerContent = document.getElementById('modal-owner-content');

    // --- Global State ---
    let userProfile = null;
    let mainMap = null; // The map instance for the "Map View" tab
    let geocoder = null; // Shared Geocoder instance (for Autocomplete, Reverse Geocode)
    let mapInitialized = false; // Tracks if *our* map init logic has run successfully
    let mapDataLoaded = false; // Tracks if data for the main map view has been loaded
    let userMarker = null; // Marker on the main map view
    let otherUserMarkers = []; // Markers for others on main map view
    let autocomplete = null; // For address input
    let pickerMap = null; // Separate map instance for the location picker
    let pickerMarker = null; // Draggable marker for the location picker
    let selectedLocation = null; // Stores {lat, lng, address} from Autocomplete OR Picker

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
            geocoder = new google.maps.Geocoder();
            console.log('    Geocoder initialized.');

            console.log("    Initializing Autocomplete...");
            initAutocomplete();
            console.log("    Autocomplete initialization attempted.");

            console.log("    Initializing Main Map...");
            if (!mapContainer) {
                console.error("    !!! Main map container element (#map-container) not found.");
            } else {
                 mainMap = new google.maps.Map(mapContainer, {
                    center: INDIA_CENTER, zoom: DEFAULT_ZOOM, mapId: '8a23b4bdd9ef4f8c', mapTypeControl: false, streetViewControl: false });
                 console.log('    Main map view initialized.');
                 const loadingMsg = mapContainer.querySelector('.map-loading-message'); if(loadingMsg) loadingMsg.style.display = 'none';
            }

            console.log("    Setting mapInitialized = true");
            mapInitialized = true; // Mark core services as ready

            // Check if map section is active and load data if needed NOW
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
        
        // Populate owner-specific fields if role is owner
        if (profile.role === 'owner' && ownerDetailsForm) {
            if (ownerEmergencyName) ownerEmergencyName.value = profile.emergency_contact_name || '';
            if (ownerEmergencyPhone) ownerEmergencyPhone.value = profile.emergency_contact_phone || '';
            if (ownerPreferredComm) ownerPreferredComm.value = profile.preferred_communication || '';
            if (ownerNotes) ownerNotes.value = profile.owner_notes_for_walker || '';
        }
        
        // Populate walker-specific fields if role is walker
        if (profile.role === 'walker') {
            if (walkerAgeInput) walkerAgeInput.value = profile.age || '';
            if (walkerAboutMe) walkerAboutMe.value = profile.about_me || '';
            if (walkerExpYears) walkerExpYears.value = profile.experience_years || '';
            if (walkerExpSummary) walkerExpSummary.value = profile.experience_summary || '';
            
            // Initialize time selects
            initTimeSelects();
            
            // Load availability schedule if present
            if (profile.availability_schedule && availabilityContainer) {
                loadAvailabilitySchedule(profile.availability_schedule);
            }
        }
        
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
            dogCard.innerHTML = `
                <h4>${dog.name}</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    ${dog.breed ? `<div><span class="font-medium">Breed:</span> ${dog.breed}</div>` : ''}
                    ${dog.age ? `<div><span class="font-medium">Age:</span> ${dog.age} years</div>` : ''}
                    ${dog.gender ? `<div><span class="font-medium">Gender:</span> ${dog.gender}</div>` : ''}
                    ${dog.weight ? `<div><span class="font-medium">Weight:</span> ${dog.weight} kg</div>` : ''}
                </div>
                
                ${dog.temperament && dog.temperament.length > 0 ? 
                    `<div class="mt-2 text-sm"><span class="font-medium">Temperament:</span> ${Array.isArray(dog.temperament) ? dog.temperament.join(', ') : dog.temperament}</div>` : ''}
                
                ${dog.special_needs ? `<div class="mt-2 text-sm"><span class="font-medium">Special Needs:</span> ${dog.special_needs}</div>` : ''}
                ${dog.vet_contact ? `<div class="mt-2 text-sm"><span class="font-medium">Vet Contact:</span> ${dog.vet_contact}</div>` : ''}
                ${dog.preferred_route ? `<div class="mt-2 text-sm"><span class="font-medium">Preferred Route:</span> ${dog.preferred_route}</div>` : ''}
                
                <div class="mt-3 pt-2 border-t border-gray-100 text-right">
                    <button class="text-red-500 hover:text-red-700 text-sm font-medium remove-dog" data-dog-id="${dog.id}">Remove</button>
                </div>`;
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
         
         // Process temperament from comma-separated string to array
         let temperamentArray = null;
         const temperamentString = formData.get('temperament')?.trim();
         if (temperamentString) {
             temperamentArray = temperamentString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
         }
         
         // Process weight as a number
         let weight = null;
         const weightValue = formData.get('weight');
         if (weightValue && weightValue !== '') {
             weight = parseFloat(weightValue);
         }
         
         const newDog = { 
             owner_id: currentUser.id, 
             name: formData.get('name')?.trim(), 
             breed: formData.get('breed')?.trim() || null, 
             age: formData.get('age') ? parseInt(formData.get('age')) : null, 
             gender: formData.get('gender') || null, 
             weight: weight,
             temperament: temperamentArray,
             special_needs: formData.get('special_needs')?.trim() || null,
             vet_contact: formData.get('vet_contact')?.trim() || null,
             preferred_route: formData.get('preferred_route')?.trim() || null,
             // photo_urls and vaccination_records_url will be handled in future updates
             created_at: new Date(), 
             updated_at: new Date() 
         };
         
         if (!newDog.name) { 
             dogMessage.textContent = 'Dog name is required.'; 
             dogMessage.style.color = 'red'; 
             return; 
         }
         
         const { data, error } = await _supabase.from('dogs').insert([newDog]).select();
         if (error) { 
             console.error("Error adding dog:", error); 
             dogMessage.textContent = `Error: ${error.message}`; 
             dogMessage.style.color = 'red'; 
         }
         else { 
             dogMessage.textContent = 'Dog added successfully!'; 
             dogMessage.style.color = 'green'; 
             addDogForm.reset(); 
             const dogs = await fetchUserDogs(currentUser.id); 
             displayDogs(dogs); 
         }
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
           if (selectedLocation && selectedLocation.address) { updates.address = selectedLocation.address; } // Ensure address from picker/autocomplete is saved
          if (!updates.address) { updates.latitude = null; updates.longitude = null; } // Clear coords if address cleared
          console.log('[handleProfileUpdate] Sending updates to Supabase:', updates);
          const { data: updatedProfile, error } = await _supabase.from('profiles').update(updates).eq('id', currentUser.id).select('*, latitude, longitude').single();
          if (error) { console.error("[handleProfileUpdate] Error:", error); profileMessage.textContent = `Error: ${error.message}`; profileMessage.style.color = 'red'; }
          else {
              profileMessage.textContent = 'Profile updated successfully!'; profileMessage.style.color = 'green';
              userProfile = updatedProfile; mapDataLoaded = false; // Mark map data as stale
              console.log("[handleProfileUpdate] Profile updated locally:", userProfile);
              populateProfileForm(userProfile); // Reset form and selectedLocation state
              pickerMapContainer?.classList.add('hidden'); pickerMarker?.setMap(null);
              // If main map view is *currently* active, trigger reload immediately
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
             autocomplete.addListener('place_changed', () => {
                 const place = autocomplete.getPlace(); console.log("[Autocomplete] Place changed:", place);
                 if (!place?.geometry?.location) { console.warn("Autocomplete: No geometry for selected place:", place?.name); selectedLocation = null; if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = 'Could not get location details.'; return; }
                 selectedLocation = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), address: place.formatted_address };
                 profileAddressInput.value = selectedLocation.address;
                 if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = `Selected: ${selectedLocation.address.substring(0, 50)}...`;
                 if(profileMessage) profileMessage.textContent = '';
                 console.log("[Autocomplete] Stored selected location:", selectedLocation);
                 if (pickerMap && pickerMarker) { const newPos = new google.maps.LatLng(selectedLocation.lat, selectedLocation.lng); pickerMap.setCenter(newPos); pickerMap.setZoom(DETAIL_ZOOM); pickerMarker.setPosition(newPos); }
             });
             profileAddressInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
         } catch (error) { console.error("Error initializing Autocomplete:", error); }
    }

    function initPickerMap() {
         if (!mapInitialized || !geocoder) { console.warn("Cannot init picker map yet: Map services not ready."); if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = "Map services loading..."; return; }
         if(!pickerMapContainer) { console.error("Picker map container not found."); return; }
         pickerMapContainer.classList.remove('hidden'); pickerMapContainer.innerHTML = ''; // Clear loading message
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
            console.log(`[reverseGeocodeLatLng] Status: ${status}`, results);
            if (status === 'OK') {
                if (results?.[0]) { // Use optional chaining for safety
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
        mapContainer.style.backgroundColor = '#f9fafb'; // Reset background

        // Clear previous markers
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
            mainMap.setCenter(INDIA_CENTER); mainMap.setZoom(DEFAULT_ZOOM);
            mapDataLoaded = true; return;
        }

        // 2. Determine Target Role & Call RPC
        const targetRole = userProfile.role === 'owner' ? 'walker' : 'owner';
        if (!targetRole || !userCoords || !currentUser?.id) { // Added checks
             console.error("[loadMapData] Missing required data for RPC call:", { hasUserProfile: !!userProfile, hasUserCoords: !!userCoords, hasCurrentUserId: !!currentUser?.id });
             loadingMsg.textContent = 'Error: Missing user data for search.';
             mapDataLoaded = true; return;
        }

        const rpcParams = {
            user_lat: userCoords.lat,
            user_lng: userCoords.lng,
            search_radius_km: SEARCH_RADIUS_KM,
            target_role: targetRole,
            exclude_user_id: currentUser.id
        };

        // ****** ADD THIS DETAILED LOG ******
        console.log("[loadMapData] Parameters being sent to RPC 'find_nearby_users':", JSON.stringify(rpcParams, null, 2));
        // ****** END OF ADDED LOG ******

        // 3. Call the RPC Function to Find Nearby Users
        console.log(`[loadMapData] Calling RPC find_nearby_users for role '${targetRole}' within ${SEARCH_RADIUS_KM}km`);
        try {
            // Use the prepared rpcParams object
            const { data: nearbyUsers, error: rpcError } = await _supabase.rpc('find_nearby_users', rpcParams);

            if (rpcError) {
                throw rpcError; // Throw error to be caught below
            }

            // This log line confirms what the RPC *actually* returned
            console.log(`[loadMapData] RPC returned ${nearbyUsers?.length || 0} nearby users.`);

            // 3. Plot Nearby Users
            const infowindow = new google.maps.InfoWindow(); let plottedCount = 0;
            if (nearbyUsers?.length > 0) {
                 nearbyUsers.forEach(user => {
                     if (typeof user.latitude === 'number' && typeof user.longitude === 'number') {
                         const otherCoords = { lat: user.latitude, lng: user.longitude };
                         try {
                             const marker = new google.maps.Marker({ position: otherCoords, map: mainMap, title: user.full_name, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: targetRole === 'walker' ? '#10B981' : '#F59E0B', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } });
                             otherUserMarkers.push(marker); bounds.extend(otherCoords); plottedCount++;
                             
                             marker.addListener('click', () => { 
                                 const infoContent = `
                                     <div class="p-2">
                                         <strong>${user.full_name || 'N/A'}</strong><br>
                                         ${user.role === 'owner' ? 'Pet Owner' : 'Dog Walker'}<br>
                                         <small>Approx. ${user.distance_km?.toFixed(1) ?? '?'} km away</small>
                                         <div class="mt-2">
                                             <button class="view-profile-btn bg-purple-600 text-white text-xs px-3 py-1 rounded hover:bg-purple-700" 
                                                    data-user-id="${user.id}" 
                                                    data-user-role="${user.role}"
                                                    data-user-name="${user.full_name || 'User'}"
                                                    data-user-distance="${user.distance_km?.toFixed(1) || '?'}">
                                                 View Profile
                                             </button>
                                         </div>
                                     </div>
                                 `;
                                 
                                 infowindow.setContent(infoContent);
                                 infowindow.open(mainMap, marker);
                                 
                                 // Add click event listener to the View Profile button after the infowindow is opened
                                 google.maps.event.addListenerOnce(infowindow, 'domready', () => {
                                     const viewProfileBtn = document.querySelector('.view-profile-btn');
                                     if (viewProfileBtn) {
                                         viewProfileBtn.addEventListener('click', (e) => {
                                             const userId = e.target.dataset.userId;
                                             const userRole = e.target.dataset.userRole;
                                             const userName = e.target.dataset.userName;
                                             const userDistance = e.target.dataset.userDistance;
                                             viewUserProfile(userId, userRole, userName, userDistance);
                                         });
                                     }
                                 });
                             });
                         } catch(markerError) { console.error(`Error creating marker for ${user.full_name}:`, markerError); }
                     } else { console.warn(`[loadMapData] User ${user.id} missing coordinates.`); }
                 });
            }

            // 4. Finalize Map View
            loadingMsg.style.display = 'none'; mapDataLoaded = true;
            if (plottedCount > 0 || userMarker) { // Check if there's anything to show
                 if (!bounds.isEmpty()) {
                      console.log("[loadMapData] Fitting map bounds.");
                      mainMap.fitBounds(bounds);
                      google.maps.event.addListenerOnce(mainMap, 'idle', function() { if (this.getZoom() > DETAIL_ZOOM + 1) { this.setZoom(DETAIL_ZOOM + 1); }}); // Allow slightly higher zoom from fitBounds
                 } else if (userCoords) { // Only user marker plotted
                     mainMap.setCenter(userCoords); mainMap.setZoom(DETAIL_ZOOM);
                 }
            } else { // No user marker, no others (shouldn't happen if user check passed)
                mainMap.setCenter(INDIA_CENTER); mainMap.setZoom(DEFAULT_ZOOM);
            }

             if (plottedCount === 0 && userMarker) { // Show message if only user is there
                 loadingMsg.textContent = `No nearby ${targetRole}s found within ${SEARCH_RADIUS_KM}km.`;
                 loadingMsg.style.display = 'block';
             }
             console.log(`[loadMapData] Finished. Plotted user: ${!!userMarker}. Plotted others: ${plottedCount}`);

        } catch (error) {
            console.error("[loadMapData] Error calling RPC or plotting:", error);
            loadingMsg.textContent = `Error loading nearby users: ${error.message}`;
            loadingMsg.style.display = 'block'; mapDataLoaded = true;
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
                    // Update UI immediately
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                    contentSections.forEach(section => section.classList.remove('active'));
                    const targetSection = document.getElementById(targetSectionId);
                    if (targetSection) { targetSection.classList.add('active'); } else { console.error(`Target section #${targetSectionId} not found!`); return; }

                    // Handle map loading/state when switching tabs
                    if (targetSectionId === 'map-section') {
                        console.log("Map section activated.");
                        mapDataLoaded = false; // Reset flag to force reload check
                        if (mapInitialized && !mapDataLoaded) { // Check if OUR init ran
                            console.log("Map initialized, loading map data..."); loadMapData();
                        } else { console.log("Map not ready or already loading."); }
                        // Hide picker if it was open
                        pickerMapContainer?.classList.add('hidden'); pickerMarker?.setMap(null);
                    } else {
                        // Hide picker map if navigating away from profile section
                         if(targetSectionId !== 'profile-section') {
                            pickerMapContainer?.classList.add('hidden'); pickerMarker?.setMap(null);
                         }
                    }
                });
            });

            // Display User Email
            if(userEmailDisplay) userEmailDisplay.textContent = currentUser.email;

            // Fetch Profile - crucial step before proceeding
            userProfile = await fetchUserProfile(currentUser.id);
            if (!userProfile) return; // Stop initialization if profile fetch failed

            // Queue Map Related Initializations (will run when Google API is ready)
            console.log("    Queueing/running map initialization via whenGoogleMapsReady...");
            whenGoogleMapsReady(initializeMapRelatedFeatures);

            // Setup Non-Map Dependent UI
            if (userProfile.role === 'owner') {
                ownerContent?.classList.remove('hidden');
                if(mapTitleRole) mapTitleRole.textContent = 'Dog Walkers';
                if(mapDescriptionRole) mapDescriptionRole.textContent = 'dog walkers';
                const dogs = await fetchUserDogs(currentUser.id); displayDogs(dogs);
                if (addDogForm) addDogForm.addEventListener('submit', handleAddDog);
            } else if (userProfile.role === 'walker') {
                walkerContent?.classList.remove('hidden');
                 if(mapTitleRole) mapTitleRole.textContent = 'Pet Owners';
                 if(mapDescriptionRole) mapDescriptionRole.textContent = 'pet owners';
            }
            populateProfileForm(userProfile); // Populate form fields
            if(profileForm) profileForm.addEventListener('submit', handleProfileUpdate); // Add save listener
            if(pinLocationButton) pinLocationButton.addEventListener('click', initPickerMap); // Add pin location listener

            // Hide Loading State & Show Content
            loadingState.style.display = 'none';
            mainContent.classList.remove('hidden');
            console.log("<<< END initDashboard (profile.js) - Basic setup complete, maps will initialize when ready.");

        } catch (error) {
            console.error('Error initializing dashboard:', error);
            loadingState.style.display = 'none';
            profileLoadErrorDiv.textContent = 'Fatal Error loading dashboard: ' + error.message;
            profileLoadErrorDiv.classList.remove('hidden');
            mainContent.classList.add('hidden');
        }
    }

    // --- Start Dashboard Initialization ---
    initDashboard();
    
    // Initialize time selection dropdowns
    function initTimeSelects() {
        const timeSelects = document.querySelectorAll('.time-from, .time-to');
        timeSelects.forEach(select => {
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add time options in 30-minute intervals
            for (let h = 0; h < 24; h++) {
                for (let m = 0; m < 60; m += 30) {
                    const hour = h.toString().padStart(2, '0');
                    const minute = m.toString().padStart(2, '0');
                    const timeValue = `${hour}:${minute}`;
                    const displayTime = formatTimeDisplay(timeValue);
                    
                    const option = document.createElement('option');
                    option.value = timeValue;
                    option.textContent = displayTime;
                    select.appendChild(option);
                }
            }
        });
    }
    
    // Convert 24-hour time format to 12-hour format for display
    function formatTimeDisplay(time24h) {
        const [hour, minute] = time24h.split(':');
        const h = parseInt(hour, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minute} ${ampm}`;
    }
    
    // Load saved availability schedule into UI
    function loadAvailabilitySchedule(scheduleData) {
        try {
            // Parse JSON if it's a string
            const schedule = typeof scheduleData === 'string' ? JSON.parse(scheduleData) : scheduleData;
            
            // Set recurring checkbox
            if (walkerRecurringAvail) {
                walkerRecurringAvail.checked = schedule.recurring || false;
            }
            
            // Process each day
            Object.keys(schedule).forEach(day => {
                if (day === 'recurring') return; // Skip the recurring flag
                
                const dayRow = availabilityContainer.querySelector(`[data-day="${day}"]`);
                if (!dayRow) return;
                
                // Check the day checkbox
                const checkbox = dayRow.querySelector('.day-checkbox');
                if (checkbox) checkbox.checked = true;
                
                const timeSlots = schedule[day];
                const timeSlotsContainer = dayRow.querySelector('.time-slots');
                
                // Clear any default time slots
                while (timeSlotsContainer.children.length > 0) {
                    timeSlotsContainer.removeChild(timeSlotsContainer.lastChild);
                }
                
                // Add each time slot
                timeSlots.forEach(slot => {
                    const [from, to] = slot.split('-');
                    addTimeSlotElement(timeSlotsContainer, from, to);
                });
                
                // Add an empty slot for adding more times
                addTimeSlotElement(timeSlotsContainer);
            });
        } catch (error) {
            console.error('Error loading availability schedule:', error);
        }
    }
    
    // Create and add a time slot element to the container
    function addTimeSlotElement(container, fromValue = '', toValue = '') {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'flex items-center space-x-2';
        
        slotDiv.innerHTML = `
            <select class="time-from input-field focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                <option value="">From</option>
            </select>
            <span>to</span>
            <select class="time-to input-field focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                <option value="">To</option>
            </select>
            <button type="button" class="add-time-slot text-sm text-purple-600 hover:text-purple-800">+ Add</button>
            ${fromValue ? '<button type="button" class="remove-time-slot text-sm text-red-600 hover:text-red-800 ml-2">× Remove</button>' : ''}
        `;
        
        container.appendChild(slotDiv);
        
        // Add time options to the selects
        const fromSelect = slotDiv.querySelector('.time-from');
        const toSelect = slotDiv.querySelector('.time-to');
        
        // Fill the time options
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hour = h.toString().padStart(2, '0');
                const minute = m.toString().padStart(2, '0');
                const timeValue = `${hour}:${minute}`;
                const displayTime = formatTimeDisplay(timeValue);
                
                const fromOption = document.createElement('option');
                fromOption.value = timeValue;
                fromOption.textContent = displayTime;
                if (timeValue === fromValue) fromOption.selected = true;
                fromSelect.appendChild(fromOption);
                
                const toOption = document.createElement('option');
                toOption.value = timeValue;
                toOption.textContent = displayTime;
                if (timeValue === toValue) toOption.selected = true;
                toSelect.appendChild(toOption);
            }
        }
        
        // Add event listeners
        slotDiv.querySelector('.add-time-slot').addEventListener('click', () => {
            addTimeSlotElement(container);
        });
        
        const removeBtn = slotDiv.querySelector('.remove-time-slot');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                container.removeChild(slotDiv);
            });
        }
    }
    
    // Collect availability data from the UI and format as JSON
    function collectAvailabilityData() {
        const availabilityData = {};
        
        // Get recurring flag
        availabilityData.recurring = walkerRecurringAvail ? walkerRecurringAvail.checked : false;
        
        // Process each day
        const dayRows = availabilityContainer.querySelectorAll('.day-row');
        dayRows.forEach(row => {
            const day = row.dataset.day;
            const checkbox = row.querySelector('.day-checkbox');
            
            // Only process checked days
            if (checkbox && checkbox.checked) {
                const timeSlots = [];
                const slotElements = row.querySelectorAll('.time-slots > div');
                
                slotElements.forEach(slot => {
                    const fromSelect = slot.querySelector('.time-from');
                    const toSelect = slot.querySelector('.time-to');
                    
                    const fromValue = fromSelect ? fromSelect.value : '';
                    const toValue = toSelect ? toSelect.value : '';
                    
                    // Only add valid time ranges
                    if (fromValue && toValue) {
                        timeSlots.push(`${fromValue}-${toValue}`);
                    }
                });
                
                if (timeSlots.length > 0) {
                    availabilityData[day] = timeSlots;
                }
            }
        });
        
        return availabilityData;
    }
    
    // Handle owner details form submission
    if (ownerDetailsForm) {
        ownerDetailsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!ownerDetailsMessage) return;
            
            ownerDetailsMessage.textContent = 'Updating...';
            ownerDetailsMessage.style.color = 'inherit';
            
            const formData = new FormData(ownerDetailsForm);
            const updates = {
                emergency_contact_name: formData.get('emergency_contact_name')?.trim() || null,
                emergency_contact_phone: formData.get('emergency_contact_phone')?.trim() || null,
                preferred_communication: formData.get('preferred_communication') || null,
                owner_notes_for_walker: formData.get('owner_notes_for_walker')?.trim() || null,
                updated_at: new Date()
            };
            
            console.log('[handleOwnerDetailsUpdate] Sending updates to Supabase:', updates);
            
            try {
                const { data: updatedProfile, error } = await _supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', currentUser.id)
                    .select('*')
                    .single();
                    
                if (error) {
                    console.error("[handleOwnerDetailsUpdate] Error:", error);
                    ownerDetailsMessage.textContent = `Error: ${error.message}`;
                    ownerDetailsMessage.style.color = 'red';
                } else {
                    ownerDetailsMessage.textContent = 'Owner details updated successfully!';
                    ownerDetailsMessage.style.color = 'green';
                    userProfile = updatedProfile;
                    console.log("[handleOwnerDetailsUpdate] Profile updated locally:", userProfile);
                }
            } catch (error) {
                console.error('[handleOwnerDetailsUpdate] Exception:', error);
                ownerDetailsMessage.textContent = `Error: ${error.message}`;
                ownerDetailsMessage.style.color = 'red';
            }
        });
    }
    
    // Handle walker details form submission
    if (walkerDetailsForm) {
        walkerDetailsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!walkerMessage) return;
            
            walkerMessage.textContent = 'Updating...';
            walkerMessage.style.color = 'inherit';
            
            // Collect availability data
            const availabilityData = collectAvailabilityData();
            
            const formData = new FormData(walkerDetailsForm);
            const updates = {
                about_me: formData.get('about_me')?.trim() || null,
                experience_years: formData.get('experience_years') ? parseInt(formData.get('experience_years')) : null,
                experience_summary: formData.get('experience_summary')?.trim() || null,
                availability_schedule: availabilityData ? JSON.stringify(availabilityData) : null,
                updated_at: new Date()
            };
            
            console.log('[handleWalkerDetailsUpdate] Sending updates to Supabase:', updates);
            
            try {
                const { data: updatedProfile, error } = await _supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', currentUser.id)
                    .select('*')
                    .single();
                    
                if (error) {
                    console.error("[handleWalkerDetailsUpdate] Error:", error);
                    walkerMessage.textContent = `Error: ${error.message}`;
                    walkerMessage.style.color = 'red';
                } else {
                    walkerMessage.textContent = 'Walker details updated successfully!';
                    walkerMessage.style.color = 'green';
                    userProfile = updatedProfile;
                    console.log("[handleWalkerDetailsUpdate] Profile updated locally:", userProfile);
                }
            } catch (error) {
                console.error('[handleWalkerDetailsUpdate] Exception:', error);
                walkerMessage.textContent = `Error: ${error.message}`;
                walkerMessage.style.color = 'red';
            }
        });
    }
    
    // Initialize availability UI events
    if (availabilityContainer) {
        // Initial setup of time selects
        initTimeSelects();
        
        // Setup event listeners for day checkboxes
        const dayCheckboxes = availabilityContainer.querySelectorAll('.day-checkbox');
        dayCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const dayRow = this.closest('.day-row');
                const timeSlots = dayRow.querySelector('.time-slots');
                
                if (this.checked) {
                    timeSlots.classList.remove('hidden');
                } else {
                    timeSlots.classList.add('hidden');
                }
            });
        });
        
        // Setup event listeners for add time slot buttons
        availabilityContainer.querySelectorAll('.add-time-slot').forEach(button => {
            button.addEventListener('click', function() {
                const timeSlotsContainer = this.closest('.time-slots');
                addTimeSlotElement(timeSlotsContainer);
            });
        });
    }

    // --- User Profile Modal Functions ---
    
    // Initialize modal event listeners
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            userProfileModal.classList.add('hidden');
            userProfileModal.classList.remove('flex');
        });
    }
    
    // Function to view a user's profile
    async function viewUserProfile(userId, userRole, userName, userDistance) {
        console.log(`[viewUserProfile] Viewing profile for ${userRole} ${userName} (${userId})`);
        
        if (!userProfileModal) {
            console.error("[viewUserProfile] Modal element not found");
            return;
        }
        
        // Reset modal state
        modalUserName.textContent = userName || 'User';
        modalUserRole.textContent = userRole === 'owner' ? 'Pet Owner' : 'Dog Walker';
        modalUserDistance.textContent = `${userDistance} km away`;
        
        modalLoading.classList.remove('hidden');
        modalError.classList.add('hidden');
        modalWalkerContent.classList.add('hidden');
        modalOwnerContent.classList.add('hidden');
        
        // Show modal
        userProfileModal.classList.remove('hidden');
        userProfileModal.classList.add('flex');
        
        try {
            // Fetch user profile
            const { data: profileData, error: profileError } = await _supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
                
            if (profileError) {
                throw profileError;
            }
            
            // Fetch user auth data for email
            const { data: userData, error: userError } = await _supabase.auth.admin.getUserById(userId);
            const userEmail = userError ? 'Email not available' : (userData?.user?.email || 'Email not available');
            
            // Handle different user roles
            if (profileData.role === 'walker') {
                populateWalkerModal(profileData, userEmail);
            } else if (profileData.role === 'owner') {
                await populateOwnerModal(profileData, userEmail, userId);
            }
            
            modalLoading.classList.add('hidden');
            
        } catch (error) {
            console.error('[viewUserProfile] Error:', error);
            modalLoading.classList.add('hidden');
            modalError.classList.remove('hidden');
        }
    }
    
    // Populate walker profile modal
    function populateWalkerModal(profile, email) {
        // Get modal elements
        const walkerAbout = document.getElementById('modal-walker-about');
        const walkerExpYears = document.getElementById('modal-walker-experience-years');
        const walkerExpSummary = document.getElementById('modal-walker-experience-summary');
        const walkerEmail = document.getElementById('modal-walker-email');
        const walkerMobile = document.getElementById('modal-walker-mobile');
        const walkerAvailability = document.getElementById('modal-walker-availability');
        
        // Set content
        if (walkerAbout) walkerAbout.textContent = profile.about_me || 'No information provided';
        if (walkerExpYears) walkerExpYears.textContent = profile.experience_years ? `${profile.experience_years} years` : 'Not specified';
        if (walkerExpSummary) walkerExpSummary.textContent = profile.experience_summary || 'No experience summary provided';
        if (walkerEmail) walkerEmail.textContent = email;
        if (walkerMobile) walkerMobile.textContent = profile.mobile || 'Not provided';
        
        // Handle availability schedule
        if (walkerAvailability) {
            walkerAvailability.innerHTML = '';
            
            if (profile.availability_schedule) {
                try {
                    const schedule = typeof profile.availability_schedule === 'string' 
                        ? JSON.parse(profile.availability_schedule) 
                        : profile.availability_schedule;
                    
                    // Skip the "recurring" property
                    const days = Object.keys(schedule).filter(day => day !== 'recurring');
                    
                    if (days.length === 0) {
                        walkerAvailability.innerHTML = '<p class="text-gray-500 col-span-2">No availability information provided</p>';
                    } else {
                        days.forEach(day => {
                            const timeSlots = schedule[day];
                            const dayElement = document.createElement('div');
                            
                            let timesHtml = '';
                            timeSlots.forEach(slot => {
                                const [from, to] = slot.split('-');
                                timesHtml += `<div class="text-sm">${formatTimeDisplay(from)} - ${formatTimeDisplay(to)}</div>`;
                            });
                            
                            dayElement.innerHTML = `
                                <div class="mb-2">
                                    <div class="font-medium">${day}</div>
                                    ${timesHtml}
                                </div>
                            `;
                            
                            walkerAvailability.appendChild(dayElement);
                        });
                    }
                } catch (error) {
                    console.error('Error parsing availability schedule:', error);
                    walkerAvailability.innerHTML = '<p class="text-gray-500 col-span-2">Could not load availability information</p>';
                }
            } else {
                walkerAvailability.innerHTML = '<p class="text-gray-500 col-span-2">No availability information provided</p>';
            }
        }
        
        // Show walker content
        modalWalkerContent.classList.remove('hidden');
    }
    
    // Populate owner profile modal
    async function populateOwnerModal(profile, email, userId) {
        // Get modal elements
        const ownerEmail = document.getElementById('modal-owner-email');
        const ownerMobile = document.getElementById('modal-owner-mobile');
        const ownerAddress = document.getElementById('modal-owner-address');
        const ownerCommunication = document.getElementById('modal-owner-communication');
        const ownerNotes = document.getElementById('modal-owner-notes');
        const ownerDogs = document.getElementById('modal-owner-dogs');
        const noDogs = document.getElementById('modal-no-dogs');
        
        // Set content
        if (ownerEmail) ownerEmail.textContent = email;
        if (ownerMobile) ownerMobile.textContent = profile.mobile || 'Not provided';
        if (ownerAddress) ownerAddress.textContent = profile.address || 'Not provided';
        
        if (ownerCommunication) {
            ownerCommunication.textContent = profile.preferred_communication || 'Not specified';
        }
        
        if (ownerNotes) {
            ownerNotes.textContent = profile.owner_notes_for_walker || 'No notes provided';
        }
        
        // Fetch and display owner's dogs
        if (ownerDogs) {
            // Clear previous dogs
            ownerDogs.innerHTML = '';
            
            try {
                const { data: dogs, error } = await _supabase
                    .from('dogs')
                    .select('*')
                    .eq('owner_id', userId);
                
                if (error) {
                    throw error;
                }
                
                if (dogs && dogs.length > 0) {
                    if (noDogs) noDogs.classList.add('hidden');
                    
                    dogs.forEach(dog => {
                        const dogCard = document.createElement('div');
                        dogCard.className = 'border border-gray-200 rounded-lg p-4';
                        
                        dogCard.innerHTML = `
                            <h4 class="font-bold text-lg text-gray-800">${dog.name}</h4>
                            <div class="grid grid-cols-2 gap-2 mt-2 text-sm">
                                ${dog.breed ? `<div><span class="font-medium">Breed:</span> ${dog.breed}</div>` : ''}
                                ${dog.age ? `<div><span class="font-medium">Age:</span> ${dog.age} years</div>` : ''}
                                ${dog.gender ? `<div><span class="font-medium">Gender:</span> ${dog.gender}</div>` : ''}
                                ${dog.weight ? `<div><span class="font-medium">Weight:</span> ${dog.weight} kg</div>` : ''}
                            </div>
                            
                            ${dog.temperament && dog.temperament.length > 0 ? 
                                `<div class="mt-2 text-sm"><span class="font-medium">Temperament:</span> ${Array.isArray(dog.temperament) ? dog.temperament.join(', ') : dog.temperament}</div>` : ''}
                            
                            ${dog.special_needs ? `<div class="mt-2 text-sm"><span class="font-medium">Special Needs:</span> ${dog.special_needs}</div>` : ''}
                            ${dog.vet_contact ? `<div class="mt-2 text-sm"><span class="font-medium">Vet Contact:</span> ${dog.vet_contact}</div>` : ''}
                            ${dog.preferred_route ? `<div class="mt-2 text-sm"><span class="font-medium">Preferred Route:</span> ${dog.preferred_route}</div>` : ''}
                        `;
                        
                        ownerDogs.appendChild(dogCard);
                    });
                } else {
                    if (noDogs) noDogs.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Error fetching dogs:', error);
                ownerDogs.innerHTML = `<p class="text-red-500">Could not load dog information</p>`;
            }
        }
        
        // Show owner content
        modalOwnerContent.classList.remove('hidden');
    }

}); // End DOMContentLoaded