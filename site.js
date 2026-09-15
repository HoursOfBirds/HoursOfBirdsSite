import { getMode, setMode, readPreference, writePreference } from './experience.js';
import { HomeAudio } from './home-audio.js';

const texts = {
    ru: { play: '🎮 Игра «Покорми Птиц!»', creative: 'Творческий', normal: 'Обычный', cancel: 'Отмена', retry: 'Повторить', loading: 'Загрузка леса…', error: 'Не удалось загрузить 3D-лес. Игра доступна по кнопке «Играть».', title: 'Покорми птиц', description: 'Wow! Основной сайт всё ещё в разработке. Но вы уже можете поиграть в игру или посетить официальные соцсети проекта!', hide: 'Скрыть', show: 'Показать', music: 'Музыка', sounds: 'Звуки', volume: 'Громкость', volumeTitle: 'Настройка громкости', close: 'Закрыть', on: 'вкл', off: 'выкл' },
    en: { play: '🎮 Play «Feed the Birds!»', creative: 'Creative', normal: 'Normal', cancel: 'Cancel', retry: 'Retry', loading: 'Loading forest…', error: 'The 3D forest could not load. Use Play to open the game.', title: 'Feed the Birds', description: "Wow! The main website is still under development. But you can already play the game or visit the project's official social networks!", hide: 'Hide', show: 'Show', music: 'Music', sounds: 'Sounds', volume: 'Volume', volumeTitle: 'Volume settings', close: 'Close', on: 'on', off: 'off' }
};
const storedLanguage = readPreference('siteLang', navigator.language.startsWith('ru') ? 'ru' : 'en');
let language = ['ru', 'en'].includes(storedLanguage) ? storedLanguage : 'ru';
let mode = getMode();
let forest;
let state = 'idle';
let frame;
let forestLoad;
let forestGeneration = 0;
let panelCollapsedByUser = false;
let panelCollapsedForFlight = false;
const gameUrl = new URL('games/bird_feeder/', location.href);
const play = document.getElementById('btn-game');
const status = document.getElementById('scene-status');
const statusText = document.getElementById('status-text');
const retry = document.getElementById('retry-scene');
const back = document.getElementById('return-forest');
const progress = document.getElementById('scene-progress');
const panel = document.getElementById('main-panel');
const panelToggle = document.getElementById('toggle-panel');
const audio = new HomeAudio(() => translate());

function translate() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-text]').forEach(element => { element.textContent = texts[language][element.dataset.text]; });
    document.querySelectorAll('[data-site-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.siteLanguage === language)));
    if (state === 'loading' || state === 'error') statusText.textContent = texts[language][state];
    const panelCollapsed = panelCollapsedByUser || panelCollapsedForFlight;
    panelToggle.textContent = texts[language][panelCollapsed ? 'show' : 'hide'];
    panelToggle.setAttribute('aria-expanded', String(!panelCollapsed));
    document.querySelector('.mode-switch').setAttribute('aria-label', language === 'ru' ? 'Режим сайта' : 'Site mode');
    document.querySelector('.language-switch').setAttribute('aria-label', language === 'ru' ? 'Язык' : 'Language');
    document.querySelector('.primary-nav').setAttribute('aria-label', language === 'ru' ? 'Главное меню' : 'Main menu');
    progress.setAttribute('aria-label', texts[language].loading);
    if (frame) frame.title = texts[language].title;
    for (const name of ['music', 'sounds']) {
        const channel = audio.channels[name];
        const button = document.getElementById(`${name}-toggle`);
        button.textContent = `${texts[language][name]} ${texts[language][channel.enabled ? 'on' : 'off']}`;
        button.setAttribute('aria-pressed', String(channel.enabled));
    }
    frame?.contentWindow?.postMessage({ type: 'site-language', language }, location.origin);
}

function applyPanelState() {
    const collapsed = panelCollapsedByUser || panelCollapsedForFlight;
    panel.classList.toggle('is-collapsed', collapsed);
    panel.setAttribute('aria-hidden', String(collapsed));
    if (collapsed && panel.contains(document.activeElement)) document.activeElement.blur();
    translate();
}

function syncMode() {
    const previousMode = mode;
    mode = getMode();
    document.body.dataset.mode = mode;
    document.querySelectorAll('button[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    forest?.setMode(mode);
    play.setAttribute('aria-disabled', String(state === 'loading' && mode === 'creative'));
    if (mode === 'creative' && !forest && state !== 'arcade') {
        void ensureForest();
    } else if (mode === 'normal' && previousMode === 'creative' && ['loading', 'forest', 'error'].includes(state)) {
        cancelForestLoad();
    }
    if (state === 'arcade') {
        if (mode === 'creative') forest?.showCabinet();
        frame?.contentWindow?.postMessage({ type: 'site-mode', mode }, location.origin);
    }
}

function onState(next, done) {
    state = next;
    if (next === 'flight') panelCollapsedForFlight = true;
    if (['idle', 'forest', 'error'].includes(next)) panelCollapsedForFlight = false;
    document.body.dataset.phase = next;
    status.hidden = !['loading', 'error'].includes(next);
    retry.hidden = next !== 'error';
    progress.hidden = next === 'error';
    if (done !== undefined) progress.value = done;
    play.setAttribute('aria-disabled', String(next === 'loading' && mode === 'creative'));
    back.hidden = next !== 'flight';
    audio.setActive(!['flight', 'arcade'].includes(next), next === 'flight' ? 4000 : 0);
    if (next === 'forest' || next === 'error') {
        frame?.remove();
        frame = null;
        document.getElementById('arcade-screen').hidden = true;
    }
    applyPanelState();
}

function enterGame(selectedMode) {
    if (frame || state !== 'arcade') return;
    // Both modes retain the same browsing context, so the live game never resets.
    const element = document.createElement('div');
    element.className = 'screen-content';
    frame = document.createElement('iframe');
    frame.title = texts[language].title;
    frame.setAttribute('allow', 'autoplay');
    frame.referrerPolicy = 'same-origin';
    frame.src = `${gameUrl.href}?arcade=1`;
    element.append(frame);
    forest.mountGame(element);
    frame.addEventListener('load', () => { syncMode(); translate(); frame?.focus(); }, { once: true });
    syncMode();
}

function cancelForestLoad() {
    forestGeneration += 1;
    forestLoad = null;
    if (forest) {
        forest.dispose();
        forest = null;
    }
    if (state !== 'idle') onState('idle');
}

async function ensureForest() {
    if (forest) return forest;
    if (forestLoad) return forestLoad;
    const generation = ++forestGeneration;
    onState('loading', 0);
    forestLoad = (async () => {
        let instance;
        try {
            const { Forest } = await import('./forest.js');
            if (generation !== forestGeneration || mode !== 'creative') return null;
            instance = new Forest(document.getElementById('forest'), document.getElementById('arcade-screen'), onState, enterGame);
            forest = instance;
            instance.setMode(mode);
            await instance.load();
            if (generation !== forestGeneration || mode !== 'creative' || instance.disposed) {
                instance.dispose();
                if (forest === instance) forest = null;
                return null;
            }
            const params = new URLSearchParams(location.search);
            if (params.get('resume') === '1') {
                history.replaceState(null, '', location.pathname);
                instance.resume();
            } else if (params.get('play') === '1') {
                history.replaceState(null, '', location.pathname);
                instance.play();
            }
            return instance;
        } catch (error) {
            if (generation !== forestGeneration || mode !== 'creative') return null;
            console.error('Forest initialization failed:', error);
            instance?.dispose();
            if (forest === instance) forest = null;
            onState('error');
            return null;
        } finally {
            if (generation === forestGeneration) forestLoad = null;
        }
    })();
    return forestLoad;
}

function init() {
    // Normal mode is intentionally lightweight: no Three.js import and no GLB
    // requests until the visitor explicitly enables Creative mode.
    if (mode === 'creative') void ensureForest();
    const params = new URLSearchParams(location.search);
    if (mode === 'normal' && params.get('play') === '1') {
        history.replaceState(null, '', location.pathname);
        location.assign(`${gameUrl.href}?play=1`);
    }
}

play.addEventListener('click', event => {
    if (state === 'error') return;
    event.preventDefault();
    if (getMode() === 'normal') {
        location.assign(`${gameUrl.href}?play=1`);
        return;
    }
    if (state === 'loading' || !forest) return;
    forest.play();
});
document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-site-language]').forEach(button => button.addEventListener('click', () => {
    language = button.dataset.siteLanguage;
    writePreference('siteLang', language);
    translate();
}));
window.addEventListener('keydown', event => { if (event.key === 'Escape' && state === 'flight') forest?.back(); });
back.addEventListener('click', () => forest?.back());
window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
    if (event.data?.type === 'arcade-exit') forest?.back();
    if (event.data?.type === 'game-ready') { forest?.setGameReady(true); syncMode(); }
});
window.addEventListener('site-mode', syncMode);
window.addEventListener('storage', event => { if (event.key === 'siteMode') syncMode(); });
window.addEventListener('pagehide', event => { if (!event.persisted) { forestGeneration += 1; forest?.dispose(); } });
window.addEventListener('pageshow', event => { if (event.persisted) { syncMode(); audio.sync(); } });
retry.addEventListener('click', init);
panelToggle.addEventListener('click', () => {
    panelCollapsedByUser = !panelCollapsedByUser;
    applyPanelState();
});
document.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('keydown', () => audio.unlock());
const volumeDialog = document.getElementById('volume-dialog');
document.getElementById('volume-open').addEventListener('click', () => volumeDialog.showModal());
document.getElementById('volume-close').addEventListener('click', () => volumeDialog.close());
for (const name of ['music', 'sounds']) {
    document.getElementById(`${name}-toggle`).addEventListener('click', () => audio.toggle(name));
    const slider = document.getElementById(`${name}-volume`);
    slider.value = Math.round(audio.channels[name].audio.volume * 100);
    const output = slider.nextElementSibling;
    output.value = `${slider.value}%`;
    slider.addEventListener('input', () => { audio.volume(name, Number(slider.value)); output.value = `${slider.value}%`; });
}
syncMode();
translate();
init();
