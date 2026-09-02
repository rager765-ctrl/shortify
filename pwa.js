// PWA Registration and Custom Install Banner Controller for Enly

let deferredPrompt = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((reg) => console.log('Enly PWA ServiceWorker registered:', reg.scope))
                .catch((err) => console.warn('ServiceWorker registration failed:', err));
        });
    }

    // Check if app is already running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return; // Don't show install banner inside installed PWA app

    // 2. Create PWA Banner UI Container
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-banner-container';
    banner.style.display = 'none';

    banner.innerHTML = `
        <div class="pwa-banner-content">
            <div class="pwa-banner-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #d97706;">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
            </div>
            <div class="pwa-banner-text">
                <strong>Install Enly Studio App</strong>
                <span>Instant access to Shortener, QR &amp; Docx Scanner on your home screen</span>
            </div>
            <div class="pwa-banner-actions">
                <button id="pwa-install-btn" class="btn btn-primary" style="padding: 8px 16px; font-size: 13px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: #fff; border: none;">
                    <span>Install App</span>
                </button>
                <button id="pwa-dismiss-btn" class="pwa-close-btn" title="Dismiss">✕</button>
            </div>
        </div>
    `;

    document.body.appendChild(banner);

    const installBtn = document.getElementById('pwa-install-btn');
    const dismissBtn = document.getElementById('pwa-dismiss-btn');

    // Dismiss handler
    dismissBtn.addEventListener('click', () => {
        banner.style.display = 'none';
        sessionStorage.setItem('enly_pwa_dismissed', 'true');
    });

    // 3. Capture native beforeinstallprompt event (Android / Chrome / Edge / Desktop)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        // Only show if user hasn't dismissed in current session
        if (!sessionStorage.getItem('enly_pwa_dismissed')) {
            setTimeout(() => {
                banner.style.display = 'block';
            }, 1000); // Smooth 1s popup delay
        }
    });

    // Install Button Handler
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User PWA prompt outcome: ${outcome}`);
            deferredPrompt = null;
            banner.style.display = 'none';
        } else {
            // iOS Safari guide fallback
            showIosInstallGuide();
        }
    });

    // 4. iOS Safari Install Detection
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos && !sessionStorage.getItem('enly_pwa_dismissed')) {
        setTimeout(() => {
            banner.style.display = 'block';
        }, 1500);
    }

    function showIosInstallGuide() {
        alert("To install Enly on iOS:\n1. Tap the Share button in Safari\n2. Scroll down and tap 'Add to Home Screen'");
    }

    // 5. Hide banner once app is installed
    window.addEventListener('appinstalled', () => {
        banner.style.display = 'none';
        deferredPrompt = null;
        console.log('Enly PWA successfully installed!');
    });
});
