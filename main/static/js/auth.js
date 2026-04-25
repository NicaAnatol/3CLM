 function createParticles() {
            const particlesContainer = document.getElementById('particles');
            const particleCount = 20;
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.classList.add('particle');
                
                const size = Math.random() * 6 + 2;
                const x = Math.random() * 100;
                const duration = Math.random() * 15 + 10;
                const delay = Math.random() * 5;
                
                particle.style.width = `${size}px`;
                particle.style.height = `${size}px`;
                particle.style.left = `${x}%`;
                particle.style.top = `100%`;
                particle.style.animationDuration = `${duration}s`;
                particle.style.animationDelay = `${delay}s`;
                
                particlesContainer.appendChild(particle);
            }
        }

        function showRegister() {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
            document.getElementById('loginTabBtn').classList.remove('active');
            document.getElementById('registerTabBtn').classList.add('active');
            clearMessages();
        }

        function showLogin() {
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('registerTabBtn').classList.remove('active');
            document.getElementById('loginTabBtn').classList.add('active');
            clearMessages();
        }

        function clearMessages() {
            document.getElementById('loginMessage').style.display = 'none';
            document.getElementById('registerMessage').style.display = 'none';
        }

        function showMessage(element, message, type) {
            element.textContent = message;
            element.className = `message ${type}`;
            element.style.display = 'block';
        }

        function checkPasswordStrength(password) {
            const strengthMeter = document.getElementById('passwordStrength');
            const strength = calculatePasswordStrength(password);
            
            strengthMeter.className = 'strength-meter';
            if (password.length > 0) {
                if (strength < 3) {
                    strengthMeter.classList.add('weak');
                } else if (strength < 5) {
                    strengthMeter.classList.add('medium');
                } else {
                    strengthMeter.classList.add('strong');
                }
            }
        }

        function calculatePasswordStrength(password) {
            let strength = 0;
            if (password.length >= 8) strength++;
            if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
            if (password.match(/\d/)) strength++;
            if (password.match(/[^a-zA-Z0-9]/)) strength++;
            if (password.length >= 12) strength++;
            return strength;
        }

        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const loading = document.getElementById('loginLoading');
            const message = document.getElementById('loginMessage');
            const submitBtn = this.querySelector('button[type="submit"]');

            if (!email || !password) {
                showMessage(message, 'Please fill in all fields', 'error');
                return;
            }

            loading.style.display = 'block';
            message.style.display = 'none';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/auth/login/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showMessage(message, ' Login successful! Redirecting...', 'success');
                    
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('cached_user_data', JSON.stringify(data.user));
                    localStorage.setItem('user_cache_timestamp', Date.now().toString());
                    
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                } else {
                    showMessage(message, ` ${data.error || 'Login error'}`, 'error');
                }
            } catch (error) {
                showMessage(message, ' Connection error to server', 'error');
            } finally {
                loading.style.display = 'none';
                submitBtn.disabled = false;
            }
        });

        document.getElementById('registerForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const agreeTerms = document.getElementById('agreeTerms').checked;
            const loading = document.getElementById('registerLoading');
            const message = document.getElementById('registerMessage');
            const submitBtn = document.getElementById('registerSubmitBtn');

            if (!username || !email || !password) {
                showMessage(message, 'Please fill in all fields', 'error');
                return;
            }

            if (!agreeTerms) {
                showMessage(message, 'You must accept the Terms and Conditions', 'error');
                return;
            }

            if (password.length < 6) {
                showMessage(message, 'Password must be at least 6 characters', 'error');
                return;
            }

            loading.style.display = 'block';
            message.style.display = 'none';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/auth/register/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: username,
                        email: email,
                        password: password
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showMessage(message, 'Account created successfully! Logging you in...', 'success');
                    
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('cached_user_data', JSON.stringify(data.user));
                    localStorage.setItem('user_cache_timestamp', Date.now().toString());
                    
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1500);
                } else {
                    showMessage(message, ` ${data.error || 'Registration error'}`, 'error');
                }
            } catch (error) {
                showMessage(message, ' Connection error to server', 'error');
            } finally {
                loading.style.display = 'none';
                submitBtn.disabled = false;
            }
        });
        function goBack() {
                const referrer = document.referrer;
                const currentOrigin = window.location.origin;
                   if (referrer && referrer.startsWith(currentOrigin)) {
                        if (referrer.includes('/account') || referrer.includes('/profile')) {
                            const token = localStorage.getItem('auth_token');
                            if (!token) {
                            window.location.href = '/';
                            return;
                    }
            }
            window.history.back();
            } else {
            window.location.href = '/';
           }
        }
        function checkAuth() {
            const token = localStorage.getItem('auth_token');
            if (token) {
                fetch('/auth/profile/', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.href = '/';
                    } else {
                        localStorage.removeItem('auth_token');
                        localStorage.removeItem('cached_user_data');
                        localStorage.removeItem('user_cache_timestamp');
                    }
                })
                .catch(() => {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('cached_user_data');
                    localStorage.removeItem('user_cache_timestamp');
                });
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            createParticles();
            checkAuth();
        });