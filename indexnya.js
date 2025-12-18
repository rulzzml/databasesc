
        // State Management
        const state = {
            numbers: [],
            isAuthenticated: false,
            currentPassword: null,
            currentOperation: null,
            lastUpdateTime: null
        };

        // Configuration
        const APP_CONFIG = {
            API_URL: "/api",
            DATE_FORMAT: "YYYY-MM-DD"
        };

        // DOM Elements
        const elements = {
            // Navbar
            logoutBtn: document.getElementById('logoutBtn'),
            logoutBtnMobile: document.getElementById('logoutBtnMobile'),
            hamburger: document.getElementById('hamburger'),
            mobileOverlay: document.getElementById('mobileOverlay'),
            mobileMenu: document.getElementById('mobileMenu'),
            
            // Login
            loginPage: document.getElementById('loginPage'),
            loginForm: document.getElementById('loginForm'),
            passwordInput: document.getElementById('password'),
            togglePassword: document.getElementById('togglePassword'),
            loginError: document.getElementById('loginError'),
            
            // Dashboard
            dashboard: document.getElementById('dashboard'),
            refreshBtn: document.getElementById('refreshBtn'),
            addBtn: document.getElementById('addBtn'),
            deleteBtn: document.getElementById('deleteBtn'),
            
            // Stats
            totalCount: document.getElementById('totalCount'),
            lastUpdatedTime: document.getElementById('lastUpdatedTime'),
            lastUpdatedDate: document.getElementById('lastUpdatedDate'),
            storageUsed: document.getElementById('storageUsed'),
            
            // Numbers Container
            numbersContainer: document.getElementById('numbersContainer'),
            
            // Modal
            numberModal: document.getElementById('numberModal'),
            modalTitle: document.getElementById('modalTitle'),
            phoneInput: document.getElementById('phoneInput'),
            phonePreview: document.getElementById('phonePreview'),
            previewNumber: document.getElementById('previewNumber'),
            numberForm: document.getElementById('numberForm'),
            modalSubmitBtn: document.getElementById('modalSubmitBtn'),
            closeModal: document.getElementById('closeModal'),
            cancelModal: document.getElementById('cancelModal')
        };

        // Notification System
        function showNotification(message, type = 'info') {
            const container = document.querySelector('.notification-container');
            
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            const icon = type === 'success' ? 'check-circle' :
                        type === 'error' ? 'exclamation-circle' : 'info-circle';
            
            notification.innerHTML = `
                <div class="flex items-center">
                    <i class="fas fa-${icon} mr-2 ${type === 'success' ? 'text-green-500' : type === 'error' ? 'text-red-500' : 'text-blue-500'}"></i>
                    <span>${message}</span>
                </div>
            `;
            
            container.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'fadeOut 0.5s ease forwards';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 500);
            }, 3000);
        }

        // Toggle password visibility
        function initPasswordToggle() {
            if (elements.togglePassword && elements.passwordInput) {
                elements.togglePassword.addEventListener('click', () => {
                    const type = elements.passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                    elements.passwordInput.setAttribute('type', type);
                    
                    const icon = elements.togglePassword.querySelector('i');
                    if (type === 'text') {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                    } else {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                    }
                });
            }
        }

        // Mobile Menu
        function initMobileMenu() {
            if (elements.hamburger && elements.mobileMenu && elements.mobileOverlay) {
                elements.hamburger.addEventListener('click', () => {
                    elements.hamburger.classList.toggle('active');
                    elements.mobileMenu.classList.toggle('show');
                    elements.mobileOverlay.classList.toggle('show');
                    document.body.style.overflow = elements.mobileMenu.classList.contains('show') ? 'hidden' : '';
                });

                elements.mobileOverlay.addEventListener('click', () => {
                    closeMobileMenu();
                });

                elements.logoutBtnMobile.addEventListener('click', () => {
                    handleLogout();
                    closeMobileMenu();
                });
            }
        }

        function closeMobileMenu() {
            elements.hamburger?.classList.remove('active');
            elements.mobileMenu?.classList.remove('show');
            elements.mobileOverlay?.classList.remove('show');
            document.body.style.overflow = '';
        }

        // Login System
        function initLogin() {
            const savedAuth = localStorage.getItem('db_auth');
            const savedPassword = localStorage.getItem('db_password');
            
            if (savedAuth === 'true' && savedPassword) {
                state.isAuthenticated = true;
                state.currentPassword = savedPassword;
                showDashboard();
                loadNumbers();
            }

            if (elements.loginForm) {
                elements.loginForm.addEventListener('submit', handleLogin);
            }

            elements.logoutBtn?.addEventListener('click', handleLogout);
            elements.logoutBtnMobile?.addEventListener('click', handleLogout);
            
            initPasswordToggle();
        }

        async function handleLogin(e) {
            e.preventDefault();
            const password = elements.passwordInput.value.trim();

            if (!password) {
                showLoginError('Password is required');
                return;
            }

            try {
                const response = await fetch(`${APP_CONFIG.API_URL}/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ password: password })
                });

                const data = await response.json();
                
                if (data.success) {
                    state.isAuthenticated = true;
                    state.currentPassword = password;
                    localStorage.setItem('db_auth', 'true');
                    localStorage.setItem('db_password', password);
                    showDashboard();
                    loadNumbers();
                    showNotification('Login successful!', 'success');
                } else {
                    showLoginError(data.error || 'Invalid password');
                }
            } catch (error) {
                console.error('Login error:', error);
                showLoginError('Login failed. Please try again.');
            }
        }

        function showLoginError(message) {
            elements.loginError.querySelector('span').textContent = message;
            elements.loginError.classList.remove('hidden');
            setTimeout(() => {
                elements.loginError.classList.add('hidden');
            }, 3000);
        }

        function handleLogout() {
            state.isAuthenticated = false;
            state.currentPassword = null;
            localStorage.removeItem('db_auth');
            localStorage.removeItem('db_password');
            showLogin();
            closeMobileMenu();
            showNotification('Logged out successfully', 'info');
        }

        function showLogin() {
            elements.loginPage.classList.remove('hidden');
            elements.dashboard.classList.add('hidden');
            if (elements.loginForm) elements.loginForm.reset();
            elements.passwordInput.setAttribute('type', 'password');
            const icon = elements.togglePassword.querySelector('i');
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }

        function showDashboard() {
            elements.loginPage.classList.add('hidden');
            elements.dashboard.classList.remove('hidden');
        }

        // API Functions
        async function loadNumbers() {
            try {
                showLoading();
                
                if (!state.currentPassword) {
                    showError('Not authenticated');
                    return;
                }
                
                const response = await fetch(`${APP_CONFIG.API_URL}/numbers`, {
                    headers: {
                        'Authorization': `Bearer ${state.currentPassword}`
                    }
                });
                
                const data = await response.json();
                
                console.log('API Response:', data);
                
                if (data.success) {
                    if (Array.isArray(data.numbers)) {
                        if (data.numbers.length > 0 && typeof data.numbers[0] === 'object' && data.numbers[0].number) {
                            state.numbers = data.numbers;
                        } else {
                            state.numbers = data.numbers.map(num => ({
                                number: num,
                                addedDate: getCurrentDate()
                            }));
                        }
                    } else {
                        state.numbers = [];
                    }
                    
                    if (data.lastUpdateTime) {
                        state.lastUpdateTime = new Date(data.lastUpdateTime);
                    } else {
                        state.lastUpdateTime = new Date();
                    }
                    
                    renderNumbers();
                    updateStats();
                    showNotification('Database loaded successfully', 'success');
                } else {
                    throw new Error(data.error || 'Failed to load data');
                }
            } catch (error) {
                console.error('Error loading numbers:', error);
                showError('Failed to load database: ' + error.message);
                showNotification('Failed to load database', 'error');
            }
        }

        async function saveNumbers(commitMessage = 'Update numbers') {
            try {
                if (!state.currentPassword) {
                    throw new Error('Not authenticated');
                }
                
                const response = await fetch(`${APP_CONFIG.API_URL}/numbers`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        numbers: state.numbers,
                        commitMessage: commitMessage,
                        password: state.currentPassword
                    })
                });

                const data = await response.json();
                
                console.log('Save response:', data);
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to save data');
                }
                
                state.lastUpdateTime = new Date();
                
                return true;
            } catch (error) {
                console.error('Error saving numbers:', error);
                throw error;
            }
        }

        // UI Functions
        function renderNumbers() {
            if (!state.numbers || state.numbers.length === 0) {
                elements.numbersContainer.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <i class="fas fa-database text-3xl text-gray-400 mb-3"></i>
                        <p class="text-gray-400">No phone numbers in database</p>
                        <p class="text-gray-500 text-sm mt-1">Click "Add Number" to add your first number</p>
                    </div>
                `;
                return;
            }

            const numbersHTML = state.numbers.map(item => `
                <div class="number-card glass">
                    <div class="number-text">${formatPhoneNumber(item.number)}</div>
                    <div class="number-date">Added: ${formatDisplayDate(item.addedDate)}</div>
                </div>
            `).join('');

            elements.numbersContainer.innerHTML = numbersHTML;
        }

        function showLoading() {
            elements.numbersContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p class="mt-2 text-gray-400 text-sm">Loading database...</p>
                </div>
            `;
        }

        function showError(message) {
            elements.numbersContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-exclamation-triangle text-2xl text-red-400 mb-3"></i>
                    <p class="text-red-300">${message}</p>
                    <button onclick="loadNumbers()" class="btn btn-secondary mt-3">
                        <i class="fas fa-redo mr-2"></i>Try Again
                    </button>
                </div>
            `;
        }

        function updateStats() {
            elements.totalCount.textContent = state.numbers.length;
            
            if (state.lastUpdateTime) {
                elements.lastUpdatedTime.textContent = state.lastUpdateTime.toLocaleTimeString();
                
                const options = { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                };
                elements.lastUpdatedDate.textContent = state.lastUpdateTime.toLocaleDateString('id-ID', options);
            } else {
                const now = new Date();
                elements.lastUpdatedTime.textContent = now.toLocaleTimeString();
                
                const options = { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                };
                elements.lastUpdatedDate.textContent = now.toLocaleDateString('id-ID', options);
            }
            
            const storageKB = (JSON.stringify(state.numbers).length / 1024).toFixed(2);
            elements.storageUsed.textContent = `${storageKB} KB`;
        }

        function formatPhoneNumber(number) {
            const cleaned = number.replace(/\D/g, '');
            if (cleaned.length === 0) return number;
            
            if (cleaned.startsWith('62')) {
                const rest = cleaned.slice(2);
                return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
            }
            else if (cleaned.startsWith('1')) {
                const rest = cleaned.slice(1);
                return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
            }
            else {
                const countryCode = cleaned.match(/^\d{1,3}/)?.[0] || '';
                const rest = cleaned.slice(countryCode.length);
                return `+${countryCode} ${rest}`;
            }
        }

        function getCurrentDate() {
            const now = new Date();
            return now.toISOString().split('T')[0];
        }

        function formatDisplayDate(dateString) {
            if (!dateString) return 'Unknown date';
            
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
            } catch (e) {
                return dateString;
            }
        }

        function validatePhoneNumber(number) {
            const cleaned = number.replace(/\D/g, '');
            
            if (!cleaned) return 'Phone number is required';
            if (cleaned.length < 8) return 'Number is too short (min 8 digits)';
            if (cleaned.length > 15) return 'Number is too long (max 15 digits)';
            
            return null;
        }

        // Modal Functions
        function initModal() {
            elements.addBtn?.addEventListener('click', () => {
                state.currentOperation = 'add';
                showModal('Add Phone Number');
            });

            elements.deleteBtn?.addEventListener('click', () => {
                state.currentOperation = 'delete';
                showModal('Delete Phone Number');
            });

            elements.closeModal?.addEventListener('click', hideModal);
            elements.cancelModal?.addEventListener('click', hideModal);
            
            elements.phoneInput?.addEventListener('input', (e) => {
                const value = e.target.value.replace(/\D/g, '');
                if (value.length >= 8) {
                    const formatted = formatPhoneNumber(value);
                    elements.previewNumber.textContent = formatted;
                    elements.phonePreview.classList.remove('hidden');
                } else {
                    elements.phonePreview.classList.add('hidden');
                }
            });

            elements.numberForm?.addEventListener('submit', handleNumberOperation);
            
            elements.numberModal.addEventListener('click', (e) => {
                if (e.target === elements.numberModal) {
                    hideModal();
                }
            });
        }

        function showModal(title) {
            elements.modalTitle.textContent = title;
            elements.phoneInput.value = '';
            elements.phonePreview.classList.add('hidden');
            
            if (state.currentOperation === 'delete') {
                elements.modalSubmitBtn.innerHTML = '<i class="fas fa-trash mr-2"></i>Delete';
                elements.modalSubmitBtn.className = 'btn btn-danger flex-1';
            } else {
                elements.modalSubmitBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Number';
                elements.modalSubmitBtn.className = 'btn btn-success flex-1';
            }
            
            elements.numberModal.classList.add('show');
            setTimeout(() => elements.phoneInput.focus(), 100);
        }

        function hideModal() {
            elements.numberModal.classList.remove('show');
        }

        async function handleNumberOperation(e) {
            e.preventDefault();
            
            const number = elements.phoneInput.value.replace(/\D/g, '');
            const validationError = validatePhoneNumber(number);
            
            if (validationError) {
                showNotification(validationError, 'error');
                return;
            }

            try {
                if (state.currentOperation === 'add') {
                    if (state.numbers.some(item => item.number === number)) {
                        showNotification('This number already exists', 'error');
                        return;
                    }
                    
                    state.numbers.push({
                        number: number,
                        addedDate: getCurrentDate()
                    });
                    
                    await saveNumbers(`Add number: ${number}`);
                    showNotification(`Number ${formatPhoneNumber(number)} added successfully`, 'success');
                } else {
                    const index = state.numbers.findIndex(item => item.number === number);
                    if (index === -1) {
                        showNotification('Number not found in database', 'error');
                        return;
                    }
                    
                    state.numbers.splice(index, 1);
                    await saveNumbers(`Delete number: ${number}`);
                    showNotification(`Number ${formatPhoneNumber(number)} deleted successfully`, 'success');
                }
                
                hideModal();
                renderNumbers();
                updateStats();
            } catch (error) {
                console.error('Operation failed:', error);
                showNotification('Operation failed: ' + error.message, 'error');
            }
        }

        // Other Controls
        function initControls() {
            elements.refreshBtn?.addEventListener('click', () => {
                loadNumbers();
                showNotification('Refreshing database...', 'info');
            });
        }

        // Initialize
        function init() {
            document.getElementById('currentYear').textContent = new Date().getFullYear();
            
            initMobileMenu();
            initLogin();
            initModal();
            initControls();
            
            window.addEventListener('resize', () => {
                if (window.innerWidth >= 769) {
                    closeMobileMenu();
                }
            });
        }

        // Start the app
        document.addEventListener('DOMContentLoaded', init);
