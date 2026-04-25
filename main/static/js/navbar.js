    document.addEventListener('DOMContentLoaded', function() {
        const body = document.body;
        const mobileWrap = document.getElementById('mobileWrap');
        const mobileMenu = document.getElementById('mobileMenu');
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const closeBtn = document.getElementById('closeBtn');
        const overlayNavbar = document.getElementById('overlay-navbar');
        const userAvatarBtn = document.getElementById('userAvatarBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        const openMenu = () => {
            mobileWrap.style.display = 'block';
            requestAnimationFrame(() => {
                document.documentElement.classList.add('mobile-open');
                mobileWrap.setAttribute('aria-hidden', 'false');
                hamburgerBtn.setAttribute('aria-expanded', 'true');
            });
            body.style.overflow = 'hidden';
            const firstLink = mobileMenu.querySelector('a');
            if (firstLink) firstLink.focus();
        };
        
        const closeMenu = () => {
            document.documentElement.classList.remove('mobile-open');
            mobileWrap.setAttribute('aria-hidden', 'true');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
            body.style.overflow = '';
            setTimeout(() => {
                if (!document.documentElement.classList.contains('mobile-open')) {
                    mobileWrap.style.display = 'none';
                }
            }, 320);
            hamburgerBtn.focus();
        };
        
        const toggleMenu = () => {
            const isOpen = document.documentElement.classList.contains('mobile-open');
            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        };
        
        if (hamburgerBtn) {
            hamburgerBtn.addEventListener('click', toggleMenu);
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', closeMenu);
        }
        
        if (overlayNavbar) {
            overlayNavbar.addEventListener('click', closeMenu);
        }
        
        if (mobileWrap) {
            mobileWrap.addEventListener('click', (event) => {
                if (event.target === mobileWrap || event.target === overlayNavbar) {
                    closeMenu();
                }
            });
        }
        
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.getAttribute('href') === '#') {
                    e.preventDefault();
                }
                closeMenu();
            });
        });
        
        if (userAvatarBtn && userDropdown) {
            let dropdownTimeout;
            userAvatarBtn.addEventListener('mouseenter', () => {
                clearTimeout(dropdownTimeout);
                userDropdown.style.display = 'block';
            });
            userAvatarBtn.addEventListener('mouseleave', () => {
                dropdownTimeout = setTimeout(() => {
                    userDropdown.style.display = 'none';
                }, 300);
            });
            userDropdown.addEventListener('mouseenter', () => {
                clearTimeout(dropdownTimeout);
            });
            userDropdown.addEventListener('mouseleave', () => {
                dropdownTimeout = setTimeout(() => {
                    userDropdown.style.display = 'none';
                }, 300);
            });
        }
        
        window.addEventListener('resize', () => {
            if (window.innerWidth > 992) {
                closeMenu();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.documentElement.classList.contains('mobile-open')) {
                closeMenu();
            }
        });
        
        setInitialAuthState();
        checkAuthStatusInBackground();
        setupAuthSync();
        checkUrlTabParameter();
    });
    
    function openAccountTab(event, tabName) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const currentUrl = window.location.pathname;
        if (currentUrl.includes('/account/')) {
            const mobileWrap = document.getElementById('mobileWrap');
            if (mobileWrap && mobileWrap.style.display === 'block') {
                closeMenu();
            }
            const userDropdown = document.getElementById('userDropdown');
            if (userDropdown) {
                userDropdown.style.display = 'none';
            }
            setTimeout(() => {
                if (typeof showTab === 'function') {
                    showTab(tabName);
                    updateUrlWithTab(tabName);
                } else {
                    console.warn('showTab function not available. Navigating to account page.');
                    window.location.href = `/account/?tab=${tabName}`;
                }
            }, 100);
        } else {
            window.location.href = `/account/?tab=${tabName}`;
        }
    }
    
    function updateUrlWithTab(tabName) {
        const url = new URL(window.location);
        url.searchParams.set('tab', tabName);
        window.history.pushState({}, '', url);
    }
    
    function checkUrlTabParameter() {
        const currentUrl = window.location.pathname;
        if (currentUrl.includes('/account/')) {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam && typeof showTab === 'function') {
                setTimeout(() => {
                    showTab(tabParam);
                }, 300);
            }
        }
    }
    
    function setInitialAuthState() {
        const token = localStorage.getItem('auth_token');
        const cachedUserData = localStorage.getItem('cached_user_data');
        hideAllAuthSections();
        if (!token) {
            showSignUp();
            return;
        }
        if (cachedUserData) {
            try {
                const userData = JSON.parse(cachedUserData);
                updateUserUI(userData, true);
            } catch (e) {
                localStorage.removeItem('cached_user_data');
                localStorage.removeItem('user_cache_timestamp');
            }
        }
    }
    
    function showSignUp() {
        const authSection = document.getElementById('authSection');
        const userInfo = document.getElementById('userInfo');
        const mobileAuthSection = document.getElementById('mobileAuthSection');
        const mobileUserInfo = document.getElementById('mobileUserInfo');
        if (authSection) authSection.style.display = 'block';
        if (userInfo) userInfo.style.display = 'none';
        if (mobileAuthSection) mobileAuthSection.style.display = 'block';
        if (mobileUserInfo) mobileUserInfo.style.display = 'none';
    }
    
    function updateUserInfo(userData) {
        const userNameElements = document.querySelectorAll('#dropdownUserName, #mobileUserName');
        const userEmailElements = document.querySelectorAll('#dropdownUserEmail, #mobileUserEmail');
        const avatarElements = document.querySelectorAll('#userAvatar, #dropdownAvatar, #mobileUserAvatar');
        userNameElements.forEach(el => {
            if (el) el.textContent = userData.username || 'User';
        });
        userEmailElements.forEach(el => {
            if (el) el.textContent = userData.email || 'email@example.com';
        });
        if (userData.profile_picture) {
            avatarElements.forEach(el => {
                if (el) el.src = userData.profile_picture;
            });
        }
    }
    
    async function checkAuthStatusInBackground() {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            return;
        }
        try {
            const response = await fetch('/auth/profile/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                localStorage.setItem('cached_user_data', JSON.stringify(data.user));
                localStorage.setItem('user_cache_timestamp', Date.now().toString());
                updateUserUI(data.user);
            } else {
                handleInvalidToken();
            }
        } catch (error) {
            if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('network')) {
                const cachedUserData = localStorage.getItem('cached_user_data');
                if (cachedUserData) {
                    try {
                        const userData = JSON.parse(cachedUserData);
                        updateUserUI(userData, true);
                    } catch (e) {
                        hideAllAuthSections();
                    }
                } else {
                    hideAllAuthSections();
                }
            } else {
                handleInvalidToken();
            }
        }
    }
    
    function handleInvalidToken() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('cached_user_data');
        localStorage.removeItem('user_cache_timestamp');
        showSignUp();
    }
    
    async function checkAuthStatus() {
        await checkAuthStatusInBackground();
    }
    
    function setupAuthSync() {
        window.addEventListener('storage', (event) => {
            if (event.key === 'auth_token' || event.key === 'cached_user_data') {
                setInitialAuthState();
                checkAuthStatusInBackground();
            }
        });
    }
    
    function logout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('cached_user_data');
            localStorage.removeItem('user_cache_timestamp');
            showSignUp();
            window.location.href = '/';
        }
    }
    
    function updateUserUI(userData, fromCache = false) {
        const authSection = document.getElementById('authSection');
        const userInfo = document.getElementById('userInfo');
        const mobileAuthSection = document.getElementById('mobileAuthSection');
        const mobileUserInfo = document.getElementById('mobileUserInfo');
        if (userData) {
            if (authSection) authSection.style.display = 'none';
            if (userInfo) userInfo.style.display = 'block';
            if (mobileAuthSection) mobileAuthSection.style.display = 'none';
            if (mobileUserInfo) mobileUserInfo.style.display = 'block';
            updateUserInfo(userData);
        } else {
            showSignUp();
        }
    }
    
    function hideAllAuthSections() {
        const authSection = document.getElementById('authSection');
        const userInfo = document.getElementById('userInfo');
        const mobileAuthSection = document.getElementById('mobileAuthSection');
        const mobileUserInfo = document.getElementById('mobileUserInfo');
        if (authSection) authSection.style.display = 'none';
        if (userInfo) userInfo.style.display = 'none';
        if (mobileAuthSection) mobileAuthSection.style.display = 'none';
        if (mobileUserInfo) mobileUserInfo.style.display = 'none';
    }