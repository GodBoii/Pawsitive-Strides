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
            _domElements.noDogsMessage.classList.remove('hidden'); // Ensure it's visible
            _domElements.noDogsMessage.textContent = "You haven't added any dogs yet."; // Ensure text is set
            return;
        }

        _domElements.noDogsMessage.classList.add('hidden'); // Hide if there are dogs
        _dogs.forEach(dog => {
            // Themed dog card using Tailwind classes
            const card = window.pawsitiveCommon.createSafeElement('div', { 
                className: 'bg-white p-4 md:p-5 rounded-xl shadow-lg border border-amber-200 mb-4' 
            });
            
            const nameHeader = window.pawsitiveCommon.createSafeElement('h4', {
                className: 'font-serif text-xl text-stone-800 mb-2'
            }, dog.name);
            card.appendChild(nameHeader);

            const detailsGrid = window.pawsitiveCommon.createSafeElement('div', { 
                className: 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-stone-600' 
            });

            const addDetail = (label, value) => {
                if (value) {
                    detailsGrid.appendChild(
                        window.pawsitiveCommon.createSafeElement('div', { className: 'py-0.5' }, [ // Added py-0.5 for slight vertical spacing
                            window.pawsitiveCommon.createSafeElement('span', { className: 'font-semibold text-stone-700' }, `${label}: `),
                            document.createTextNode(window.pawsitiveCommon.sanitizeHTML(String(value))) // Sanitize and convert to string
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
                card.appendChild(window.pawsitiveCommon.createSafeElement('div', { className: 'mt-2 text-sm text-stone-600' }, [
                    window.pawsitiveCommon.createSafeElement('span', { className: 'font-semibold text-stone-700' }, 'Temperament: '),
                    document.createTextNode(window.pawsitiveCommon.sanitizeHTML(temperamentText))
                ]));
            }
            if (dog.special_needs) {
                 card.appendChild(window.pawsitiveCommon.createSafeElement('div', { className: 'mt-2 text-sm text-stone-600' }, [
                    window.pawsitiveCommon.createSafeElement('span', { className: 'font-semibold text-stone-700' }, 'Special Needs: '),
                    document.createTextNode(window.pawsitiveCommon.sanitizeHTML(dog.special_needs))
                ]));
            }
            if (dog.vet_contact) {
                 card.appendChild(window.pawsitiveCommon.createSafeElement('div', { className: 'mt-2 text-sm text-stone-600' }, [
                    window.pawsitiveCommon.createSafeElement('span', { className: 'font-semibold text-stone-700' }, 'Vet Contact: '),
                    document.createTextNode(window.pawsitiveCommon.sanitizeHTML(dog.vet_contact))
                ]));
            }
            if (dog.preferred_route) {
                 card.appendChild(window.pawsitiveCommon.createSafeElement('div', { className: 'mt-2 text-sm text-stone-600' }, [
                    window.pawsitiveCommon.createSafeElement('span', { className: 'font-semibold text-stone-700' }, 'Preferred Route: '),
                    document.createTextNode(window.pawsitiveCommon.sanitizeHTML(dog.preferred_route))
                ]));
            }


            const actionsDiv = window.pawsitiveCommon.createSafeElement('div', { className: 'mt-3 pt-3 border-t border-stone-100 text-right' });
            const removeButton = window.pawsitiveCommon.createSafeElement('button', {
                className: 'text-red-600 hover:text-red-700 text-sm font-medium remove-dog-btn px-3 py-1 rounded-md hover:bg-red-50 transition-colors',
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
            if (_domElements.dogMessageElement) {
                _domElements.dogMessageElement.textContent = `Error fetching dogs: ${error.message}`;
                _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-red-700'; // Themed error
            }
        }
    }

    async function handleAddDog(event) {
        event.preventDefault();
        if (!_domElements.addDogForm || !_domElements.dogMessageElement) return;

        _domElements.dogMessageElement.textContent = 'Adding dog...';
        _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-stone-600'; // Themed processing

        const formData = new FormData(_domElements.addDogForm);
        const dogName = formData.get('name')?.trim();
        if (!dogName) {
            _domElements.dogMessageElement.textContent = 'Dog name is required.';
            _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-red-700'; // Themed error
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
            if (isNaN(weight)) weight = null; // Ensure it's a valid number
        }
        
        let age = null;
        const ageValue = formData.get('age');
        if (ageValue && ageValue !== '') {
            age = parseInt(ageValue, 10);
            if (isNaN(age)) age = null; // Ensure it's a valid number
        }


        const newDog = {
            owner_id: _currentUser.id,
            name: dogName,
            breed: formData.get('breed')?.trim() || null,
            age: age,
            gender: formData.get('gender') || null,
            weight: weight,
            temperament: temperamentArray,
            special_needs: formData.get('special_needs')?.trim() || null,
            vet_contact: formData.get('vet_contact')?.trim() || null,
            preferred_route: formData.get('preferred_route')?.trim() || null,
        };

        try {
            const { data, error } = await _supabase.from('dogs').insert([newDog]).select();
            if (error) throw error;

            _domElements.dogMessageElement.textContent = 'Dog added successfully!';
            _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-emerald-700'; // Themed success
            _domElements.addDogForm.reset();
            await fetchUserDogs(); // Refresh the list

            setTimeout(() => { // Clear success message after a delay
                if (_domElements.dogMessageElement && _domElements.dogMessageElement.textContent === 'Dog added successfully!') {
                     _domElements.dogMessageElement.textContent = '';
                }
            }, 3000);

        } catch (error) {
            _domElements.dogMessageElement.textContent = `Error: ${error.message}`;
            _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-red-700'; // Themed error
        }
    }

    async function handleRemoveDogClick(event) {
        const dogId = event.target.dataset.dogId;
        if (!dogId) return;

        if (confirm('Are you sure you want to remove this dog? This action cannot be undone.')) {
            if (_domElements.dogMessageElement) {
                 _domElements.dogMessageElement.textContent = 'Removing dog...';
                 _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-stone-600'; // Themed processing
            }
            try {
                // Check if this dog is part of any active/pending quick rides
                const { data: quickRides, error: rideError } = await _supabase
                    .from('quick_rides')
                    .select('id, status')
                    .eq('dog_id', dogId)
                    .in('status', ['pending_acceptance', 'accepted']);

                if (rideError) throw rideError;

                if (quickRides && quickRides.length > 0) {
                    alert('This dog is part of an active or pending Quick Ride. Please cancel or complete the ride before removing the dog.');
                    if (_domElements.dogMessageElement) _domElements.dogMessageElement.textContent = '';
                    return;
                }
                
                const { error } = await _supabase.from('dogs').delete().eq('id', dogId);
                if (error) throw error;

                if (_domElements.dogMessageElement) {
                    _domElements.dogMessageElement.textContent = 'Dog removed successfully.';
                    _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-emerald-700'; // Themed success
                }
                await fetchUserDogs(); // Refresh list

                setTimeout(() => { // Clear success message
                    if (_domElements.dogMessageElement && _domElements.dogMessageElement.textContent === 'Dog removed successfully.') {
                        _domElements.dogMessageElement.textContent = '';
                    }
                }, 3000);

            } catch (error) {
                if (_domElements.dogMessageElement) {
                    _domElements.dogMessageElement.textContent = `Error removing dog: ${error.message}`;
                    _domElements.dogMessageElement.className = 'dog-message ml-4 text-sm text-red-700'; // Themed error
                }
            }
        }
    }

    function populateOwnerDetailsForm() {
        if (!_userProfileData || !_domElements.ownerDetailsForm) return;
        
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
        _domElements.ownerDetailsMessageElement.className = 'owner-details-message ml-4 text-sm text-stone-600'; // Themed processing

        const formData = new FormData(_domElements.ownerDetailsForm);
        const updates = {
            emergency_contact_name: formData.get('emergency_contact_name')?.trim() || null,
            emergency_contact_phone: formData.get('emergency_contact_phone')?.trim() || null,
            preferred_communication: formData.get('preferred_communication') || null,
            owner_notes_for_walker: formData.get('owner_notes_for_walker')?.trim() || null,
            updated_at: new Date()
        };

        try {
            const { data: updatedProfile, error } = await _supabase
                .from('profiles')
                .update(updates)
                .eq('id', _currentUser.id)
                .select('*') 
                .single();

            if (error) throw error;

            _domElements.ownerDetailsMessageElement.textContent = 'Owner details updated successfully!';
            _domElements.ownerDetailsMessageElement.className = 'owner-details-message ml-4 text-sm text-emerald-700'; // Themed success
            _userProfileData = { ..._userProfileData, ...updatedProfile }; 

            setTimeout(() => { // Clear success message
                if (_domElements.ownerDetailsMessageElement && _domElements.ownerDetailsMessageElement.textContent === 'Owner details updated successfully!') {
                    _domElements.ownerDetailsMessageElement.textContent = '';
                }
            }, 3000);
            
        } catch (error) {
            _domElements.ownerDetailsMessageElement.textContent = `Error: ${error.message}`;
            _domElements.ownerDetailsMessageElement.className = 'owner-details-message ml-4 text-sm text-red-700'; // Themed error
        }
    }

    App.OwnerProfile = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData;
            _domElements = domRefs;

            if (_domElements.ownerContentElement) {
                // Content is displayed by default in HTML, so no need to toggle class here
                // _domElements.ownerContentElement.classList.remove('hidden');
            } else {
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
    };

})(window.App = window.App || {});