// js/userProfileModule.js

(function(App) {
    'use strict';

    let _supabase;
    let _currentUser;
    let _userProfileData;
    let _domElements = {}; // To store { profileForm, profileNameInput, ..., profileMessageElement }
    let _selectedLocationByMap = null; // To store location data from MapsModule

    function populateForm() {
        if (!_userProfileData || !_domElements.profileForm) return;

        console.log('[UserProfileModule] Populating basic profile form with:', _userProfileData);
        if (_domElements.profileNameInput) _domElements.profileNameInput.value = _userProfileData.full_name || '';
        if (_domElements.profileEmailInput) _domElements.profileEmailInput.value = _currentUser.email || ''; // Email is from auth
        if (_domElements.profileMobileInput) _domElements.profileMobileInput.value = _userProfileData.mobile || '';
        if (_domElements.profileAddressInput) _domElements.profileAddressInput.value = _userProfileData.address || '';
        
        _selectedLocationByMap = null; // Reset on form population
        if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = '';
        if (_domElements.profileMessageElement) _domElements.profileMessageElement.textContent = '';
    }

    async function handleProfileUpdate(event) {
        event.preventDefault();
        if (!_domElements.profileForm || !_domElements.profileMessageElement) return;

        _domElements.profileMessageElement.textContent = 'Updating...';
        _domElements.profileMessageElement.style.color = 'inherit';

        const formData = new FormData(_domElements.profileForm);
        const updates = {
            full_name: formData.get('full_name')?.trim(),
            mobile: formData.get('mobile')?.trim(),
            updated_at: new Date(),
            // Address, latitude, and longitude will be handled based on _selectedLocationByMap
        };

        // If a new location was selected via map/autocomplete, use it
        if (_selectedLocationByMap && _selectedLocationByMap.lat && _selectedLocationByMap.lng) {
            updates.address = _selectedLocationByMap.address || _domElements.profileAddressInput.value.trim();
            updates.latitude = _selectedLocationByMap.lat;
            updates.longitude = _selectedLocationByMap.lng;
        } else {
            // If no new map selection, just use the address text input
            // If the text input is cleared, also clear coordinates
            updates.address = _domElements.profileAddressInput.value.trim() || null;
            if (!updates.address) {
                updates.latitude = null;
                updates.longitude = null;
            } else if (_userProfileData.address === updates.address) {
                // Address text hasn't changed from original, keep original coords
                updates.latitude = _userProfileData.latitude;
                updates.longitude = _userProfileData.longitude;
            } else {
                 // Address text changed, but no map selection, so we need to geocode this new address
                 // This case is more complex: ideally, we'd prompt the user to pin or verify the new text address
                 // For now, let's assume MapsModule.geocodeAddress is available or we clear coords
                 console.warn("[UserProfileModule] Address text changed without map selection. Coordinates might become stale or be cleared.");
                 // If App.Maps.geocodeAddress exists:
                 // const geocoded = await App.Maps.geocodeAddress(updates.address);
                 // if (geocoded) { updates.latitude = geocoded.lat; updates.longitude = geocoded.lng; } 
                 // else { updates.latitude = null; updates.longitude = null; }
                 // For simplicity now, if address text changed and no map selection, we'll just save text address
                 // and userProfileData's lat/lng will be updated to what's in the DB after save
                 // Or, to be safer and ensure data integrity:
                 updates.latitude = null; // Force re-pinning if address text is manually changed significantly
                 updates.longitude = null; // without using the map tools.
            }
        }
        
        console.log('[UserProfileModule] Sending basic info updates to Supabase:', updates);

        try {
            const { data: updatedProfile, error } = await _supabase
                .from('profiles')
                .update(updates)
                .eq('id', _currentUser.id)
                .select('*, latitude, longitude') // Re-fetch to get latest
                .single();

            if (error) throw error;

            _domElements.profileMessageElement.textContent = 'Profile updated successfully!';
            _domElements.profileMessageElement.style.color = 'green';
            _userProfileData = updatedProfile; // Update local cache
            console.log("[UserProfileModule] Profile updated locally:", _userProfileData);
            
            populateForm(); // Re-populate to clear messages and reflect new state
            
            // If MapsModule is loaded and map view is active, tell it to refresh its data.
            if (App.Maps && App.Maps.onUserProfileUpdated) {
                App.Maps.onUserProfileUpdated(updatedProfile);
            }
             // Hide picker map after successful update
            if (App.Maps && App.Maps.hideLocationPicker) {
                App.Maps.hideLocationPicker();
            }


        } catch (error) {
            console.error("[UserProfileModule] Error updating profile:", error);
            _domElements.profileMessageElement.textContent = `Error: ${error.message}`;
            _domElements.profileMessageElement.style.color = 'red';
        }
    }

    function handlePinLocationClick() {
        console.log("[UserProfileModule] Pin Location button clicked.");
        if (App.Maps && App.Maps.showLocationPicker) {
            // Pass current address value, and a callback for when location is picked
            const currentAddress = _domElements.profileAddressInput ? _domElements.profileAddressInput.value : null;
            const initialCoords = (_userProfileData.latitude && _userProfileData.longitude) ? 
                                  { lat: _userProfileData.latitude, lng: _userProfileData.longitude } : null;

            App.Maps.showLocationPicker(
                _domElements.pickerMapContainer,
                initialCoords,
                currentAddress, // To pre-fill or center map
                (locationData) => { // This is the callback
                    console.log("[UserProfileModule] Location picked via map:", locationData);
                    _selectedLocationByMap = locationData; // Store it
                    if (_domElements.profileAddressInput && locationData.address) {
                        _domElements.profileAddressInput.value = locationData.address;
                    }
                    if (_domElements.reverseGeocodeResultDiv && locationData.address) {
                        _domElements.reverseGeocodeResultDiv.textContent = `Selected: ${locationData.address.substring(0,50)}...`;
                    } else if (_domElements.reverseGeocodeResultDiv) {
                         _domElements.reverseGeocodeResultDiv.textContent = `Coordinates: ${locationData.lat.toFixed(4)}, ${locationData.lng.toFixed(4)}`;
                    }
                    if (_domElements.profileMessageElement) _domElements.profileMessageElement.textContent = ''; // Clear previous messages
                }
            );
        } else {
            console.error("[UserProfileModule] Maps module or showLocationPicker not available.");
            if (_domElements.reverseGeocodeResultDiv) _domElements.reverseGeocodeResultDiv.textContent = "Map feature not available.";
        }
    }


    App.UserProfile = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData;
            _domElements = domRefs;

            console.log('[UserProfileModule] Initialized with profile:', _userProfileData, 'and DOM:', _domElements);
            
            if (!_domElements.profileForm) {
                console.error("[UserProfileModule] Profile form element not found. Cannot initialize.");
                return;
            }

            populateForm();

            _domElements.profileForm.addEventListener('submit', handleProfileUpdate);
            
            if (_domElements.pinLocationButton) {
                _domElements.pinLocationButton.addEventListener('click', handlePinLocationClick);
            }

            // Initialize Google Places Autocomplete for the address input via MapsModule
            if (App.Maps && App.Maps.initAddressAutocomplete && _domElements.profileAddressInput) {
                App.Maps.initAddressAutocomplete(
                    _domElements.profileAddressInput,
                    (placeData) => { // Callback when a place is selected
                        console.log("[UserProfileModule] Address autocompleted:", placeData);
                        _selectedLocationByMap = {
                            lat: placeData.geometry.location.lat(),
                            lng: placeData.geometry.location.lng(),
                            address: placeData.formatted_address
                        };
                        // The input value is already updated by Autocomplete
                        if (_domElements.reverseGeocodeResultDiv) {
                            _domElements.reverseGeocodeResultDiv.textContent = `Selected: ${placeData.formatted_address.substring(0,50)}...`;
                        }
                        if (_domElements.profileMessageElement) _domElements.profileMessageElement.textContent = '';
                    }
                );
            }
        },
        // This can be called by the Maps module if the address is updated there
        // or by an external event if needed.
        updateSelectedLocation: function(locationData) {
            _selectedLocationByMap = locationData;
            if (_domElements.profileAddressInput && locationData.address) {
                _domElements.profileAddressInput.value = locationData.address;
            }
            // Optionally update reverseGeocodeResultDiv here too
        }
    };

})(window.App = window.App || {});