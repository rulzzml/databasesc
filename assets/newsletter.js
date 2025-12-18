
        // State Management
        const state = {
            items: [],
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
            
            // Items Container
            itemsContainer: document.getElementById('itemsContainer'),
            
            // Modal
            itemModal: document.getElementById('itemModal'),
            modalTitle: document.getElementById('modalTitle'),
            itemInput: document.getElementById('itemInput'),
            itemPreview: document.getElementById('itemPreview'),
            previewItem: document.getElementById('previewItem'),
            validationStatus: document.getElementById('validationStatus'),
            itemForm: document.getElementById('itemForm'),
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
            const savedAuth = localStorage.getItem('newsletter_auth');
            const savedPassword = localStorage.getItem('newsletter_password');
            
            if (savedAuth === 'true' && savedPassword) {
                state.isAuthenticated = true;
                state.currentPassword = savedPassword;
                showDashboard();
                loadItems();
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
                    localStorage.setItem('newsletter_auth', 'true');
                    localStorage.setItem('newsletter_password', password);
                    showDashboard();
                    loadItems();
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
            localStorage.removeItem('newsletter_auth');
            localStorage.removeItem('newsletter_password');
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
        async function loadItems() {
            try {
                showLoading();
                
                if (!state.currentPassword) {
                    showError('Not authenticated');
                    return;
                }
                
                const response = await fetch(`${APP_CONFIG.API_URL}/newsletter`, {
                    headers: {
                        'Authorization': `Bearer ${state.currentPassword}`
                    }
                });
                
                const data = await response.json();
                
                console.log('API Response:', data);
                
                if (data.success) {
                    if (Array.isArray(data.items)) {
                        state.items = data.items;
                    } else {
                        state.items = [];
                    }
                    
                    // AMBIL lastUpdateTime DARI GITHUB
                    if (data.lastUpdate) {
                        state.lastUpdateTime = new Date(data.lastUpdate);
                    } else if (data.lastUpdateTime) {
                        state.lastUpdateTime = new Date(data.lastUpdateTime);
                    } else {
                        state.lastUpdateTime = new Date();
                    }
                    
                    renderItems();
                    updateStats();
                    showNotification('Database loaded successfully', 'success');
                } else {
                    throw new Error(data.error || 'Failed to load data');
                }
            } catch (error) {
                console.error('Error loading items:', error);
                showError('Failed to load database: ' + error.message);
                showNotification('Failed to load database', 'error');
            }
        }

        async function saveItems(commitMessage = 'Update newsletter') {
            try {
                if (!state.currentPassword) {
                    throw new Error('Not authenticated');
                }
                
                const response = await fetch(`${APP_CONFIG.API_URL}/newsletter`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        items: state.items,
                        commitMessage: commitMessage,
                        password: state.currentPassword
                    })
                });

                const data = await response.json();
                
                console.log('Save response:', data);
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to save data');
                }
                
                // UPDATE lastUpdateTime SETELAH SAVE
                state.lastUpdateTime = new Date();
                
                return true;
            } catch (error) {
                console.error('Error saving items:', error);
                throw error;
            }
        }

        // UI Functions
        function renderItems() {
            if (!state.items || state.items.length === 0) {
                elements.itemsContainer.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <i class="fas fa-newspaper text-3xl text-gray-400 mb-3"></i>
                        <p class="text-gray-400">No newsletter IDs in database</p>
                        <p class="text-gray-500 text-sm mt-1">Click "Add Item" to add your first newsletter ID</p>
                    </div>
                `;
                return;
            }

            const itemsHTML = state.items.map(item => `
                <div class="item-card glass">
                    <div class="item-text">${item.id}</div>
                    <div class="item-date">Added: ${formatDisplayDate(item.addedDate)}</div>
                </div>
            `).join('');

            elements.itemsContainer.innerHTML = itemsHTML;
        }

        function showLoading() {
            elements.itemsContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p class="mt-2 text-gray-400 text-sm">Loading database...</p>
                </div>
            `;
        }

        function showError(message) {
            elements.itemsContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-exclamation-triangle text-2xl text-red-400 mb-3"></i>
                    <p class="text-red-300">${message}</p>
                    <button onclick="loadItems()" class="btn btn-secondary mt-3">
                        <i class="fas fa-redo mr-2"></i>Try Again
                    </button>
                </div>
            `;
        }

        function updateStats() {
            elements.totalCount.textContent = state.items.length;
            
            // GUNAKAN lastUpdateTime DARI STATE (YANG DIAMBIL DARI GITHUB)
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
            
            const storageKB = (JSON.stringify(state.items).length / 1024).toFixed(2);
            elements.storageUsed.textContent = `${storageKB} KB`;
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

        // VALIDASI NEWSLETTER ID - HARUS DI AKHIRI DENGAN @newsletter
        function validateNewsletterId(itemId) {
            if (!itemId) return 'Newsletter ID is required';
            
            // Cek harus diakhiri dengan @newsletter
            if (!itemId.endsWith('@newsletter')) {
                return 'Newsletter ID must end with @newsletter';
            }
            
            // Hapus @newsletter untuk cek bagian angka
            const numericPart = itemId.replace('@newsletter', '');
            
            // Cek harus hanya angka sebelum @newsletter
            if (!/^\d+$/.test(numericPart)) {
                return 'Newsletter ID must contain only numbers before @newsletter';
            }
            
            // Cek panjang minimal
            if (numericPart.length < 5) {
                return 'Newsletter ID is too short (min 5 numbers before @newsletter)';
            }
            
            // Cek panjang maksimal
            if (numericPart.length > 50) {
                return 'Newsletter ID is too long (max 50 numbers before @newsletter)';
            }
            
            return null; // Valid
        }

        // Modal Functions
        function initModal() {
            elements.addBtn?.addEventListener('click', () => {
                state.currentOperation = 'add';
                showModal('Add Newsletter ID');
            });

            elements.deleteBtn?.addEventListener('click', () => {
                state.currentOperation = 'delete';
                showModal('Delete Newsletter ID');
            });

            elements.closeModal?.addEventListener('click', hideModal);
            elements.cancelModal?.addEventListener('click', hideModal);
            
            // VALIDASI REAL-TIME SAAT INPUT
            elements.itemInput?.addEventListener('input', (e) => {
                const value = e.target.value.trim();
                if (value.length >= 5) {
                    elements.previewItem.textContent = value;
                    elements.itemPreview.classList.remove('hidden');
                    
                    // Tampilkan status validasi
                    const validationError = validateNewsletterId(value);
                    if (validationError) {
                        elements.validationStatus.textContent = `❌ ${validationError}`;
                        elements.validationStatus.className = 'text-xs text-red-400 mt-1';
                    } else {
                        elements.validationStatus.textContent = '✅ Format newsletter ID valid';
                        elements.validationStatus.className = 'text-xs text-green-400 mt-1';
                    }
                } else {
                    elements.itemPreview.classList.add('hidden');
                }
            });

            elements.itemForm?.addEventListener('submit', handleItemOperation);
            
            elements.itemModal.addEventListener('click', (e) => {
                if (e.target === elements.itemModal) {
                    hideModal();
                }
            });
        }

        function showModal(title) {
            elements.modalTitle.textContent = title;
            elements.itemInput.value = '';
            elements.itemPreview.classList.add('hidden');
            elements.validationStatus.textContent = '';
            
            if (state.currentOperation === 'delete') {
                elements.modalSubmitBtn.innerHTML = '<i class="fas fa-trash mr-2"></i>Delete';
                elements.modalSubmitBtn.className = 'btn btn-danger flex-1';
            } else {
                elements.modalSubmitBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Item';
                elements.modalSubmitBtn.className = 'btn btn-success flex-1';
            }
            
            elements.itemModal.classList.add('show');
            setTimeout(() => elements.itemInput.focus(), 100);
        }

        function hideModal() {
            elements.itemModal.classList.remove('show');
        }

        async function handleItemOperation(e) {
            e.preventDefault();
            
            const itemId = elements.itemInput.value.trim();
            const validationError = validateNewsletterId(itemId);
            
            if (validationError) {
                showNotification(validationError, 'error');
                return;
            }

            try {
                if (state.currentOperation === 'add') {
                    // Check if item already exists
                    if (state.items.some(item => item.id === itemId)) {
                        showNotification('This newsletter ID already exists', 'error');
                        return;
                    }
                    
                    // Add new item with current date
                    state.items.push({
                        id: itemId,
                        addedDate: getCurrentDate()
                    });
                    
                    await saveItems(`Add newsletter: ${itemId}`);
                    showNotification(`Newsletter ID ${itemId} added successfully`, 'success');
                } else {
                    // Find index of item to delete
                    const index = state.items.findIndex(item => item.id === itemId);
                    if (index === -1) {
                        showNotification('Newsletter ID not found in database', 'error');
                        return;
                    }
                    
                    state.items.splice(index, 1);
                    await saveItems(`Delete newsletter: ${itemId}`);
                    showNotification(`Newsletter ID ${itemId} deleted successfully`, 'success');
                }
                
                hideModal();
                renderItems();
                updateStats();
            } catch (error) {
                console.error('Operation failed:', error);
                showNotification('Operation failed: ' + error.message, 'error');
            }
        }

        function getCurrentDate() {
            const now = new Date();
            return now.toISOString().split('T')[0];
        }

        // Other Controls
        function initControls() {
            elements.refreshBtn?.addEventListener('click', () => {
                loadItems();
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