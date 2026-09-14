import { getMode, setMode, readPreference } from '../../experience.js';

// A query string alone must not turn a standalone page into an embedded game.
// The real arcade screen is an iframe, while a direct visit has parent === window.
const embedded = window.parent !== window && new URLSearchParams(location.search).get('arcade') === '1';
const playButton = document.getElementById('txt-play-main');
let siteLanguage = readPreference('siteLang', navigator.language.startsWith('ru') ? 'ru' : 'en');
let translateControls = () => {};
const exit = document.getElementById('exit-game');
function translateExit() { exit.textContent = siteLanguage === 'en' ? 'Exit game' : 'Выйти из игры'; }
translateExit();
exit.addEventListener('click', () => {
    window.dispatchEvent(new Event('save-game-session'));
    if (embedded) parent.postMessage({ type: 'arcade-exit' }, location.origin);
    else location.assign('../../');
});

function announceReady() {
    if (!playButton) return;
    // The game script keeps this button disabled until every image is ready.
    // Notify the cabinet without pressing Play: the menu must remain visible
    // until the visitor explicitly starts the game.
    const announce = () => {
        if (!playButton.disabled) {
            if (embedded) parent.postMessage({ type: 'game-ready' }, location.origin);
            return true;
        }
        return false;
    };
    if (!announce()) {
        const observer = new MutationObserver(() => {
            if (announce()) observer.disconnect();
        });
        observer.observe(playButton, { attributes: true, attributeFilter: ['disabled'] });
        window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }
}

if (embedded) {
    if (document.readyState === 'complete') announceReady();
    else window.addEventListener('DOMContentLoaded', announceReady, { once: true });
}

if (embedded) {
    const applyMode = mode => {
        document.body.classList.toggle('cabinet-game', mode === 'creative');
        window.dispatchEvent(new Event('resize'));
    };
    applyMode(getMode());
    window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== parent) return;
        if (event.data?.type === 'site-mode' && ['creative', 'normal'].includes(event.data.mode)) applyMode(event.data.mode);
        if (event.data?.type === 'site-language' && ['ru', 'en'].includes(event.data.language)) {
            siteLanguage = event.data.language;
            translateExit();
            document.querySelector(`[data-action="set-language"][data-language="${siteLanguage}"]`)?.click();
        }
    });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') exit.click();
    });
} else {
    const controls = document.createElement('nav');
    controls.className = 'site-game-controls';
    const english = readPreference('siteLang', navigator.language.startsWith('ru') ? 'ru' : 'en') === 'en';
    controls.setAttribute('aria-label', english ? 'Site navigation' : 'Навигация сайта');
    const modeGroup = document.createElement('div');
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', english ? 'Site mode' : 'Режим сайта');
    for (const mode of ['creative', 'normal']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mode = mode;
        modeGroup.appendChild(button);
    }
    controls.appendChild(modeGroup);
    document.body.append(controls);
    document.body.classList.add('standalone-game');
    const buttons = controls.querySelectorAll('button');
    const refresh = () => {
        const english = siteLanguage === 'en';
        controls.setAttribute('aria-label', english ? 'Site navigation' : 'Навигация сайта');
        controls.querySelector('div').setAttribute('aria-label', english ? 'Site mode' : 'Режим сайта');
        buttons.forEach(button => {
            button.setAttribute('aria-pressed', String(getMode() === button.dataset.mode));
            button.textContent = button.dataset.mode === 'creative' ? (english ? 'Creative' : 'Творческий') : (english ? 'Normal' : 'Обычный');
        });
    };
    translateControls = refresh;
    buttons.forEach(button => button.addEventListener('click', () => {
        const next = button.dataset.mode;
        setMode(next);
        refresh();
        if (next === 'creative') {
            window.dispatchEvent(new Event('save-game-session'));
            location.assign('../../?resume=1');
        }
    }));
    const fit = () => {
        const height = Math.ceil(controls.getBoundingClientRect().height) + 16;
        document.body.style.setProperty('--site-nav-height', `${height}px`);
        window.dispatchEvent(new Event('resize'));
    };
    new ResizeObserver(fit).observe(controls);
    window.addEventListener('storage', refresh);
    refresh();
}
new MutationObserver(() => {
    const lang = document.documentElement.lang;
    if (['ru', 'en'].includes(lang)) { siteLanguage = lang; translateExit(); translateControls(); }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
window.dispatchEvent(new Event('resize'));
