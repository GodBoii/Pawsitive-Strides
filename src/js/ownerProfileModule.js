// js/ownerProfileModule.js

(function(App) {
    'use strict';

    let _supabase;
    let _currentUser;
    let _userProfileData; // Main profile data
    let _domElements = {}; // { ownerContentElement, addDogForm, dogListDiv, noDogsMessage, dogMessageElement, ownerDetailsForm, ownerDetailsMessageElement }
    let _dogs = []; // Local cache of owner's dogs

    function displayDogs() {
        if (!_domElements.dogListDiv || !_domElements.noDogsMessage) return;

        _domElements.dogListDiv.innerHTML = ''; // Clear previous dogs

        if (_dogs.length === 0) {
            _domElements.noDogsMessage.style.display = 'block';
            return;
        }

        _domElements.noDogsMessage.style.display = 'none';
        _dogs.forEach(dog => {
            const card = window.pawsitiveCommon.createSafeElement('div', { className: 'dog-card' });
            
            const nameHeader = window.pawsitiveCommon.createSafeElement('h4', {}, dog.name);
            card.appendChild(nameHeader);

            const detailsGrid = window.pawsitiveCommon.createSafeElement('div', { className: 'grid grid-cols-2 gap-2 text-sm' });
            const addDetail = (label, value) => {
                if (value) {
                    detailsGrid.appendChild(
                        window.pawsitiveCommon.createSafeElement('div', {}, [
                            window.pawsitiveCommon.createSafeElement('span', { className: 'font-medium' }, `${label}: `),
                            document.createTextNode(value)
                        ])
                    );
                }
            };

            addDetail('Breed', dog.breed);
            addDetail('Age', dog.age ? `${dog.age} years` : null);
            addDetail('Gender', dog.gender);
            addDetail('Weight', dog.weight ? `${dog.weight} kg` : null);
            card.appendChild(detailsGrid);

            if (dog.temperament && dog.temperament.length > 0) {
                const temperamentText = Array.isArray(dog.temperament) ? dog.temperament.join(', ') : dog.temperament;
                card.appendChild(window.pawsitiveCommon.createSafeElement('div', { className: 'mt-2 text-sm' }, [
                    window.pawsitiveCommon.createSafeElement('span', { className: 'font-medium' }, 'Temperament: '),
                    document.createTextNode(temperamentText)
                ]));
            }
            if (dog.special_needs) {
                 card.appendChild(window.pawsitiveCommon.createSafeElement('div', { className: 'mt-2 text-sm' }, [
                    window.pawsitiveCommon.createSafeElement('span', { className: 'font-medium' }, 'Special Needs: '),
                    document.createTextNode(dog.special_needs)
                ]));
            }
            // Add vet_contact and preferred_route similarly if they exist

            const actionsDiv = window.pawsitiveCommon.createSafeElement('div', { className: 'mt-3 pt-2 border-t border-gray-100 text-right' });
            const removeButton = window.pawsitiveCommon.createSafeElement('button', {
                className: 'text-red-500 hover:text-red-700 text-sm font-medium remove-dog-btn',
                'data-dog-id': dog.id
            }, 'Remove');
            removeButton.addEventListener('click', handleRemoveDogClick);
            actionsDiv.appendChild(removeButton);
            card.appendChild(actionsDiv);

            _domElements.dogListDiv.appendChild(card);
        });
    }

    async function fetchUserDogs() {
        if (!_currentUser) return;
        try {
            const { data, error } = await _supabase
                .from('dogs')
                .select('*')
                .eq('owner_id', _currentUser.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            _dogs = data || [];
            displayDogs();
        } catch (error) {
            console.error('[OwnerProfileModule] Error fetching dogs:', error);
            if (_domElements.dogMessageElement) {
                _domElements.dogMessageElement.textContent = `Error fetching dogs: ${error.message}`;
                _domElements.dogMessageElement.style.color = 'red';
            }
        }
    }

    async function handleAddDog(event) {
        event.preventDefault();
        if (!_domElements.addDogForm || !_domElements.dogMessageElement) return;

        _domElements.dogMessageElement.textContent = 'Adding dog...';
        _domElements.dogMessageElement.style.color = 'inherit';

        const formData = new FormData(_domElements.addDogForm);
        const dogName = formData.get('name')?.trim();
        if (!dogName) {
            _domElements.dogMessageElement.textContent = 'Dog name is required.';
            _domElements.dogMessageElement.style.color = 'red';
            return;
        }
        
        let temperamentArray = null;
        const temperamentString = formData.get('temperament')?.trim();
        if (temperamentString) {
            temperamentArray = temperamentString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }

        let weight = null;
        const weightValue = formData.get('weight');
        if (weightValue && weightValue !== '') {
            weight = parseFloat(weightValue);
        }

        const newDog = {
            owner_id: _currentUser.id,
            name: dogName,
            breed: formData.get('breed')?.trim() || null,
            age: formData.get('age') ? parseInt(formData.get('age'), 10) : null,
            gender: formData.get('gender') || null,
            weight: weight,
            temperament: temperamentArray,
            special_needs: formData.get('special_needs')?.trim() || null,
            vet_contact: formData.get('vet_contact')?.trim() || null,
            preferred_route: formData.get('preferred_route')?.trim() || null,
            // photo_urls and vaccination_records_url will be handled in future updates
        };

        try {
            const { data, error } = await _supabase.from('dogs').insert([newDog]).select();
            if (error) throw error;

            _domElements.dogMessageElement.textContent = 'Dog added successfully!';
            _domElements.dogMessageElement.style.color = 'green';
            _domElements.addDogForm.reset();
            await fetchUserDogs(); // Refresh the list
        } catch (error) {
            console.error("[OwnerProfileModule] Error adding dog:", error);
            _domElements.dogMessageElement.textContent = `Error: ${error.message}`;
            _domElements.dogMessageElement.style.color = 'red';
        }
    }

    async function handleRemoveDogClick(event) {
        const dogId = event.target.dataset.dogId;
        if (!dogId) return;

        if (confirm('Are you sure you want to remove this dog?')) {
            if (_domElements.dogMessageElement) {
                 _domElements.dogMessageElement.textContent = 'Removing dog...';
                 _domElements.dogMessageElement.style.color = 'inherit';
            }
            try {
                const { error } = await _supabase.from('dogs').delete().eq('id', dogId);
                if (error) throw error;

                if (_domElements.dogMessageElement) {
                    _domElements.dogMessageElement.textContent = 'Dog removed successfully.';
                    _domElements.dogMessageElement.style.color = 'green';
                }
                await fetchUserDogs(); // Refresh list
            } catch (error) {
                console.error('[OwnerProfileModule] Error removing dog:', error);
                if (_domElements.dogMessageElement) {
                    _domElements.dogMessageElement.textContent = `Error removing dog: ${error.message}`;
                    _domElements.dogMessageElement.style.color = 'red';
                }
            }
        }
    }

    function populateOwnerDetailsForm() {
        if (!_userProfileData || !_domElements.ownerDetailsForm) return;
        console.log('[OwnerProfileModule] Populating owner details form with:', _userProfileData);
        
        const form = _domElements.ownerDetailsForm;
        form.querySelector('#emergency-contact-name').value = _userProfileData.emergency_contact_name || '';
        form.querySelector('#emergency-contact-phone').value = _userProfileData.emergency_contact_phone || '';
        form.querySelector('#preferred-communication').value = _userProfileData.preferred_communication || '';
        form.querySelector('#owner-notes').value = _userProfileData.owner_notes_for_walker || '';
        
        if (_domElements.ownerDetailsMessageElement) _domElements.ownerDetailsMessageElement.textContent = '';
    }

    async function handleOwnerDetailsUpdate(event) {
        event.preventDefault();
        if (!_domElements.ownerDetailsForm || !_domElements.ownerDetailsMessageElement) return;

        _domElements.ownerDetailsMessageElement.textContent = 'Updating details...';
        _domElements.ownerDetailsMessageElement.style.color = 'inherit';

        const formData = new FormData(_domElements.ownerDetailsForm);
        const updates = {
            emergency_contact_name: formData.get('emergency_contact_name')?.trim() || null,
            emergency_contact_phone: formData.get('emergency_contact_phone')?.trim() || null,
            preferred_communication: formData.get('preferred_communication') || null,
            owner_notes_for_walker: formData.get('owner_notes_for_walker')?.trim() || null,
            updated_at: new Date()
        };

        console.log('[OwnerProfileModule] Sending owner details updates to Supabase:', updates);
        try {
            const { data: updatedProfile, error } = await _supabase
                .from('profiles')
                .update(updates)
                .eq('id', _currentUser.id)
                .select('*') // Re-fetch relevant fields
                .single();

            if (error) throw error;

            _domElements.ownerDetailsMessageElement.textContent = 'Owner details updated successfully!';
            _domElements.ownerDetailsMessageElement.style.color = 'green';
            _userProfileData = { ..._userProfileData, ...updatedProfile }; // Update local cache
            console.log("[OwnerProfileModule] Owner details updated locally:", _userProfileData);
            
        } catch (error) {
            console.error("[OwnerProfileModule] Error updating owner details:", error);
            _domElements.ownerDetailsMessageElement.textContent = `Error: ${error.message}`;
            _domElements.ownerDetailsMessageElement.style.color = 'red';
        }
    }

    App.OwnerProfile = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData;
            _domElements = domRefs;

            console.log('[OwnerProfileModule] Initialized with profile:', _userProfileData, 'and DOM:', _domElements);

            if (_domElements.ownerContentElement) {
                _domElements.ownerContentElement.classList.remove('hidden');
            } else {
                console.error("[OwnerProfileModule] Owner content element not found.");
                return;
            }

            if (_domElements.addDogForm) {
                _domElements.addDogForm.addEventListener('submit', handleAddDog);
            }
            
            if (_domElements.ownerDetailsForm) {
                populateOwnerDetailsForm();
                _domElements.ownerDetailsForm.addEventListener('submit', handleOwnerDetailsUpdate);
            }

            fetchUserDogs(); // Load initial dogs
        }
        // No public methods strictly needed by other modules yet, but can be added.
    };

})(window.App = window.App || {});