import { getMode, setMode, readPreference } from '../../experience.js';

const embedded = new URLSearchParams(location.search).get('arcade') === '1';
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

function autoStart() {
    if (!playButton) return;
    // The game script keeps this button disabled until every image is ready.
    // Use the existing start handler after DOMContentLoaded registered it.
    const start = () => {
        if (!playButton.disabled) {
            playButton.click();
            if (embedded) parent.postMessage({ type: 'game-ready' }, location.origin);
            return true;
        }
        return false;
    };
    if (!start()) {
        const observer = new MutationObserver(() => {
            if (start()) observer.disconnect();
        });
        observer.observe(playButton, { attributes: true, attributeFilter: ['disabled'] });
        window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }
}

if (embedded || new URLSearchParams(location.search).get('play') === '1') {
    if (document.readyState === 'complete') autoStart();
    else window.addEventListener('DOMContentLoaded', autoStart, { once: true });
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
    controls.innerHTML = '<div role="group"><button type="button" data-mode="creative"></button><button type="button" data-mode="normal"></button></div>';
    controls.querySelector('div').setAttribute('aria-label', english ? 'Site mode' : 'Режим сайта');
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
