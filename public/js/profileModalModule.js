// js/profileModalModule.js
(function(App) {
    'use strict';

    let _supabase;
    let _domElements = {
        userProfileModal: null,
        closeProfileModalButton: null,
        modalUserName: null,
        modalUserRole: null,
        modalUserDistance: null,
        modalLoading: null,
        modalError: null,
        modalWalkerContent: null,
        modalOwnerContent: null,
        // Specific fields within walker content
        modalWalkerAbout: null,
        modalWalkerExperienceYears: null,
        modalWalkerExperienceSummary: null,
        modalWalkerEmailDisplay: null, // Renamed to avoid confusion with actual email field
        modalWalkerMobile: null,
        modalWalkerAvailability: null,
        // Specific fields within owner content
        modalOwnerEmailDisplay: null, // Renamed
        modalOwnerMobile: null,
        modalOwnerAddress: null,
        modalOwnerCommunication: null,
        modalOwnerNotes: null,
        modalOwnerDogs: null,
        modalNoDogs: null
    };

    // Ensure pawsitiveCommon and its utilities are loaded
    if (!window.pawsitiveCommon || !window.pawsitiveCommon.createSafeElement || !window.pawsitiveCommon.sanitizeHTML) {
        App.ProfileModal = { init: () => {}, show: () => { } };
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

    function _populateWalkerModalContent(profile) {
        if (!_domElements.modalWalkerContent) {
            return;
        }
        
        // Use specific DOM elements for each field
        if(_domElements.modalWalkerAbout) _domElements.modalWalkerAbout.textContent = sanitizeHTML(profile.about_me || 'N/A');
        if(_domElements.modalWalkerExperienceYears) _domElements.modalWalkerExperienceYears.textContent = profile.experience_years ? `${profile.experience_years} years` : 'N/A';
        if(_domElements.modalWalkerExperienceSummary) _domElements.modalWalkerExperienceSummary.textContent = sanitizeHTML(profile.experience_summary || 'N/A');
        
        // Email is intentionally not displayed publicly by default for privacy
        if(_domElements.modalWalkerEmailDisplay) _domElements.modalWalkerEmailDisplay.textContent = 'Contact via platform'; // Or 'Not publicly available'
        
        if(_domElements.modalWalkerMobile) _domElements.modalWalkerMobile.textContent = sanitizeHTML(profile.mobile || 'Not Provided');

        if (_domElements.modalWalkerAvailability) {
            _domElements.modalWalkerAvailability.innerHTML = ''; // Clear previous
            if (profile.availability_schedule) {
                try {
                    const schedule = typeof profile.availability_schedule === 'string' ? JSON.parse(profile.availability_schedule) : profile.availability_schedule;
                    let hasAvailability = false;
                    DAYS_OF_WEEK.forEach(day => {
                        if (schedule[day] && schedule[day].length > 0) {
                            hasAvailability = true;
                            const dayContainer = createSafeElement('div', {className: 'mb-1 text-xs'});
                            dayContainer.appendChild(createSafeElement('strong', {className: 'block'}, day));
                            schedule[day].forEach(slot => {
                                const [from, to] = slot.split('-');
                                dayContainer.appendChild(createSafeElement('span', {className: 'block ml-2'}, `${formatTimeDisplay(from)} - ${formatTimeDisplay(to)}`));
                            });
                            _domElements.modalWalkerAvailability.appendChild(dayContainer);
                        }
                    });
                    if(!hasAvailability) _domElements.modalWalkerAvailability.textContent = 'Availability not specified.';
                } catch (e) { 
                    _domElements.modalWalkerAvailability.textContent = 'Error loading availability.'; 
                }
            } else {
                _domElements.modalWalkerAvailability.textContent = 'Availability not specified.';
            }
        }
        _domElements.modalWalkerContent.classList.remove('hidden');
    }

    async function _populateOwnerModalContent(profile, ownerId) {
        if (!_domElements.modalOwnerContent) {
            return;
        }

        // Email is intentionally not displayed publicly
        if(_domElements.modalOwnerEmailDisplay) _domElements.modalOwnerEmailDisplay.textContent = 'Contact via platform';
        
        if(_domElements.modalOwnerMobile) _domElements.modalOwnerMobile.textContent = sanitizeHTML(profile.mobile || 'Not Provided');
        if(_domElements.modalOwnerAddress) _domElements.modalOwnerAddress.textContent = sanitizeHTML(profile.address || 'N/A');
        if(_domElements.modalOwnerCommunication) _domElements.modalOwnerCommunication.textContent = sanitizeHTML(profile.preferred_communication || 'N/A');
        if(_domElements.modalOwnerNotes) _domElements.modalOwnerNotes.textContent = sanitizeHTML(profile.owner_notes_for_walker || 'N/A');

        if (_domElements.modalOwnerDogs && _domElements.modalNoDogs) {
            _domElements.modalOwnerDogs.innerHTML = ''; 
            _domElements.modalNoDogs.classList.add('hidden');
    
            try {
                const { data: dogs, error } = await _supabase.from('dogs').select('name, breed, age, gender').eq('owner_id', ownerId);
                if (error) throw error;

                if (dogs && dogs.length > 0) {
                    dogs.forEach(dog => {
                        const dogCard = createSafeElement('div', {className: 'p-2 border rounded mb-2 text-xs bg-gray-50'});
                        dogCard.appendChild(createSafeElement('h5', {className: 'font-semibold text-sm mb-0.5 text-purple-700'}, sanitizeHTML(dog.name)));
                        const addDogDetail = (label, value) => {
                            if (value) dogCard.appendChild(createSafeElement('p', {className:''}, [
                                createSafeElement('strong', {}, `${label}: `),
                                document.createTextNode(sanitizeHTML(String(value)))
                            ]));
                        };
                        addDogDetail('Breed', dog.breed);
                        addDogDetail('Age', dog.age ? `${dog.age} years` : null);
                        addDogDetail('Gender', dog.gender);
                        _domElements.modalOwnerDogs.appendChild(dogCard);
                    });
                } else {
                    _domElements.modalNoDogs.classList.remove('hidden');
                     _domElements.modalNoDogs.textContent = 'No dogs listed by this owner.';
                }
            } catch(e) {
                _domElements.modalOwnerDogs.textContent = 'Error loading dog details.'; 
            }
        }
        _domElements.modalOwnerContent.classList.remove('hidden');
    }

    App.ProfileModal = {
        init: function(supabaseClient, domModalRefs) {
            _supabase = supabaseClient;
            
            // Assign all specific modal DOM elements passed from dashboard main scripts
            _domElements.userProfileModal = domModalRefs.userProfileModal;
            _domElements.closeProfileModalButton = domModalRefs.closeProfileModalButton;
            _domElements.modalUserName = domModalRefs.modalUserName;
            _domElements.modalUserRole = domModalRefs.modalUserRole;
            _domElements.modalUserDistance = domModalRefs.modalUserDistance;
            _domElements.modalLoading = domModalRefs.modalLoading;
            _domElements.modalError = domModalRefs.modalError;
            _domElements.modalWalkerContent = domModalRefs.modalWalkerContent;
            _domElements.modalOwnerContent = domModalRefs.modalOwnerContent;
            
            // It's safer to querySelector specific fields from the container here,
            // assuming domModalRefs.modalWalkerContent and domModalRefs.modalOwnerContent are the main containers.
            if (_domElements.modalWalkerContent) {
                _domElements.modalWalkerAbout = _domElements.modalWalkerContent.querySelector('#modal-walker-about');
                _domElements.modalWalkerExperienceYears = _domElements.modalWalkerContent.querySelector('#modal-walker-experience-years');
                _domElements.modalWalkerExperienceSummary = _domElements.modalWalkerContent.querySelector('#modal-walker-experience-summary');
                _domElements.modalWalkerEmailDisplay = _domElements.modalWalkerContent.querySelector('#modal-walker-email'); // Corresponds to the span/p for email
                _domElements.modalWalkerMobile = _domElements.modalWalkerContent.querySelector('#modal-walker-mobile');
                _domElements.modalWalkerAvailability = _domElements.modalWalkerContent.querySelector('#modal-walker-availability');
            }

            if (_domElements.modalOwnerContent) {
                _domElements.modalOwnerEmailDisplay = _domElements.modalOwnerContent.querySelector('#modal-owner-email'); // Corresponds to the span/p for email
                _domElements.modalOwnerMobile = _domElements.modalOwnerContent.querySelector('#modal-owner-mobile');
                _domElements.modalOwnerAddress = _domElements.modalOwnerContent.querySelector('#modal-owner-address');
                _domElements.modalOwnerCommunication = _domElements.modalOwnerContent.querySelector('#modal-owner-communication');
                _domElements.modalOwnerNotes = _domElements.modalOwnerContent.querySelector('#modal-owner-notes');
                _domElements.modalOwnerDogs = _domElements.modalOwnerContent.querySelector('#modal-owner-dogs'); // The div to list dogs
                _domElements.modalNoDogs = _domElements.modalOwnerContent.querySelector('#modal-no-dogs'); // The p tag for no dogs
            }

            // Check if all essential elements are found
            for (const key in _domElements) {
                if (_domElements[key] === null && key !== 'modalUserDistance') { // modalUserDistance is optional
                    // console.warn(`[ProfileModalModule] DOM element for '${key}' not found during init.`);
                }
            }

            if (_domElements.closeProfileModalButton && _domElements.userProfileModal) {
                _domElements.closeProfileModalButton.addEventListener('click', () => {
                    _domElements.userProfileModal.classList.add('hidden');
                    _domElements.userProfileModal.classList.remove('flex');
                });
            } else {
                // console.warn("[ProfileModalModule] Could not set up close button for modal.");
            }
        },

        show: async function(userId, userRole, userName = 'User', userDistance = null) {
            if (!_supabase) {
                alert("Error: Profile display service unavailable.");
                return;
            }
            if (!_domElements.userProfileModal || !_domElements.modalUserName || !_domElements.modalLoading || 
                !_domElements.modalError || !_domElements.modalWalkerContent || !_domElements.modalOwnerContent) {
                alert("Error: Could not display profile (UI elements missing).");
                return;
            }

            // Reset and prepare modal
            _domElements.modalUserName.textContent = sanitizeHTML(userName);
            _domElements.modalUserRole.textContent = userRole === 'owner' ? 'Pet Owner' : 'Dog Walker';
            _domElements.modalUserDistance.textContent = userDistance ? `${sanitizeHTML(String(userDistance))} km away` : '';
            
            _domElements.modalLoading.classList.remove('hidden');
            _domElements.modalError.classList.add('hidden');
            _domElements.modalWalkerContent.classList.add('hidden');
            _domElements.modalOwnerContent.classList.add('hidden');
            _domElements.userProfileModal.classList.remove('hidden');
            _domElements.userProfileModal.classList.add('flex');

            try {
                const { data: profileData, error: profileError } = await _supabase
                    .from('profiles')
                    .select('full_name, role, mobile, address, about_me, experience_years, experience_summary, availability_schedule, preferred_communication, owner_notes_for_walker') // Select all fields needed for both owner/walker
                    .eq('id', userId)
                    .single();

                if (profileError) throw profileError;
                if (!profileData) throw new Error(`Profile not found for user ID: ${userId}`);

                // Update modal user name with fetched name if it was 'User' or 'Loading...'
                if (_domElements.modalUserName.textContent === 'User' || _domElements.modalUserName.textContent === 'Loading...') {
                    _domElements.modalUserName.textContent = sanitizeHTML(profileData.full_name || 'User Profile');
                }


                if (profileData.role === 'walker') {
                    _populateWalkerModalContent(profileData);
                } else if (profileData.role === 'owner') {
                    await _populateOwnerModalContent(profileData, userId);
                } else {
                    throw new Error(`Unknown role fetched: ${profileData.role}`);
                }
                _domElements.modalLoading.classList.add('hidden');

            } catch (error) {
                if(_domElements.modalLoading) _domElements.modalLoading.classList.add('hidden');
                if(_domElements.modalError) {
                    _domElements.modalError.classList.remove('hidden');
                    const errorPEl = _domElements.modalError.querySelector('p');
                    if(errorPEl) errorPEl.textContent = `Error loading profile details: ${error.message}`;
                }
            }
        }
    };

})(window.App = window.App || {});