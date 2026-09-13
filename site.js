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
let state = 'loading';
let frame;
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
    panelToggle.textContent = texts[language][panel.hidden ? 'show' : 'hide'];
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

function syncMode() {
    mode = getMode();
    document.body.dataset.mode = mode;
    document.querySelectorAll('button[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    forest?.setMode(mode);
    play.setAttribute('aria-disabled', String(state === 'loading' && mode === 'creative'));
    if (state === 'arcade') {
        if (mode === 'creative') forest?.showCabinet();
        frame?.contentWindow?.postMessage({ type: 'site-mode', mode }, location.origin);
    }
}

function onState(next, done) {
    state = next;
    document.body.dataset.phase = next;
    status.hidden = !['loading', 'error'].includes(next);
    retry.hidden = next !== 'error';
    progress.hidden = next === 'error';
    if (done !== undefined) progress.value = done;
    play.setAttribute('aria-disabled', String(next === 'loading' && mode === 'creative'));
    back.hidden = next !== 'flight';
    audio.setActive(!['flight', 'arcade'].includes(next));
    if (next === 'forest' || next === 'error') {
        frame?.remove();
        frame = null;
        document.getElementById('arcade-screen').hidden = true;
    }
    translate();
}

function enterGame(selectedMode) {
    // Both modes retain the same browsing context, so the live game never resets.
    const element = document.createElement('div');
    element.className = 'screen-content';
    frame = document.createElement('iframe');
    frame.title = texts[language].title;
    frame.setAttribute('allow', 'autoplay');
    frame.src = `${gameUrl.href}?arcade=1`;
    element.append(frame);
    forest.mountGame(element);
    frame.addEventListener('load', () => { syncMode(); translate(); frame?.focus(); }, { once: true });
    syncMode();
}

async function init() {
    onState('loading', 0);
    try {
        const { Forest } = await import('./forest.js');
        forest?.dispose();
        forest = new Forest(document.getElementById('forest'), document.getElementById('arcade-screen'), onState, enterGame);
        forest.setMode(mode);
        await forest.load();
        if (new URLSearchParams(location.search).get('resume') === '1') {
            history.replaceState(null, '', location.pathname);
            forest.resume();
        } else if (new URLSearchParams(location.search).get('play') === '1') {
            history.replaceState(null, '', location.pathname);
            if (mode === 'normal') location.assign(`${gameUrl.href}?play=1`);
            else forest.play();
        }
    } catch (error) {
        console.error('Forest initialization failed:', error);
        forest?.dispose();
        forest = null;
        onState('error');
    }
}

play.addEventListener('click', event => {
    if (state === 'error') return;
    event.preventDefault();
    if (getMode() === 'normal') {
        location.assign(`${gameUrl.href}?play=1`);
        return;
    }
    forest?.play();
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
window.addEventListener('pagehide', event => { if (!event.persisted) forest?.dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted) { syncMode(); audio.sync(); } });
retry.addEventListener('click', init);
panelToggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    panelToggle.setAttribute('aria-expanded', String(!panel.hidden));
    translate();
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
