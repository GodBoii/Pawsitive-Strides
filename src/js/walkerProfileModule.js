// js/walkerProfileModule.js

(function(App) {
    'useASTRICT';

    let _supabase;
    let _currentUser;
    let _userProfileData;
    let _domElements = {}; // { walkerContentElement, walkerDetailsForm, walkerAgeInput, ..., walkerMessageElement, availabilityContainer, walkerRecurringAvailCheckbox }
    const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
        _domElements.walkerMessageElement.style.color = 'inherit';

        const formData = new FormData(_domElements.walkerDetailsForm);
        const availabilitySchedule = collectAvailabilityData();

        const updates = {
            // Age is usually set at signup and not editable, or handled separately
            // age: formData.get('age') ? parseInt(formData.get('age'), 10) : null,
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
            _domElements.walkerMessageElement.style.color = 'green';
            _userProfileData = { ..._userProfileData, ...updatedProfile }; // Update local cache
            console.log("[WalkerProfileModule] Walker details updated locally:", _userProfileData);

        } catch (error) {
            console.error("[WalkerProfileModule] Error updating walker details:", error);
            _domElements.walkerMessageElement.textContent = `Error: ${error.message}`;
            _domElements.walkerMessageElement.style.color = 'red';
        }
    }

    // --- Availability UI Functions ---
    function initializeAvailabilityUI() {
        if (!_domElements.availabilityContainer) return;
        _domElements.availabilityContainer.innerHTML = ''; // Clear previous content

        DAYS_OF_WEEK.forEach(day => {
            const dayRow = window.pawsitiveCommon.createSafeElement('div', { className: 'day-row mb-3', 'data-day': day });
            
            const headerDiv = window.pawsitiveCommon.createSafeElement('div', { className: 'flex items-center mb-1' });
            const checkbox = window.pawsitiveCommon.createSafeElement('input', { type: 'checkbox', id: `avail-${day.toLowerCase()}`, className: 'day-checkbox mr-2 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500' });
            const label = window.pawsitiveCommon.createSafeElement('label', { htmlFor: `avail-${day.toLowerCase()}`, className: 'text-sm font-medium text-gray-700' }, day);
            headerDiv.append(checkbox, label);
            dayRow.appendChild(headerDiv);

            const timeSlotsContainer = window.pawsitiveCommon.createSafeElement('div', { className: 'time-slots pl-6 space-y-2 hidden' }); // Initially hidden
            dayRow.appendChild(timeSlotsContainer);
            addTimeSlotElement(timeSlotsContainer); // Add one empty slot by default

            checkbox.addEventListener('change', function() {
                timeSlotsContainer.classList.toggle('hidden', !this.checked);
                if (!this.checked) { // If unchecking, clear slots for that day
                    timeSlotsContainer.innerHTML = '';
                    addTimeSlotElement(timeSlotsContainer); // Add back one empty slot
                }
            });

            _domElements.availabilityContainer.appendChild(dayRow);
        });
        // Add recurring checkbox if it's part of the DOM structure passed
        if (_domElements.walkerRecurringAvailCheckbox) {
             // Ensure it's visible and correctly labeled.
             // You might need to append it after the DAYS_OF_WEEK loop if it's not already in HTML.
        }
    }
    
    function formatTimeDisplay(time24h) { // e.g., "09:30"
        if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return 'Invalid Time';
        const [hourStr, minuteStr] = time24h.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        if (isNaN(hour) || isNaN(minute)) return 'Invalid Time';

        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12; // Convert 0 and 12 to 12
        return `${h12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
    }

    function createTimeOption(timeValue, displayValue, selectedValue) {
        const option = window.pawsitiveCommon.createSafeElement('option', { value: timeValue }, displayValue);
        if (timeValue === selectedValue) {
            option.selected = true;
        }
        return option;
    }

    function populateTimeSelect(selectElement, selectedValue = '') {
        selectElement.innerHTML = ''; // Clear existing options
        selectElement.appendChild(window.pawsitiveCommon.createSafeElement('option', { value: '' }, selectElement.classList.contains('time-from') ? 'From' : 'To'));
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const timeVal = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                selectElement.appendChild(createTimeOption(timeVal, formatTimeDisplay(timeVal), selectedValue));
            }
        }
    }

    function addTimeSlotElement(container, fromValue = '', toValue = '') {
        const slotDiv = window.pawsitiveCommon.createSafeElement('div', { className: 'flex items-center space-x-2 mb-1' });
        const fromSelect = window.pawsitiveCommon.createSafeElement('select', { className: 'time-from input-field focus:ring-purple-500 text-sm py-1 px-2 w-1/3' });
        const toSpan = window.pawsitiveCommon.createSafeElement('span', { className: 'text-sm'}, 'to');
        const toSelect = window.pawsitiveCommon.createSafeElement('select', { className: 'time-to input-field focus:ring-purple-500 text-sm py-1 px-2 w-1/3' });
        
        populateTimeSelect(fromSelect, fromValue);
        populateTimeSelect(toSelect, toValue);

        const addButton = window.pawsitiveCommon.createSafeElement('button', { type: 'button', className: 'add-time-slot-btn text-sm text-purple-600 hover:text-purple-800 focus:outline-none' }, '+');
        addButton.addEventListener('click', () => addTimeSlotElement(container));
        
        slotDiv.append(fromSelect, toSpan, toSelect, addButton);

        // Add remove button only if it's not the very first slot or if it has values (meaning it's not a fresh template slot)
        if (container.children.length > 0 || fromValue || toValue) {
            const removeButton = window.pawsitiveCommon.createSafeElement('button', { type: 'button', className: 'remove-time-slot-btn text-sm text-red-600 hover:text-red-800 ml-1 focus:outline-none' }, '×');
            removeButton.addEventListener('click', () => {
                // Ensure at least one slot remains for adding new times if all are removed
                if (container.children.length > 1) {
                    slotDiv.remove();
                } else { // If it's the last one, just clear its values
                    populateTimeSelect(fromSelect, '');
                    populateTimeSelect(toSelect, '');
                }
            });
            slotDiv.appendChild(removeButton);
        }
        container.appendChild(slotDiv);
    }
    
    function loadAvailabilitySchedule(scheduleData) { // scheduleData is JS object
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
            
            timeSlotsContainer.innerHTML = ''; // Clear default/previous slots

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
                addTimeSlotElement(timeSlotsContainer); // Add one empty slot if day is not active
            }
        });
    }

    function collectAvailabilityData() {
        const schedule = {};
        if (_domElements.walkerRecurringAvailCheckbox) {
            schedule.recurring = _domElements.walkerRecurringAvailCheckbox.checked;
        } else {
            schedule.recurring = false; // Default if checkbox not present
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
                        slots.push(`${from}-${to}`);
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
                populateWalkerDetailsForm(); // This will also call initializeAvailabilityUI and loadAvailabilitySchedule
                _domElements.walkerDetailsForm.addEventListener('submit', handleWalkerDetailsUpdate);
            }
        }
    };

})(window.App = window.App || {});