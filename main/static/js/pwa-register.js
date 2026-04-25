
function showOfflineNotification() {
    if (!document.getElementById('offline-notification')) {
        const notification = document.createElement('div');
        notification.id = 'offline-notification';
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideDown 0.3s ease;
        `;
        
        notification.innerHTML = `
            <i class="fas fa-wifi-slash"></i>
            <span>You are currently offline. Some features may be limited.</span>
        `;
        
        document.body.appendChild(notification);
        
                setTimeout(() => {
            hideOfflineNotification();
        }, 5000);
    }
}

function hideOfflineNotification() {
    const notification = document.getElementById('offline-notification');
    if (notification) {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }
}

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        window.deferredPrompt = event;
        
                showInstallButton();
    });
}

function showInstallButton() {
    const installButton = document.createElement('button');
    installButton.id = 'install-pwa-btn';
    installButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 600;
        z-index: 1000;
        animation: fadeIn 0.3s ease;
    `;
    
    installButton.innerHTML = `
        <i class="fas fa-download"></i>
        <span>Install ELMC 3D</span>
    `;
    
    installButton.addEventListener('click', async () => {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            const { outcome } = await window.deferredPrompt.userChoice;
                        window.deferredPrompt = null;
            installButton.remove();
        }
    });
    
    document.body.appendChild(installButton);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
                       navigator.serviceWorker.register('/static/pwa/serviceworker.js', { scope: '/' })
                .then(function(registration) { 
                    if (!navigator.onLine) {
                        showOfflineNotification();
                    }
                    window.addEventListener('online', () => {
                        hideOfflineNotification();
                    });
                    window.addEventListener('offline', () => {
                        showOfflineNotification();
                    });
                    setupInstallPrompt();
                    
                })
                .catch(function(error) {
                    console.log('ServiceWorker registration failed:', error);
                });
        });
    }
}

function addPWAStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateX(-50%) translateY(0); opacity: 1; }
            to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', function() {
    addPWAStyles();
    registerServiceWorker();
});