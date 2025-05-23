// Profile/Dashboard functionality for Pawsitive Strides
// Uses RPC function for finding nearby users.
const MAPS_SCRIPT_ID = 'google-maps-api-script'; // ID to check if script exists
let mapsApiLoading = false; // Flag to prevent multiple loads

/**
 * Sanitizes strings to prevent XSS attacks
 * @param {string} unsafeText - Text that might contain malicious content
 * @return {string} - Sanitized text with HTML entities escaped
 */
function sanitizeHTML(unsafeText) {
    if (typeof unsafeText !== 'string') {
        return '';
    }
    
    const div = document.createElement('div');
    div.textContent = unsafeText;
    return div.innerHTML;
}

/**
 * Creates a DOM element with sanitized content
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - Key-value pairs of attributes
 * @param {string|Node|Array} content - Text content, DOM node, or array of nodes
 * @return {HTMLElement} - The created element
 */
function createSafeElement(tag, attributes = {}, content = null) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Add content
    if (content !== null) {
        if (typeof content === 'string') {
            element.textContent = content;
        } else if (content instanceof Node) {
            element.appendChild(content);
        } else if (Array.isArray(content)) {
            content.forEach(item => {
                if (item instanceof Node) {
                    element.appendChild(item);
                } else if (typeof item === 'string') {
                    element.appendChild(document.createTextNode(item));
                }
            });
        }
    }
    
    return element;
}

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
        // Use whenGoogleMapsReady to ensure the API objects are available
        whenGoogleMapsReady(() => {
            // This inner code block now runs ONLY after the Google Maps script is loaded and initMap has run
            console.log(">>> START initializeMapRelatedFeatures (Execution via whenGoogleMapsReady)");
    
            // Check if already initialized (prevents running core logic multiple times)
            if (mapInitialized) {
                console.log("    Map features already initialized. Exiting actual setup.");
                // If map section is active, ensure data is loaded even if initialized before
                if (mapSection?.classList.contains('active') && mainMap && !mapDataLoaded) {
                     console.log('    Map section active, map initialized, ensuring data load.');
                     loadMapData();
                }
                return;
            }
    
            // Defensive check (optional, as whenGoogleMapsReady implies readiness)
            if (!checkMapsApiLoaded()) {
                console.error("    !!! Google Maps API objects still not ready inside callback? This shouldn't happen.");
                profileLoadErrorDiv.textContent = 'Failed to load map services components after script load.';
                profileLoadErrorDiv.classList.remove('hidden');
                return;
            }
    
            try {
                console.log("    Initializing Geocoder...");
                geocoder = new google.maps.Geocoder();
                console.log('    Geocoder initialized.');
    
                console.log("    Initializing Autocomplete...");
                initAutocomplete(); // Assumes this needs google.maps.places
                console.log("    Autocomplete initialization attempted.");
    
                console.log("    Initializing Main Map...");
                const mapContainer = document.getElementById('map-container'); // Ensure mapContainer is accessible here
                if (!mapContainer) {
                    console.error("    !!! Main map container element (#map-container) not found.");
                     profileLoadErrorDiv.textContent = 'Map container element not found.';
                     profileLoadErrorDiv.classList.remove('hidden');
                } else {
                     // Clear any previous error/loading message
                     mapContainer.innerHTML = ''; // Clear placeholder/error messages
                     mainMap = new google.maps.Map(mapContainer, {
                        center: INDIA_CENTER, // Constants like INDIA_CENTER need to be defined/accessible
                        zoom: DEFAULT_ZOOM,
                        mapId: '8a23b4bdd9ef4f8c', // Consider making this dynamic if needed
                        mapTypeControl: false,
                        streetViewControl: false
                     });
                     console.log('    Main map view initialized.');
                }
    
                console.log("    Setting mapInitialized = true");
                mapInitialized = true; // Mark core services as ready
    
                // Check if map section is active and load data if needed NOW
                const mapSection = document.getElementById('map-section'); // Ensure mapSection is accessible
                if (mapSection?.classList.contains('active') && !mapDataLoaded) {
                    if (mainMap) {
                        console.log('    Main map section is active, calling loadMapData.');
                        loadMapData();
                    } else {
                        console.warn('    Main map section is active, but mainMap instance is null.');
                        if (mapContainer) { mapContainer.innerHTML = '<p class="map-loading-message text-red-500 p-4">Error: Map could not be initialized.</p>'; }
                    }
                }
                console.log("<<< SUCCESS initializeMapRelatedFeatures (Execution via whenGoogleMapsReady)");
    
            } catch (error) {
                console.error('    !!! Error during initializeMapRelatedFeatures execution:', error);
                mapInitialized = false; // Reset flag
                profileLoadErrorDiv.textContent = 'Error setting up map features: ' + error.message;
                profileLoadErrorDiv.classList.remove('hidden');
                const mapContainer = document.getElementById('map-container');
                if (mapContainer) { mapContainer.innerHTML = `<p class="map-loading-message text-red-600 p-4">Error initializing map: ${error.message}</p>`; }
                console.log("<<< FAILED initializeMapRelatedFeatures (Execution via whenGoogleMapsReady)");
            }
        }); // End of whenGoogleMapsReady wrapper
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
        if (!dogs || dogs.length === 0) { 
            noDogsMessage.style.display = 'block'; 
            dogListDiv.innerHTML = ''; 
            return; 
        }
        
        noDogsMessage.style.display = 'none';
        dogListDiv.innerHTML = '';
        
        dogs.forEach(dog => {
            const dogCard = document.createElement('div');
            dogCard.className = 'dog-card';
            
            // Create card header
            const dogName = createSafeElement('h4', {}, dog.name);
            dogCard.appendChild(dogName);
            
            // Create details grid
            const detailsGrid = createSafeElement('div', {
                className: 'grid grid-cols-2 gap-2 text-sm'
            });
            
            // Add dog details safely
            if (dog.breed) {
                const breedDiv = createSafeElement('div', {}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Breed: '),
                    document.createTextNode(dog.breed)
                ]);
                detailsGrid.appendChild(breedDiv);
            }
            
            if (dog.age) {
                const ageDiv = createSafeElement('div', {}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Age: '),
                    document.createTextNode(`${dog.age} years`)
                ]);
                detailsGrid.appendChild(ageDiv);
            }
            
            if (dog.gender) {
                const genderDiv = createSafeElement('div', {}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Gender: '),
                    document.createTextNode(dog.gender)
                ]);
                detailsGrid.appendChild(genderDiv);
            }
            
            if (dog.weight) {
                const weightDiv = createSafeElement('div', {}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Weight: '),
                    document.createTextNode(`${dog.weight} kg`)
                ]);
                detailsGrid.appendChild(weightDiv);
            }
            
            dogCard.appendChild(detailsGrid);
            
            // Add temperament if available
            if (dog.temperament && dog.temperament.length > 0) {
                const tempDiv = createSafeElement('div', {className: 'mt-2 text-sm'}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Temperament: '),
                    document.createTextNode(Array.isArray(dog.temperament) ? dog.temperament.join(', ') : dog.temperament)
                ]);
                dogCard.appendChild(tempDiv);
            }
            
            // Add other details
            if (dog.special_needs) {
                const needsDiv = createSafeElement('div', {className: 'mt-2 text-sm'}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Special Needs: '),
                    document.createTextNode(dog.special_needs)
                ]);
                dogCard.appendChild(needsDiv);
            }
            
            if (dog.vet_contact) {
                const vetDiv = createSafeElement('div', {className: 'mt-2 text-sm'}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Vet Contact: '),
                    document.createTextNode(dog.vet_contact)
                ]);
                dogCard.appendChild(vetDiv);
            }
            
            if (dog.preferred_route) {
                const routeDiv = createSafeElement('div', {className: 'mt-2 text-sm'}, [
                    createSafeElement('span', {className: 'font-medium'}, 'Preferred Route: '),
                    document.createTextNode(dog.preferred_route)
                ]);
                dogCard.appendChild(routeDiv);
            }
            
            // Add remove button
            const actionDiv = createSafeElement('div', {
                className: 'mt-3 pt-2 border-t border-gray-100 text-right'
            });
            
            const removeButton = createSafeElement('button', {
                className: 'text-red-500 hover:text-red-700 text-sm font-medium remove-dog',
                'data-dog-id': dog.id
            }, 'Remove');
            
            actionDiv.appendChild(removeButton);
            dogCard.appendChild(actionDiv);
            
            dogListDiv.appendChild(dogCard);
        });
        
        dogListDiv.querySelectorAll('.remove-dog').forEach(button => 
            button.addEventListener('click', handleRemoveDogClick));
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

    // --- Map View Functions with XSS Protection ---

    function initPickerMap() {
        if (!mapInitialized || !geocoder) { 
            console.warn("Cannot init picker map yet: Map services not ready."); 
            if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = "Map services loading..."; 
            return; 
        }
        
        if(!pickerMapContainer) { 
            console.error("Picker map container not found."); 
            return; 
        }
        
        pickerMapContainer.classList.remove('hidden');
        
        // Clear loading message safely
        while (pickerMapContainer.firstChild) {
            pickerMapContainer.removeChild(pickerMapContainer.firstChild);
        }
        
        let initialPosition = INDIA_CENTER; 
        let initialZoom = DEFAULT_ZOOM;
        
        if (selectedLocation) { 
            initialPosition = { lat: selectedLocation.lat, lng: selectedLocation.lng }; 
            initialZoom = DETAIL_ZOOM; 
        } else if (userProfile?.latitude && userProfile?.longitude) { 
            initialPosition = { lat: userProfile.latitude, lng: userProfile.longitude }; 
            initialZoom = DETAIL_ZOOM; 
        }
        
        console.log("[initPickerMap] Initial position:", initialPosition, "Zoom:", initialZoom);
        
        try {
            if (!pickerMap) { 
                pickerMap = new google.maps.Map(pickerMapContainer, { 
                    center: initialPosition, 
                    zoom: initialZoom, 
                    mapTypeControl: false, 
                    streetViewControl: false, 
                    fullscreenControl: false 
                }); 
            } else { 
                pickerMap.setCenter(initialPosition); 
                pickerMap.setZoom(initialZoom); 
            }
            
            if (!pickerMarker) { 
                pickerMarker = new google.maps.Marker({ 
                    position: initialPosition, 
                    map: pickerMap, 
                    draggable: true, 
                    title: "Drag me!" 
                }); 
                pickerMarker.addListener('dragend', handleMarkerDragEnd); 
            } else { 
                pickerMarker.setPosition(initialPosition); 
                pickerMarker.setMap(pickerMap); 
            }
            
            if(reverseGeocodeResultDiv) reverseGeocodeResultDiv.textContent = 'Drag the marker to set location.';
        } catch (error) { 
            console.error("Error creating picker map/marker:", error); 
            
            // Create error message safely
            const errorParagraph = document.createElement('p');
            errorParagraph.className = 'text-red-500 p-4';
            errorParagraph.textContent = `Error loading map: ${error.message}`;
            pickerMapContainer.appendChild(errorParagraph);
        }
    }

    function handleMarkerDragEnd(event) {
        if (!event?.latLng) return;
        const lat = event.latLng.lat(); 
        const lng = event.latLng.lng();
        console.log(`[handleMarkerDragEnd] Marker dragged to: Lat: ${lat}, Lng: ${lng}`);
        
        if(reverseGeocodeResultDiv) {
            reverseGeocodeResultDiv.textContent = 'Finding address...';
        }
        
        reverseGeocodeLatLng(event.latLng);
    }

    function reverseGeocodeLatLng(latLng) {
        if (!geocoder) { 
            console.error("Geocoder not available for reverse geocoding."); 
            if(reverseGeocodeResultDiv) {
                reverseGeocodeResultDiv.textContent = 'Error: Geocoding service not ready.';
            }
            return; 
        }
        
        console.log("[reverseGeocodeLatLng] Requesting address for:", latLng.toString());
        geocoder.geocode({ 'location': latLng }, (results, status) => {
            console.log(`[reverseGeocodeLatLng] Status: ${status}`, results);
            if (status === 'OK') {
                if (results?.[0]) { // Use optional chaining for safety
                    const addressString = results[0].formatted_address; 
                    console.log(`[reverseGeocodeLatLng] Found address: ${addressString}`);
                    
                    // Safely set address in form
                    if(profileAddressInput) {
                        profileAddressInput.value = addressString;
                    }
                    
                    // Store location with sanitized address
                    selectedLocation = { 
                        lat: latLng.lat(), 
                        lng: latLng.lng(), 
                        address: addressString // Address is already sanitized from Google API
                    };
                    
                    // Set result message
                    if(reverseGeocodeResultDiv) {
                        reverseGeocodeResultDiv.textContent = `Location set: ${addressString.substring(0, 50)}...`;
                    }
                    
                    if(profileMessage) {
                        profileMessage.textContent = '';
                    }
                    
                    console.log("[reverseGeocodeLatLng] Stored selected location:", selectedLocation);
                } else { 
                    console.warn('[reverseGeocodeLatLng] No results found.'); 
                    if(reverseGeocodeResultDiv) {
                        reverseGeocodeResultDiv.textContent = 'Could not find address.';
                    }
                    selectedLocation = null; 
                }
            } else { 
                console.error(`[reverseGeocodeLatLng] Geocoder failed: ${status}`); 
                if(reverseGeocodeResultDiv) {
                    reverseGeocodeResultDiv.textContent = `Error finding address: ${status}`;
                }
                selectedLocation = null; 
            }
        });
    }

    // --- Main Map View Functions ---

    async function loadMapData() {
        console.log("[loadMapData] Loading data for main map view.");
        if (!mapInitialized || !mainMap) {
            console.log("Skipping map data load - main map services not ready.");
            if (mapContainer) {
                let loadingMsg = mapContainer.querySelector('.map-loading-message');
                if (!loadingMsg) { 
                    loadingMsg = document.createElement('p'); 
                    loadingMsg.className = 'map-loading-message'; 
                    mapContainer.prepend(loadingMsg); 
                }
                loadingMsg.textContent = 'Map services loading... Please wait.'; 
                loadingMsg.style.display = 'block';
            }
            return;
        }

        let loadingMsg = mapContainer.querySelector('.map-loading-message');
        if(!loadingMsg) { 
            console.warn("Map loading msg missing, creating."); 
            loadingMsg = document.createElement('p'); 
            loadingMsg.className = 'map-loading-message'; 
            mapContainer.prepend(loadingMsg); 
        }
        loadingMsg.textContent = 'Loading your location...'; 
        loadingMsg.style.display = 'block';
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
                userMarker = new google.maps.Marker({ 
                    position: userCoords, 
                    map: mainMap, 
                    title: 'Your Location', 
                    icon: { 
                        path: google.maps.SymbolPath.CIRCLE, 
                        scale: 10, 
                        fillColor: '#8B5CF6', 
                        fillOpacity: 1, 
                        strokeColor: '#ffffff', 
                        strokeWeight: 2 
                    }, 
                    zIndex: 100 
                });
                bounds.extend(userCoords);
                loadingMsg.textContent = `Finding nearby ${userProfile.role === 'owner' ? 'walkers' : 'owners'}...`;
            } catch (markerError) { 
                console.error("Error creating user marker:", markerError); 
                loadingMsg.textContent = 'Error displaying your location.'; 
            }
        } else {
            console.warn("[loadMapData] No coordinates for user. Update profile to see nearby users.");
            loadingMsg.textContent = 'Your location not set. Update profile to see nearby users.'; 
            loadingMsg.style.display = 'block';
            mainMap.setCenter(INDIA_CENTER); 
            mainMap.setZoom(DEFAULT_ZOOM);
            mapDataLoaded = true; 
            return;
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
            const infowindow = new google.maps.InfoWindow(); 
            let plottedCount = 0;
            
            if (nearbyUsers?.length > 0) {
                nearbyUsers.forEach(user => {
                    if (typeof user.latitude === 'number' && typeof user.longitude === 'number') {
                        const otherCoords = { lat: user.latitude, lng: user.longitude };
                        try {
                            const marker = new google.maps.Marker({ 
                                position: otherCoords, 
                                map: mainMap, 
                                title: sanitizeHTML(user.full_name || 'User'), 
                                icon: { 
                                    path: google.maps.SymbolPath.CIRCLE, 
                                    scale: 8, 
                                    fillColor: targetRole === 'walker' ? '#10B981' : '#F59E0B', 
                                    fillOpacity: 1, 
                                    strokeColor: '#ffffff', 
                                    strokeWeight: 2 
                                } 
                            });
                            
                            otherUserMarkers.push(marker); 
                            bounds.extend(otherCoords); 
                            plottedCount++;
                            
                            marker.addListener('click', () => { 
                                // Create infowindow content safely using DOM methods
                                const infoDiv = document.createElement('div');
                                infoDiv.className = 'p-2';
                                
                                // Add user name
                                const nameElement = document.createElement('strong');
                                nameElement.textContent = user.full_name || 'N/A';
                                infoDiv.appendChild(nameElement);
                                infoDiv.appendChild(document.createElement('br'));
                                
                                // Add role text
                                const roleText = document.createTextNode(
                                    user.role === 'owner' ? 'Pet Owner' : 'Dog Walker'
                                );
                                infoDiv.appendChild(roleText);
                                infoDiv.appendChild(document.createElement('br'));
                                
                                // Add distance
                                const distanceElement = document.createElement('small');
                                distanceElement.textContent = `Approx. ${user.distance_km?.toFixed(1) ?? '?'} km away`;
                                infoDiv.appendChild(distanceElement);
                                
                                // Add button div
                                const buttonDiv = document.createElement('div');
                                buttonDiv.className = 'mt-2';
                                
                                // Create view profile button
                                const viewButton = document.createElement('button');
                                viewButton.className = 'view-profile-btn bg-purple-600 text-white text-xs px-3 py-1 rounded hover:bg-purple-700';
                                viewButton.textContent = 'View Profile';
                                viewButton.dataset.userId = user.id;
                                viewButton.dataset.userRole = user.role;
                                viewButton.dataset.userName = user.full_name || 'User';
                                viewButton.dataset.userDistance = user.distance_km?.toFixed(1) || '?';
                                
                                buttonDiv.appendChild(viewButton);
                                infoDiv.appendChild(buttonDiv);
                                
                                // Set content and open
                                infowindow.setContent(infoDiv);
                                infowindow.open(mainMap, marker);
                                
                                // Add event listener after infowindow is opened
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
                        } catch(markerError) { 
                            console.error(`Error creating marker for ${sanitizeHTML(user.full_name || 'User')}:`, markerError); 
                        }
                    } else { 
                        console.warn(`[loadMapData] User ${user.id} missing coordinates.`); 
                    }
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
            loadingMsg.style.display = 'block'; 
            mapDataLoaded = true;
        }
    }

    async function handleOwnerDetailsUpdate(event) {
        event.preventDefault(); // Prevent default form submission
    
        // Get the message element (ensure ownerDetailsMessage is accessible)
        const ownerDetailsMessage = document.querySelector('#owner-profile-content .owner-details-message'); // Adjust selector if needed
        if (ownerDetailsMessage) {
            ownerDetailsMessage.textContent = 'Updating owner details...';
            ownerDetailsMessage.style.color = 'inherit';
        }
    
        console.log("Owner details form submitted. (Implementation pending)");
    
        // --- Add your actual logic here ---
        // 1. Ensure ownerDetailsForm is accessible (get it via ID if needed)
        //    const ownerDetailsForm = document.getElementById('owner-details-form');
        // 2. Get form data: const formData = new FormData(ownerDetailsForm);
        // 3. Construct the 'updates' object for Supabase:
        //    const updates = {
        //        emergency_contact_name: formData.get('emergency_contact_name')?.trim() || null,
        //        emergency_contact_phone: formData.get('emergency_contact_phone')?.trim() || null,
        //        preferred_communication: formData.get('preferred_communication') || null,
        //        owner_notes_for_walker: formData.get('owner_notes_for_walker')?.trim() || null,
        //        updated_at: new Date()
        //    };
        // 4. Ensure currentUser is accessible (it should be from initDashboard scope)
        // 5. Call Supabase update:
        //    const { data: updatedProfile, error } = await _supabase
        //        .from('profiles')
        //        .update(updates)
        //        .eq('id', currentUser.id)
        //        .select('*') // Select necessary fields
        //        .single();
        // 6. Handle success (update message, potentially update userProfile variable)
        // 7. Handle error (update message)
        // ----------------------------------
    
        // Temporary placeholder message:
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
        if (ownerDetailsMessage) {
            ownerDetailsMessage.textContent = 'Owner details updated successfully (placeholder).';
            ownerDetailsMessage.style.color = 'green';
        }
    }

    async function handleWalkerDetailsUpdate(event) {
        event.preventDefault(); // Prevent default form submission
    
        // Get the message element (ensure walkerMessage is defined/accessible)
        const walkerMessage = document.querySelector('#walker-profile-content .walker-message'); // Or get it via a more reliable selector/variable
        if (walkerMessage) {
             walkerMessage.textContent = 'Updating walker details...';
             walkerMessage.style.color = 'inherit';
        }
        console.log("Walker details form submitted. (Implementation pending)");
    
        // --- Add your actual logic here later ---
        // 1. Get walkerDetailsForm data (new FormData(walkerDetailsForm))
        // 2. Collect availability data using collectAvailabilityData()
        // 3. Construct the 'updates' object for Supabase
        // 4. Call _supabase.from('profiles').update(...)
        // 5. Handle success/error and update walkerMessage
        // -----------------------------------------
    
        // Temporary message:
         await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
         if (walkerMessage) {
             walkerMessage.textContent = 'Walker update successful (placeholder).';
             walkerMessage.style.color = 'green';
         }
    }

    // Function to fetch key and load the Google Maps script
    async function loadGoogleMapsApiKeyAndScript() {
        // Check if script already exists or is loading
        if (document.getElementById(MAPS_SCRIPT_ID) || mapsApiLoading) {
            console.log("Google Maps script already loaded or loading.");
            if(window.googleMapsApiReady) {
                // Ensure features init if API is ready but script load was already triggered
                whenGoogleMapsReady(initializeMapRelatedFeatures);
            }
            return; // Exit if already handled
        }

        mapsApiLoading = true; // Set loading flag
        console.log("Attempting to load Google Maps API Key and Script...");
        // Find map container early to show loading/error states
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            let loadingMsg = mapContainer.querySelector('.map-loading-message');
            if (!loadingMsg) {
                loadingMsg = document.createElement('p');
                loadingMsg.className = 'map-loading-message text-gray-600 p-4';
                
                // Clear previous content safely
                while (mapContainer.firstChild) {
                    mapContainer.removeChild(mapContainer.firstChild);
                }
                
                mapContainer.appendChild(loadingMsg);
            }
            loadingMsg.textContent = 'Fetching map configuration...';
        }

        try {
            // Get the current session to obtain the JWT (Authorization token)
            const sessionResponse = await _supabase.auth.getSession(); // _supabase comes from common.js
            const session = sessionResponse.data.session;

            if (!session?.access_token) {
                // Handle case where user isn't logged in properly before calling this
                throw new Error("Authentication Error: No active session found. Cannot fetch API key.");
            }

            // Construct the URL to your deployed function
            // Use SUPABASE_URL from common.js if available, otherwise hardcode temporarily
            const supabaseUrl = window.pawsitiveCommon?.SUPABASE_URL || "https://btaoqcoxxpwegsotjdgh.supabase.co"; // Get base URL
            const functionUrl = `${supabaseUrl}/functions/v1/get-maps-key`;
            console.log(`Fetching API key from: ${functionUrl}`);

            // Make the authenticated request to your function
            const response = await fetch(functionUrl, {
                method: 'POST', // Functions usually default to POST/GET, check logs if needed
                headers: {
                    // Crucial: Send the user's JWT to authenticate the request
                    'Authorization': `Bearer ${session.access_token}`,
                    // You might need the anon key depending on function security settings, often good practice
                    'apikey': window.pawsitiveCommon?.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY" // Get from common.js
                    // 'Content-Type': 'application/json' // Add if sending a body
                },
                // body: JSON.stringify({}) // Add empty body if POST requires it, or remove if using GET
            });

            if (!response.ok) {
                // Try to get error details from the function's response
                let errorMsg = `Failed to fetch API key: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg += ` - ${errorData.error || 'Unknown function error'}`;
                } catch (e) { /* Ignore parsing error if response wasn't JSON */ }
                throw new Error(errorMsg);
            }

            // Parse the JSON response to get the API key
            const data = await response.json();
            const apiKey = data.apiKey; // Matches the JSON key returned by the function

            if (!apiKey) {
                throw new Error('API key not received from backend function.');
            }

            console.log("API Key received successfully from backend.");
            if (mapContainer) mapContainer.querySelector('.map-loading-message')?.remove(); // Remove loading message

            // Set up script tag with proper error handling and sanitization
            const script = document.createElement('script');
            script.id = MAPS_SCRIPT_ID;
            
            // Sanitize the API key (ensure it's a string and contains no unexpected characters)
            if (typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(apiKey)) {
                throw new Error('Invalid API key format received from server');
            }
            
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=marker,geometry,places&v=beta`;
            script.async = true;
            script.defer = true;
            
            script.onerror = () => {
                console.error("!!! Google Maps script failed to load.");
                mapsApiLoading = false;
                const scriptElement = document.getElementById(MAPS_SCRIPT_ID);
                if (scriptElement) scriptElement.remove();
                
                if (mapContainer) {
                    // Clear and create error message safely
                    while (mapContainer.firstChild) {
                        mapContainer.removeChild(mapContainer.firstChild);
                    }
                    
                    const errorMsg = document.createElement('p');
                    errorMsg.className = 'map-loading-message text-red-600 p-4';
                    errorMsg.textContent = 'Error: Could not load Google Maps script.';
                    mapContainer.appendChild(errorMsg);
                }
            };

            document.head.appendChild(script);
            console.log("Google Maps script tag dynamically appended to head.");

        } catch (error) {
            console.error('Error loading Google Maps API key/script:', error);
            mapsApiLoading = false;
            
            if (mapContainer) {
                // Clear and create error message safely
                while (mapContainer.firstChild) {
                    mapContainer.removeChild(mapContainer.firstChild);
                }
                
                const errorMsg = document.createElement('p');
                errorMsg.className = 'map-loading-message text-red-600 p-4';
                errorMsg.textContent = `Error loading map services: ${error.message}`;
                mapContainer.appendChild(errorMsg);
            }
        }
    }

    // --- Initialize Dashboard with XSS Protection ---
    async function initDashboard() {
        console.log(">>> START initDashboard (profile.js)");
        
        // Define DOM elements needed early
        const loadingState = document.getElementById('loading-state');
        const mainContent = document.getElementById('main-content');
        const profileLoadErrorDiv = document.getElementById('profile-load-error');
        const userEmailDisplay = document.getElementById('user-email');
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        const contentSections = document.querySelectorAll('.content-section');
        const ownerContent = document.getElementById('owner-profile-content');
        const walkerContent = document.getElementById('walker-profile-content');
        const mapTitleRole = document.getElementById('map-title-role');
        const mapDescriptionRole = document.getElementById('map-description-role');
        const profileForm = document.getElementById('profile-form');
        const pinLocationButton = document.getElementById('pin-location-btn');
        const addDogForm = ownerContent?.querySelector('#add-dog-form');
        const ownerDetailsForm = ownerContent?.querySelector('#owner-details-form');
        const walkerDetailsForm = walkerContent?.querySelector('#walker-details-form');
        const pickerMapContainer = document.getElementById('picker-map-container');
        
        try {
            // --- Supabase Auth Check ---
            console.log('Supabase Initialized Check (Dashboard)');
            const currentUser = await pawsitiveCommon.requireAuth(_supabase);
            if (!currentUser) {
                console.log("User not authenticated, stopping dashboard init.");
                return;
            }
            pawsitiveCommon.setupLogout(_supabase);
            
            // --- Sidebar Navigation Listener ---
            sidebarLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetSectionId = link.dataset.section;
                    
                    // Update UI immediately
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                    contentSections.forEach(section => section.classList.remove('active'));
                    
                    const targetSection = document.getElementById(targetSectionId);
                    if (targetSection) {
                        targetSection.classList.add('active');
                    } else {
                        console.error(`Target section #${targetSectionId} not found!`);
                        return;
                    }
                    
                    // Map-specific handling
                    if (targetSectionId === 'map-section') {
                        console.log("Map section activated via click.");
                        if (window.googleMapsApiReady && mapInitialized && !mapDataLoaded) {
                            console.log("Map script ready, map initialized, loading map data on tab click.");
                            loadMapData();
                        } else if (window.googleMapsApiReady && !mapInitialized) {
                            console.log("Map script ready, but features not initialized yet. Queueing init.");
                            initializeMapRelatedFeatures();
                        } else if (!window.googleMapsApiReady) {
                            console.log("Map section clicked, but API script is still loading/pending.");
                            const mapContainer = document.getElementById('map-container');
                            if (mapContainer && !mapContainer.querySelector('.map-loading-message')) {
                                // Create loading message safely
                                const loadingMsg = document.createElement('p');
                                loadingMsg.className = 'map-loading-message text-gray-600 p-4';
                                loadingMsg.textContent = 'Loading map services...';
                                
                                // Clear container safely
                                while (mapContainer.firstChild) {
                                    mapContainer.removeChild(mapContainer.firstChild);
                                }
                                
                                mapContainer.appendChild(loadingMsg);
                            }
                        } else {
                            console.log("Map data likely already loaded or map not initialized.");
                        }
                        
                        // Hide picker if it was open
                        if (pickerMapContainer) pickerMapContainer.classList.add('hidden');
                        if (pickerMarker) pickerMarker.setMap(null);
                    } else {
                        // Hide picker map if navigating away from profile section
                        if (targetSectionId !== 'profile-section') {
                            if (pickerMapContainer) pickerMapContainer.classList.add('hidden');
                            if (pickerMarker) pickerMarker.setMap(null);
                        }
                    }
                });
            });
            
            // --- Display User Email Safely ---
            if (userEmailDisplay && currentUser.email) {
                userEmailDisplay.textContent = currentUser.email;
            }
            
            // --- Fetch Profile ---
            userProfile = await fetchUserProfile(currentUser.id);
            if (!userProfile) {
                // Error handled within fetchUserProfile
                if (loadingState) loadingState.style.display = 'none';
                if (mainContent) mainContent.classList.add('hidden');
                return;
            }
            
            // --- Initiate map script loading ---
            console.log("    Initiating map API key fetch and script loading...");
            loadGoogleMapsApiKeyAndScript();
            
            // --- Setup Role-Specific UI ---
            if (userProfile.role === 'owner') {
                if (ownerContent) ownerContent.classList.remove('hidden');
                if (mapTitleRole) mapTitleRole.textContent = 'Dog Walkers';
                if (mapDescriptionRole) mapDescriptionRole.textContent = 'dog walkers';
                
                // Fetch and display dogs
                const dogs = await fetchUserDogs(currentUser.id);
                displayDogs(dogs);
                
                // Add event listeners for owner forms
                if (addDogForm) addDogForm.addEventListener('submit', handleAddDog);
                if (ownerDetailsForm) ownerDetailsForm.addEventListener('submit', handleOwnerDetailsUpdate);
                
            } else if (userProfile.role === 'walker') {
                if (walkerContent) walkerContent.classList.remove('hidden');
                if (mapTitleRole) mapTitleRole.textContent = 'Pet Owners';
                if (mapDescriptionRole) mapDescriptionRole.textContent = 'pet owners';
                
                // Add event listener for walker form
                if (walkerDetailsForm) walkerDetailsForm.addEventListener('submit', handleWalkerDetailsUpdate);
            }
            
            // Populate profile form
            populateProfileForm(userProfile);
            
            // Add event listeners
            if (profileForm) profileForm.addEventListener('submit', handleProfileUpdate);
            if (pinLocationButton) pinLocationButton.addEventListener('click', initPickerMap);
            
            // Show content
            if (loadingState) loadingState.style.display = 'none';
            if (mainContent) mainContent.classList.remove('hidden');
            
            console.log("<<< END initDashboard (profile.js) - Basic setup complete, map script loading initiated.");
            
        } catch (error) {
            console.error('Error initializing dashboard:', error);
            
            // Handle loading state
            if (loadingState) loadingState.style.display = 'none';
            
            // Show error message safely
            if (profileLoadErrorDiv) {
                profileLoadErrorDiv.textContent = 'Fatal Error loading dashboard: ' + error.message;
                profileLoadErrorDiv.classList.remove('hidden');
            }
            
            // Hide main content
            if (mainContent) mainContent.classList.add('hidden');
        }
    }

    // --- Error Handling for Async Functions ---
    function showProfileError(messageElement, errorMessage) {
        if (!messageElement) return;
        
        // Sanitize and display error message
        messageElement.textContent = errorMessage || 'An error occurred';
        messageElement.style.color = 'red';
    }

    function showProfileSuccess(messageElement, successMessage) {
        if (!messageElement) return;
        
        // Set success message safely
        messageElement.textContent = successMessage || 'Operation successful';
        messageElement.style.color = 'green';
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
        
        // Create from time select
        const fromSelect = document.createElement('select');
        fromSelect.className = 'time-from input-field focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm';
        
        // Add default option
        const fromDefaultOption = document.createElement('option');
        fromDefaultOption.value = '';
        fromDefaultOption.textContent = 'From';
        fromSelect.appendChild(fromDefaultOption);
        
        // Create to time select
        const toSelect = document.createElement('select');
        toSelect.className = 'time-to input-field focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm';
        
        // Add default option
        const toDefaultOption = document.createElement('option');
        toDefaultOption.value = '';
        toDefaultOption.textContent = 'To';
        toSelect.appendChild(toDefaultOption);
        
        // Add "to" text between selects
        const toSpan = document.createElement('span');
        toSpan.textContent = 'to';
        
        // Create add button
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'add-time-slot text-sm text-purple-600 hover:text-purple-800';
        addButton.textContent = '+ Add';
        
        // Add elements to slot div
        slotDiv.appendChild(fromSelect);
        slotDiv.appendChild(toSpan);
        slotDiv.appendChild(toSelect);
        slotDiv.appendChild(addButton);
        
        // Add remove button if needed
        if (fromValue) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-time-slot text-sm text-red-600 hover:text-red-800 ml-2';
            removeButton.textContent = '× Remove';
            slotDiv.appendChild(removeButton);
            
            // Add remove event listener
            removeButton.addEventListener('click', () => {
                container.removeChild(slotDiv);
            });
        }
        
        container.appendChild(slotDiv);
        
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
        
        // Add event listener for add button
        addButton.addEventListener('click', () => {
            addTimeSlotElement(container);
        });
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
        console.log(`[viewUserProfile] Viewing profile for ${sanitizeHTML(userRole)} ${sanitizeHTML(userName)} (${userId})`);
        
        if (!userProfileModal) {
            console.error("[viewUserProfile] Modal element not found");
            return;
        }
        
        // Reset modal state - use textContent to safely set content
        if (modalUserName) modalUserName.textContent = userName || 'User';
        if (modalUserRole) modalUserRole.textContent = userRole === 'owner' ? 'Pet Owner' : 'Dog Walker';
        if (modalUserDistance) modalUserDistance.textContent = `${userDistance} km away`;
        
        if (modalLoading) modalLoading.classList.remove('hidden');
        if (modalError) modalError.classList.add('hidden');
        if (modalWalkerContent) modalWalkerContent.classList.add('hidden');
        if (modalOwnerContent) modalOwnerContent.classList.add('hidden');
        
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
            
            if (modalLoading) modalLoading.classList.add('hidden');
            
        } catch (error) {
            console.error('[viewUserProfile] Error:', error);
            if (modalLoading) modalLoading.classList.add('hidden');
            if (modalError) modalError.classList.remove('hidden');
            
            // Set error message safely
            const errorMessageEl = modalError.querySelector('.error-message');
            if (errorMessageEl) {
                errorMessageEl.textContent = `Error loading profile: ${error.message}`;
            }
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
        
        // Set content safely using textContent
        if (walkerAbout) walkerAbout.textContent = profile.about_me || 'No information provided';
        if (walkerExpYears) walkerExpYears.textContent = profile.experience_years ? `${profile.experience_years} years` : 'Not specified';
        if (walkerExpSummary) walkerExpSummary.textContent = profile.experience_summary || 'No experience summary provided';
        if (walkerEmail) walkerEmail.textContent = email;
        if (walkerMobile) walkerMobile.textContent = profile.mobile || 'Not provided';
        
        // Handle availability schedule safely
        if (walkerAvailability) {
            // Clear previous content safely
            while (walkerAvailability.firstChild) {
                walkerAvailability.removeChild(walkerAvailability.firstChild);
            }
            
            if (profile.availability_schedule) {
                try {
                    const schedule = typeof profile.availability_schedule === 'string' 
                        ? JSON.parse(profile.availability_schedule) 
                        : profile.availability_schedule;
                    
                    // Skip the "recurring" property
                    const days = Object.keys(schedule).filter(day => day !== 'recurring');
                    
                    if (days.length === 0) {
                        const noAvailMsg = document.createElement('p');
                        noAvailMsg.className = 'text-gray-500 col-span-2';
                        noAvailMsg.textContent = 'No availability information provided';
                        walkerAvailability.appendChild(noAvailMsg);
                    } else {
                        days.forEach(day => {
                            const timeSlots = schedule[day];
                            const dayElement = document.createElement('div');
                            
                            // Create day header
                            const dayHeader = document.createElement('div');
                            dayHeader.className = 'font-medium';
                            dayHeader.textContent = day;
                            dayElement.appendChild(dayHeader);
                            
                            // Add time slots
                            timeSlots.forEach(slot => {
                                const [from, to] = slot.split('-');
                                const timeElement = document.createElement('div');
                                timeElement.className = 'text-sm';
                                timeElement.textContent = `${formatTimeDisplay(from)} - ${formatTimeDisplay(to)}`;
                                dayElement.appendChild(timeElement);
                            });
                            
                            dayElement.className = 'mb-2';
                            walkerAvailability.appendChild(dayElement);
                        });
                    }
                } catch (error) {
                    console.error('Error parsing availability schedule:', error);
                    const errorMsg = document.createElement('p');
                    errorMsg.className = 'text-gray-500 col-span-2';
                    errorMsg.textContent = 'Could not load availability information';
                    walkerAvailability.appendChild(errorMsg);
                }
            } else {
                const noAvailMsg = document.createElement('p');
                noAvailMsg.className = 'text-gray-500 col-span-2';
                noAvailMsg.textContent = 'No availability information provided';
                walkerAvailability.appendChild(noAvailMsg);
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
        
        // Set content safely using textContent
        if (ownerEmail) ownerEmail.textContent = email;
        if (ownerMobile) ownerMobile.textContent = profile.mobile || 'Not provided';
        if (ownerAddress) ownerAddress.textContent = profile.address || 'Not provided';
        if (ownerCommunication) ownerCommunication.textContent = profile.preferred_communication || 'Not specified';
        if (ownerNotes) ownerNotes.textContent = profile.owner_notes_for_walker || 'No notes provided';
        
        // Fetch and display owner's dogs safely
        if (ownerDogs) {
            // Clear previous dogs safely
            while (ownerDogs.firstChild) {
                ownerDogs.removeChild(ownerDogs.firstChild);
            }
            
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
                        // Create dog card element
                        const dogCard = document.createElement('div');
                        dogCard.className = 'border border-gray-200 rounded-lg p-4';
                        
                        // Add dog name
                        const dogName = document.createElement('h4');
                        dogName.className = 'font-bold text-lg text-gray-800';
                        dogName.textContent = dog.name;
                        dogCard.appendChild(dogName);
                        
                        // Create details grid
                        const detailsGrid = document.createElement('div');
                        detailsGrid.className = 'grid grid-cols-2 gap-2 mt-2 text-sm';
                        
                        // Add details safely
                        if (dog.breed) {
                            const breedDiv = document.createElement('div');
                            const breedLabel = document.createElement('span');
                            breedLabel.className = 'font-medium';
                            breedLabel.textContent = 'Breed: ';
                            breedDiv.appendChild(breedLabel);
                            breedDiv.appendChild(document.createTextNode(dog.breed));
                            detailsGrid.appendChild(breedDiv);
                        }
                        
                        if (dog.age) {
                            const ageDiv = document.createElement('div');
                            const ageLabel = document.createElement('span');
                            ageLabel.className = 'font-medium';
                            ageLabel.textContent = 'Age: ';
                            ageDiv.appendChild(ageLabel);
                            ageDiv.appendChild(document.createTextNode(`${dog.age} years`));
                            detailsGrid.appendChild(ageDiv);
                        }
                        
                        if (dog.gender) {
                            const genderDiv = document.createElement('div');
                            const genderLabel = document.createElement('span');
                            genderLabel.className = 'font-medium';
                            genderLabel.textContent = 'Gender: ';
                            genderDiv.appendChild(genderLabel);
                            genderDiv.appendChild(document.createTextNode(dog.gender));
                            detailsGrid.appendChild(genderDiv);
                        }
                        
                        if (dog.weight) {
                            const weightDiv = document.createElement('div');
                            const weightLabel = document.createElement('span');
                            weightLabel.className = 'font-medium';
                            weightLabel.textContent = 'Weight: ';
                            weightDiv.appendChild(weightLabel);
                            weightDiv.appendChild(document.createTextNode(`${dog.weight} kg`));
                            detailsGrid.appendChild(weightDiv);
                        }
                        
                        dogCard.appendChild(detailsGrid);
                        
                        // Add other details safely
                        if (dog.temperament && dog.temperament.length > 0) {
                            const tempDiv = document.createElement('div');
                            tempDiv.className = 'mt-2 text-sm';
                            const tempLabel = document.createElement('span');
                            tempLabel.className = 'font-medium';
                            tempLabel.textContent = 'Temperament: ';
                            tempDiv.appendChild(tempLabel);
                            tempDiv.appendChild(document.createTextNode(
                                Array.isArray(dog.temperament) ? dog.temperament.join(', ') : dog.temperament
                            ));
                            dogCard.appendChild(tempDiv);
                        }
                        
                        if (dog.special_needs) {
                            const needsDiv = document.createElement('div');
                            needsDiv.className = 'mt-2 text-sm';
                            const needsLabel = document.createElement('span');
                            needsLabel.className = 'font-medium';
                            needsLabel.textContent = 'Special Needs: ';
                            needsDiv.appendChild(needsLabel);
                            needsDiv.appendChild(document.createTextNode(dog.special_needs));
                            dogCard.appendChild(needsDiv);
                        }
                        
                        if (dog.vet_contact) {
                            const vetDiv = document.createElement('div');
                            vetDiv.className = 'mt-2 text-sm';
                            const vetLabel = document.createElement('span');
                            vetLabel.className = 'font-medium';
                            vetLabel.textContent = 'Vet Contact: ';
                            vetDiv.appendChild(vetLabel);
                            vetDiv.appendChild(document.createTextNode(dog.vet_contact));
                            dogCard.appendChild(vetDiv);
                        }
                        
                        if (dog.preferred_route) {
                            const routeDiv = document.createElement('div');
                            routeDiv.className = 'mt-2 text-sm';
                            const routeLabel = document.createElement('span');
                            routeLabel.className = 'font-medium';
                            routeLabel.textContent = 'Preferred Route: ';
                            routeDiv.appendChild(routeLabel);
                            routeDiv.appendChild(document.createTextNode(dog.preferred_route));
                            dogCard.appendChild(routeDiv);
                        }
                        
                        ownerDogs.appendChild(dogCard);
                    });
                } else {
                    if (noDogs) noDogs.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Error fetching dogs:', error);
                const errorMsg = document.createElement('p');
                errorMsg.className = 'text-red-500';
                errorMsg.textContent = 'Could not load dog information';
                ownerDogs.appendChild(errorMsg);
            }
        }
        
        // Show owner content
        modalOwnerContent.classList.remove('hidden');
    }

}); // End DOMContentLoaded