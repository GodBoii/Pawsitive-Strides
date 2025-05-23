// js/walkerProfileModule.js

(function(App) {
    'use strict'; // Corrected from 'useASTRICT'

    let _supabase;
    let _currentUser;
    let _userProfileData;
    let _domElements = {}; // { walkerContentElement, walkerDetailsForm, walkerAgeInput, ..., walkerMessageElement, availabilityContainer, walkerRecurringAvailCheckbox }
    const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    // Ensure pawsitiveCommon and its utilities are loaded
    if (!window.pawsitiveCommon || !window.pawsitiveCommon.createSafeElement || !window.pawsitiveCommon.sanitizeHTML) {
        console.error("[WalkerProfileModule] pawsitiveCommon or its utilities not found. Module cannot function correctly.");
        App.WalkerProfile = { init: () => { console.error("WalkerProfileModule not fully initialized due to missing common utilities.");} };
        return;
    }
    const { createSafeElement, sanitizeHTML } = window.pawsitiveCommon;


    function populateWalkerDetailsForm() {
        if (!_userProfileData || !_domElements.walkerDetailsForm) return;
        console.log('[WalkerProfileModule] Populating walker details form with:', _userProfileData);

        const form = _domElements.walkerDetailsForm;
        if (_domElements.walkerAgeInput) _domElements.walkerAgeInput.value = _userProfileData.age || '';
        if (_domElements.walkerAboutMeInput) _domElements.walkerAboutMeInput.value = _userProfileData.about_me || '';
        if (_domElements.walkerExpYearsInput) _domElements.walkerExpYearsInput.value = _userProfileData.experience_years || '';
        if (_domElements.walkerExpSummaryInput) _domElements.walkerExpSummaryInput.value = _userProfileData.experience_summary || '';

        if (_domElements.availabilityContainer) {
            initializeAvailabilityUI(); // Clears and sets up the UI structure first
            if (_userProfileData.availability_schedule) {
                loadAvailabilitySchedule(_userProfileData.availability_schedule);
            }
        }
        if (_domElements.walkerMessageElement) _domElements.walkerMessageElement.textContent = '';
    }

    async function handleWalkerDetailsUpdate(event) {
        event.preventDefault();
        if (!_domElements.walkerDetailsForm || !_domElements.walkerMessageElement) return;

        _domElements.walkerMessageElement.textContent = 'Updating details...';
        _domElements.walkerMessageElement.className = 'walker-message ml-4 text-sm text-stone-600'; // Themed message

        const formData = new FormData(_domElements.walkerDetailsForm);
        const availabilitySchedule = collectAvailabilityData();

        const updates = {
            // Age is usually set at signup and not editable, or handled separately
            about_me: formData.get('about_me')?.trim() || null,
            experience_years: formData.get('experience_years') ? parseInt(formData.get('experience_years'), 10) : null,
            experience_summary: formData.get('experience_summary')?.trim() || null,
            availability_schedule: availabilitySchedule, // Already a JS object
            updated_at: new Date()
        };

        console.log('[WalkerProfileModule] Sending walker details updates to Supabase:', updates);

        try {
            const { data: updatedProfile, error } = await _supabase
                .from('profiles')
                .update(updates)
                .eq('id', _currentUser.id)
                .select('*') // Re-fetch relevant fields
                .single();

            if (error) throw error;

            _domElements.walkerMessageElement.textContent = 'Walker details updated successfully!';
            _domElements.walkerMessageElement.className = 'walker-message ml-4 text-sm text-emerald-700'; // Themed success
            _userProfileData = { ..._userProfileData, ...updatedProfile }; // Update local cache
            console.log("[WalkerProfileModule] Walker details updated locally:", _userProfileData);

        } catch (error) {
            console.error("[WalkerProfileModule] Error updating walker details:", error);
            _domElements.walkerMessageElement.textContent = `Error: ${error.message}`;
            _domElements.walkerMessageElement.className = 'walker-message ml-4 text-sm text-red-700'; // Themed error
        }
    }

    // --- Availability UI Functions ---
    function initializeAvailabilityUI() {
        if (!_domElements.availabilityContainer) return;
        _domElements.availabilityContainer.innerHTML = ''; // Clear previous content

        DAYS_OF_WEEK.forEach(day => {
            const dayRow = createSafeElement('div', { className: 'day-row mb-4 p-3 border border-stone-200 rounded-lg bg-white shadow-sm', 'data-day': day });
            
            const headerDiv = createSafeElement('div', { className: 'flex items-center mb-2' });
            const checkbox = createSafeElement('input', { 
                type: 'checkbox', 
                id: `avail-${day.toLowerCase()}`, 
                // THEMED: Updated checkbox classes
                className: 'day-checkbox mr-2 h-4 w-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500 focus:ring-offset-0' 
            });
            const label = createSafeElement('label', { htmlFor: `avail-${day.toLowerCase()}`, className: 'text-sm font-medium text-stone-700 select-none' }, day);
            headerDiv.append(checkbox, label);
            dayRow.appendChild(headerDiv);

            const timeSlotsContainer = createSafeElement('div', { className: 'time-slots pl-6 space-y-2 hidden' }); // Initially hidden
            dayRow.appendChild(timeSlotsContainer);
            addTimeSlotElement(timeSlotsContainer); // Add one empty slot by default

            checkbox.addEventListener('change', function() {
                timeSlotsContainer.classList.toggle('hidden', !this.checked);
                if (!this.checked) { 
                    timeSlotsContainer.innerHTML = '';
                    addTimeSlotElement(timeSlotsContainer); 
                }
            });

            _domElements.availabilityContainer.appendChild(dayRow);
        });
        
        if (_domElements.walkerRecurringAvailCheckbox) {
            // Ensure the recurring checkbox also has themed styles if not already applied in HTML
            // Example: _domElements.walkerRecurringAvailCheckbox.className = 'h-4 w-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500 mr-2';
        }
    }
    
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

    function createTimeOption(timeValue, displayValue, selectedValue) {
        const option = createSafeElement('option', { value: timeValue }, displayValue);
        if (timeValue === selectedValue) {
            option.selected = true;
        }
        return option;
    }

    function populateTimeSelect(selectElement, selectedValue = '') {
        selectElement.innerHTML = ''; 
        selectElement.appendChild(createSafeElement('option', { value: '' }, selectElement.classList.contains('time-from') ? 'From' : 'To'));
        for (let h = 6; h < 23; h++) { // Common walking hours e.g., 6 AM to 10:30 PM
            for (let m = 0; m < 60; m += 30) {
                const timeVal = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                selectElement.appendChild(createTimeOption(timeVal, formatTimeDisplay(timeVal), selectedValue));
            }
        }
    }

    function addTimeSlotElement(container, fromValue = '', toValue = '') {
        const slotDiv = createSafeElement('div', { className: 'flex items-center space-x-2 mb-1' });
        // THEMED: Updated select classes to match .input-field style from dashboard's inline CSS or direct Tailwind
        const fromSelect = createSafeElement('select', { 
            className: 'time-from input-field text-sm py-1.5 px-2 w-1/3 rounded-md border-stone-300 focus:ring-emerald-500 focus:border-emerald-500' 
        });
        const toSpan = createSafeElement('span', { className: 'text-sm text-stone-600'}, 'to');
        const toSelect = createSafeElement('select', { 
            className: 'time-to input-field text-sm py-1.5 px-2 w-1/3 rounded-md border-stone-300 focus:ring-emerald-500 focus:border-emerald-500' 
        });
        
        populateTimeSelect(fromSelect, fromValue);
        populateTimeSelect(toSelect, toValue);

        // THEMED: Updated button classes
        const addButton = createSafeElement('button', { 
            type: 'button', 
            className: 'add-time-slot-btn text-sm text-emerald-600 hover:text-emerald-700 focus:outline-none p-1 rounded-full hover:bg-emerald-100 transition-colors',
            title: 'Add another time slot for this day'
        }, 
        '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>');
        addButton.innerHTML = addButton.textContent; // To render SVG
        addButton.addEventListener('click', () => addTimeSlotElement(container));
        
        slotDiv.append(fromSelect, toSpan, toSelect, addButton);

        if (container.children.length > 0 || fromValue || toValue) {
            // THEMED: Updated remove button classes
            const removeButton = createSafeElement('button', { 
                type: 'button', 
                className: 'remove-time-slot-btn text-sm text-red-500 hover:text-red-700 ml-1 focus:outline-none p-1 rounded-full hover:bg-red-100 transition-colors',
                title: 'Remove this time slot'
            }, 
            '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>');
            removeButton.innerHTML = removeButton.textContent; // To render SVG
            removeButton.addEventListener('click', () => {
                if (container.children.length > 1) {
                    slotDiv.remove();
                } else { 
                    populateTimeSelect(fromSelect, '');
                    populateTimeSelect(toSelect, '');
                }
            });
            slotDiv.appendChild(removeButton);
        }
        container.appendChild(slotDiv);
    }
    
    function loadAvailabilitySchedule(scheduleData) { 
        if (!_domElements.availabilityContainer || !scheduleData) return;
        console.log("[WalkerProfileModule] Loading availability schedule:", scheduleData);

        if (_domElements.walkerRecurringAvailCheckbox) {
            _domElements.walkerRecurringAvailCheckbox.checked = scheduleData.recurring || false;
        }

        DAYS_OF_WEEK.forEach(day => {
            const dayRow = _domElements.availabilityContainer.querySelector(`.day-row[data-day="${day}"]`);
            if (!dayRow) return;

            const checkbox = dayRow.querySelector('.day-checkbox');
            const timeSlotsContainer = dayRow.querySelector('.time-slots');
            
            timeSlotsContainer.innerHTML = ''; 

            if (scheduleData[day] && scheduleData[day].length > 0) {
                if(checkbox) checkbox.checked = true;
                timeSlotsContainer.classList.remove('hidden');
                scheduleData[day].forEach(slot => {
                    const [from, to] = slot.split('-');
                    addTimeSlotElement(timeSlotsContainer, from, to);
                });
            } else {
                if(checkbox) checkbox.checked = false;
                timeSlotsContainer.classList.add('hidden');
                addTimeSlotElement(timeSlotsContainer); 
            }
        });
    }

    function collectAvailabilityData() {
        const schedule = {};
        if (_domElements.walkerRecurringAvailCheckbox) {
            schedule.recurring = _domElements.walkerRecurringAvailCheckbox.checked;
        } else {
            schedule.recurring = false; 
        }

        if (!_domElements.availabilityContainer) return schedule;

        _domElements.availabilityContainer.querySelectorAll('.day-row').forEach(dayRow => {
            const day = dayRow.dataset.day;
            const checkbox = dayRow.querySelector('.day-checkbox');
            if (checkbox && checkbox.checked) {
                const slots = [];
                dayRow.querySelectorAll('.time-slots > div').forEach(slotDiv => {
                    const from = slotDiv.querySelector('.time-from').value;
                    const to = slotDiv.querySelector('.time-to').value;
                    if (from && to) {
                        // Basic validation: "to" time must be after "from" time
                        if (to > from) {
                            slots.push(`${from}-${to}`);
                        } else {
                            console.warn(`[WalkerProfileModule] Invalid time slot for ${day}: ${from} - ${to}. 'To' time must be after 'From' time. Slot skipped.`);
                            // Optionally provide UI feedback here
                        }
                    }
                });
                if (slots.length > 0) {
                    schedule[day] = slots;
                }
            }
        });
        console.log("[WalkerProfileModule] Collected availability data:", schedule);
        return schedule;
    }


    App.WalkerProfile = {
        init: function(supabaseClient, user, profileData, domRefs) {
            _supabase = supabaseClient;
            _currentUser = user;
            _userProfileData = profileData;
            _domElements = domRefs;

            console.log('[WalkerProfileModule] Initialized with profile:', _userProfileData, 'and DOM:', _domElements);

            if (_domElements.walkerContentElement) {
                _domElements.walkerContentElement.classList.remove('hidden');
            } else {
                console.error("[WalkerProfileModule] Walker content element not found.");
                return;
            }

            if (_domElements.walkerDetailsForm) {
                populateWalkerDetailsForm(); 
                _domElements.walkerDetailsForm.addEventListener('submit', handleWalkerDetailsUpdate);
            }
        }
    };

})(window.App = window.App || {});