// Управление согласием на аналитику Google Analytics.
// Аналитика не загружается до явного согласия пользователя.
const GA_ID = 'G-VQQGBNZLET';
const CONSENT_KEY = 'cookieConsent';
let analyticsInjected = false;

function readConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

function writeConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* Storage may be disabled. */ }
}

function injectGoogleAnalytics() {
    if (analyticsInjected || readConsent() !== 'true') return;

    analyticsInjected = true;
    window[`ga-disable-${GA_ID}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
        window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    document.head.appendChild(script);
}

function disableGoogleAnalytics() {
    window[`ga-disable-${GA_ID}`] = true;
}

function createButton(text, backgroundColor) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    Object.assign(button.style, {
        backgroundColor,
        color: 'white',
        border: 'none',
        padding: '10px 16px',
        borderRadius: '8px',
        fontWeight: 'bold',
        cursor: 'pointer'
    });
    return button;
}

function removeConsentBanner() {
    document.getElementById('cookie-banner')?.remove();
}

function showConsentBanner() {
    removeConsentBanner();

    const banner = document.createElement('section');
    banner.id = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Настройки cookie и аналитики');
    Object.assign(banner.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#1c1c1f',
        color: '#fff',
        padding: '20px 30px',
        borderRadius: '15px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        zIndex: '9999',
        width: '90%',
        maxWidth: '650px',
        border: '1px solid #3a3a40',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    });

    const text = document.createElement('div');
    text.style.cssText = 'flex-grow: 1; font-size: 14px; line-height: 1.5; color: #b0b0b0;';
    const title = document.createElement('strong');
    title.textContent = '🍪 Cookie и аналитика';
    title.style.cssText = 'display: block; color: white; font-size: 16px; margin-bottom: 4px;';
    const description = document.createElement('span');
    description.textContent = 'С вашего согласия сайт использует Google Analytics для анонимной статистики. Выбор можно изменить в любое время кнопкой 🍪.';
    text.append(title, description);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end;';
    const declineButton = createButton('Не разрешать', '#555');
    const acceptButton = createButton('Разрешить', '#4CAF50');

    declineButton.addEventListener('click', () => {
        writeConsent('false');
        disableGoogleAnalytics();
        removeConsentBanner();
    });
    acceptButton.addEventListener('click', () => {
        writeConsent('true');
        removeConsentBanner();
        injectGoogleAnalytics();
    });
    actions.append(declineButton, acceptButton);
    banner.append(text, actions);
    document.body.appendChild(banner);
}

function createConsentSettingsButton() {
    if (document.getElementById('cookie-settings')) return;

    const button = document.createElement('button');
    button.id = 'cookie-settings';
    button.type = 'button';
    button.textContent = '🍪';
    button.title = 'Настройки cookie и аналитики';
    button.setAttribute('aria-label', 'Настройки cookie и аналитики');
    Object.assign(button.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '9998',
        border: '1px solid #3a3a40',
        borderRadius: '50%',
        width: '42px',
        height: '42px',
        backgroundColor: '#1c1c1f',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '20px'
    });
    button.addEventListener('click', showConsentBanner);
    document.body.appendChild(button);
}

document.addEventListener('DOMContentLoaded', () => {
    // The homepage owns consent UI while the game is displayed inside its
    // cabinet. Do not place a second fixed banner inside the CSS3D screen.
    if (window.parent !== window && new URLSearchParams(location.search).get('arcade') === '1') return;
    const consent = readConsent();
    if (consent === 'true') injectGoogleAnalytics();
    else if (consent !== 'false') showConsentBanner();
    else disableGoogleAnalytics();

    createConsentSettingsButton();
});
