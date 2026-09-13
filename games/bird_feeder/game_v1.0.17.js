(() => {
    let isAssetsLoaded = false;
    const memoryCache = {};
    const objectUrls = new Set();
    let gameLoopsStarted = false;
    let landingLoopTimer = null;
    let flybyLoopTimer = null;

    function resizeContainer() {
        const wrapper = document.getElementById('app-wrapper');
        const board = document.getElementById('game-container');
        if (document.body.classList.contains('cabinet-game')) {
            // Adapt the board height to the cabinet; keep sprites and controls
            // uniformly scaled instead of stretching the entire game vertically.
            const scale = window.innerWidth / 1336;
            const bottomHeight = document.getElementById('ui-bottom').offsetHeight;
            board.style.height = `${window.innerHeight / scale - bottomHeight}px`;
            wrapper.style.transform = `scale(${scale})`;
            return;
        }
        board.style.height = '';
        const navHeight = document.body.classList.contains('standalone-game') ? parseFloat(getComputedStyle(document.body).getPropertyValue('--site-nav-height')) || 60 : 0;
        const scale = Math.min(window.innerWidth / 1350, (window.innerHeight - navHeight) / Math.max(880, wrapper.offsetHeight + 12), 1.5);
        wrapper.style.transform = `scale(${scale})`;
    }
    window.addEventListener('resize', resizeContainer);
    resizeContainer();

    const BIRD_TYPES = {
        tit: { id: 'tit', eats: 'seeds', scale: 0.75, images: { fly: 'tit_fly.webp', landing: 'tit_landing.webp', sit: 'tit_sit.webp', eat: 'tit_eat.webp' } },
        sparrow: { id: 'sparrow', eats: 'seeds', scale: 0.8, images: { fly: 'sparrow_fly.webp', landing: 'sparrow_landing.webp', sit: 'sparrow_sit.webp', eat: 'sparrow_eat.webp' } },
        bluetit: { id: 'bluetit', eats: 'seeds', scale: 0.7, images: { fly: 'bluetit_fly.webp', landing: 'bluetit_landing.webp', sit: 'bluetit_sit.webp', eat: 'bluetit_eat.webp' } },
        bullfinch: { id: 'bullfinch', eats: 'seeds', scale: 0.85, images: { fly: 'bullfinch_fly.webp', landing: 'bullfinch_landing.webp', sit: 'bullfinch_sit.webp', eat: 'bullfinch_eat.webp' } },
        crow: { id: 'crow', eats: 'meat', scale: 1.6, images: { fly: 'crow_fly.webp', landing: 'crow_landing.webp', sit: 'crow_sit.webp', eat: 'crow_eat.webp' } },
        magpie: { id: 'magpie', eats: 'meat', scale: 1.5, images: { fly: 'magpie_fly.webp', landing: 'magpie_landing.webp', sit: 'magpie_sit.webp', eat: 'magpie_eat.webp' } },
        kite: { id: 'kite', eats: 'meat', scale: 3.0, images: { fly: 'kite_fly.webp', landing: 'kite_landing.webp', sit: 'kite_sit.webp', eat: 'kite_eat.webp' } },
        pigeon: { id: 'pigeon', eats: 'enemy', scale: 1.4, images: { fly: 'pigeon_fly.webp', landing: 'pigeon_landing.webp', sit: 'pigeon_sit.webp', eat: 'pigeon_eat.webp' } }
    };
    const BIRD_KEYS = Object.keys(BIRD_TYPES);
    const SFX_CONFIG = { meat: 3, seeds: 22 };

    // К старту игры нужны только изображения. Музыка и эффекты браузер
    // загрузит по мере необходимости, поэтому большая аудиотека не блокирует UI.
    const visualAssetList = [
        'img/seeds.webp',
        'img/meat.webp'
    ];
    
    Object.values(BIRD_TYPES).forEach(bird => {
        visualAssetList.push(`img/${bird.images.fly}`);
        visualAssetList.push(`img/${bird.images.landing}`);
        visualAssetList.push(`img/${bird.images.sit}`);
        visualAssetList.push(`img/${bird.images.eat}`);
    });

    // Повторяет запрос ограниченное число раз и не оставляет зависший fetch.
    async function fetchWithRetry(url, retries = 3, timeoutMs = 8000) {
        // При офлайне сначала всё равно пробуем browser cache, но не тратим
        // десятки секунд на повторные сетевые запросы, если ресурса в кэше нет.
        const isOffline = navigator.onLine === false;
        const attempts = isOffline ? 1 : retries;
        const requestTimeoutMs = isOffline ? Math.min(timeoutMs, 500) : timeoutMs;

        for (let i = 0; i < attempts; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
            try {
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.blob();
            } catch (e) {
                if (i === retries - 1) throw e;
                console.warn(`[ОЗУ] Сбой скачивания ${url}. Попытка ${i + 2} из ${attempts}...`);
                await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
            } finally {
                clearTimeout(timeoutId);
            }
        }
    }

    async function cacheVisualAsset(url) {
        try {
            const blob = await fetchWithRetry(url);
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.add(objectUrl);
            memoryCache[url] = objectUrl;
        } catch (e) {
            console.warn(`[ОЗУ] Не удалось скачать ${url}; используется обычная загрузка браузера.`);
            memoryCache[url] = url;
        }
    }

    async function loadWithConcurrency(urls, concurrency = 6) {
        let nextIndex = 0;
        const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
            while (nextIndex < urls.length) {
                const url = urls[nextIndex++];
                await cacheVisualAsset(url);
            }
        });
        await Promise.all(workers);
    }

    async function initRAMCache() {
        applyLocalization();
        try {
            await loadWithConcurrency(visualAssetList);
        } catch (e) {
            console.error('Критическая ошибка кэша изображений', e);
        } finally {
            initAudioPool();
            isAssetsLoaded = true;
            if (savedRun) {
                savedRun.food.forEach(item => addFood(item.type, item));
                savedRun = null;
            }
            updateUI();
            applyLocalization();
            startGameLoops();
        }
    }

    // --- ФИКС: АУДИО-ПУЛ ---
    const audioPool = {};
    let musicAudio = null;
    let natureAudio = null;

    function initAudioPool() {
        musicAudio = new Audio('audio/music.ogg');
        musicAudio.loop = true;
        musicAudio.volume = 0.34;
        musicAudio.preload = 'metadata';

        natureAudio = new Audio('audio/nature.ogg');
        natureAudio.loop = true;
        natureAudio.volume = 0.69;
        natureAudio.preload = 'metadata';

        // Подхватываем звуки
        audioPool['seeds'] = [];
        for (let i = 1; i <= SFX_CONFIG.seeds; i++) {
            const audio = new Audio(`audio/Seedsfall${i}.ogg`);
            audio.preload = 'none';
            audioPool['seeds'].push(audio);
        }
        
        audioPool['meat'] = [];
        for (let i = 1; i <= SFX_CONFIG.meat; i++) {
            const audio = new Audio(`audio/Meatfall${i}.ogg`);
            audio.preload = 'none';
            audioPool['meat'].push(audio);
        }
    }

    // Это только защита локального сохранения от случайной/простой подмены.
    // Пока вся логика работает в браузере, клиентский код не может быть
    // полноценным античитом: при серверной валюте и наградах проверка должна
    // переехать на сервер.
    const SAVE_SECRET_KEY = 'birdSaveSecret';
    const SAVE_LIMITS = {
        birdHighScore: 10_000_000,
        birdFedCount: 99,
        birdSunCoins: 1_000_000
    };

    function getSaveSecret() {
        const existing = localStorage.getItem(SAVE_SECRET_KEY);
        if (existing && /^[a-f0-9]{16}$/i.test(existing)) return existing;

        const bytes = new Uint32Array(2);
        crypto.getRandomValues(bytes);
        const secret = Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('');
        localStorage.setItem(SAVE_SECRET_KEY, secret);
        return secret;
    }

    function makeChecksum(value) {
        // FNV-1a: не является серверной криптографической подписью, но вместе
        // с ключом конкретной установки не даёт поправить счёт одной строкой.
        const input = `${getSaveSecret()}:${value}`;
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function isLegacyChecksum(checksum, value) {
        // Один раз переносим корректные сохранения версии 1.0.16, чтобы
        // обновление игры не сбрасывало честный локальный прогресс.
        return checksum === btoa(`${value}${atob('SDB1clNfMGZfQjFyZFNfUzNjcjN0XzIwMjYh')}`);
    }

    function normalizeSaveValue(key, value) {
        const parsed = Number(value);
        const limit = SAVE_LIMITS[key];
        if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > limit) return null;
        return parsed;
    }

    function secureSave(key, value) {
        const normalized = normalizeSaveValue(key, value);
        if (normalized === null) return false;
        localStorage.setItem(key, String(normalized));
        localStorage.setItem(`${key}_hash`, makeChecksum(normalized));
        return true;
    }

    function resetSave(key, defaultVal, reason) {
        console.warn(`[Локальное сохранение] Сброс ${key}: ${reason}`);
        secureSave(key, defaultVal);
        return defaultVal;
    }

    function secureLoad(key, defaultVal) {
        const rawValue = localStorage.getItem(key);
        const checksum = localStorage.getItem(`${key}_hash`);
        if (rawValue === null) return defaultVal;

        const value = normalizeSaveValue(key, rawValue);
        if (value === null) return resetSave(key, defaultVal, 'некорректное значение');

        if (isLegacyChecksum(checksum, value)) {
            secureSave(key, value);
            return value;
        }

        if (checksum !== makeChecksum(value)) {
            return resetSave(key, defaultVal, 'контрольная сумма не совпала');
        }
        return value;
    }

    let score = 0;
    const RUN_KEY = 'birdCurrentRunV1';
    let savedRun = null;
    try {
        const stored = JSON.parse(sessionStorage.getItem(RUN_KEY) || 'null');
        if (stored && typeof stored.data === 'string' && stored.hash === makeChecksum(stored.data)) {
            const run = JSON.parse(stored.data);
            if (Number.isSafeInteger(run.score) && Math.abs(run.score) <= 10000000 && Array.isArray(run.food) && run.food.length <= 10 && run.food.every(item => ['seeds', 'meat'].includes(item.type) && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1336 && Number.isFinite(item.y) && item.y >= -50 && item.y <= 768)) savedRun = run;
        }
    } catch { /* Invalid session data must never prevent playing. */ }
    if (savedRun) score = savedRun.score;
    let highScore = secureLoad('birdHighScore', 0);
    let fedBirdsCount = secureLoad('birdFedCount', 0);
    let sunCoins = secureLoad('birdSunCoins', 0);
    
    let foodOnTable = [];
    const MAX_FOOD = 10;
    const FOOD_TYPES = new Set(['seeds', 'meat']);
    document.getElementById('high-score').innerText = highScore;

    let isPaused = true; 
    let sfxEnabled = true;
    let sfxVolume = 1.0;
    let adsEnabled = false;

    const menus = ['menu-main', 'menu-settings', 'menu-language', 'menu-ads', 'menu-lore', 'menu-ad-alert', 'menu-bugs', 'menu-socials'];

    const LANGUAGE_MODES = new Set(['auto', 'ru', 'en']);
    const savedLanguage = localStorage.getItem('siteLang');
    let currentLangMode = LANGUAGE_MODES.has(savedLanguage) ? savedLanguage : 'auto';

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function saveRun() {
        // Store vertical positions in the original 768px coordinate space so
        // a taller cabinet viewport can resume on the ordinary game page.
        const boardHeight = document.getElementById('game-container').offsetHeight;
        const data = JSON.stringify({ score, food: foodOnTable.map(({ type, element }) => ({ type, x: parseFloat(element.style.left), y: parseFloat(element.style.top) * 768 / boardHeight })) });
        try { sessionStorage.setItem(RUN_KEY, JSON.stringify({ data, hash: makeChecksum(data) })); } catch { /* Storage may be unavailable. */ }
    }
    window.addEventListener('save-game-session', saveRun);
    window.addEventListener('pagehide', saveRun);

    function applyLocalization() {
        let lang = currentLangMode;
        if (lang === 'auto') {
            lang = navigator.language.startsWith('ru') ? 'ru' : 'en';
        }
        if (lang === 'auto') lang = 'ru'; 
        
        const dict = GAME_TEXTS[lang];
        if (!dict) return;
        document.documentElement.lang = lang;

        let playText = isAssetsLoaded ? (isPaused ? dict.btn_play : dict.btn_pause) : dict.btn_loading;
        let mainPlayText = isAssetsLoaded ? dict.btn_play : dict.btn_loading;

        setText('btn-pause', playText);
        setText('txt-play-main', mainPlayText);
        
        const btnMain = document.getElementById('txt-play-main');
        const btnPauseTop = document.getElementById('btn-pause');
        if (btnMain) btnMain.disabled = !isAssetsLoaded;
        if (btnPauseTop) btnPauseTop.disabled = !isAssetsLoaded;

        setText('txt-menu-vol', dict.menu_vol);
        
        let langName = dict.lbl_auto;
        if (currentLangMode === 'ru') langName = dict.lbl_ru;
        if (currentLangMode === 'en') langName = dict.lbl_en;
        setText('txt-menu-lang', `${dict.menu_lang} ${langName}`);
        
        setText('txt-menu-ads', adsEnabled ? dict.menu_ads_on : dict.menu_ads_off);
        setText('txt-menu-lore', dict.menu_lore);
        setText('txt-menu-socials', dict.menu_socials);
        setText('txt-menu-bugs', dict.menu_bugs);
        
        setText('txt-score-lbl', dict.lbl_score);
        setText('txt-record-lbl', dict.lbl_record);
        setText('txt-food-lbl', dict.lbl_food);
        setText('btn-seeds', dict.btn_seeds);
        setText('btn-meat', dict.btn_meat);
        
        setText('txt-title-lang', dict.title_lang);
        setText('lang-auto', dict.btn_lang_auto);
        setText('lang-ru', dict.btn_lang_ru);
        setText('lang-en', dict.btn_lang_en);

        setText('txt-title-settings', dict.title_settings);
        setText('txt-music-top', dict.lbl_music);
        setText('txt-nature-top', dict.lbl_nature);
        setText('txt-sfx-top', dict.lbl_sfx);
        setText('txt-music-set', dict.lbl_music);
        setText('txt-nature-set', dict.lbl_nature);
        setText('txt-sfx-set', dict.lbl_sfx);
        
        setText('txt-test-seeds', dict.btn_seeds);
        setText('txt-test-meat', dict.btn_meat);
        
        setText('txt-title-lore', dict.title_lore);
        setText('txt-desc-lore', dict.text_lore);
        
        setText('txt-title-ads', dict.title_ads);
        setText('txt-desc-ads', dict.text_ads);
        setText('txt-btn-enable-ads', dict.btn_enable_ads);
        setText('txt-title-ad-alert', dict.title_ad_alert);
        setText('txt-desc-ad-alert', dict.text_ad_alert);
        
        setText('txt-title-bugs', dict.title_bugs);
        setText('txt-desc-bugs', dict.text_bugs);
        
        setText('txt-title-socials', dict.title_socials);
        const socialsContainer = document.getElementById('socials-container');
        if (socialsContainer) {
            socialsContainer.replaceChildren();
            dict.social_links.forEach(link => {
                let url;
                try {
                    url = new URL(link.url);
                } catch {
                    return;
                }
                if (url.protocol !== 'https:') return;
                const a = document.createElement('a');
                a.href = url.href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'menu-btn social-btn';
                a.textContent = link.name;
                socialsContainer.appendChild(a);
            });
        }

        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.innerText = dict.btn_back;
        });
    }

    function setLanguage(lang) {
        if (!LANGUAGE_MODES.has(lang)) return;
        currentLangMode = lang;
        if (lang === 'auto') {
            localStorage.removeItem('siteLang'); 
        } else {
            localStorage.setItem('siteLang', lang); 
        }
        
        updateLanguageButtons();
        applyLocalization();
    }

    function updateLanguageButtons() {
        LANGUAGE_MODES.forEach(mode => {
            const button = document.getElementById(`lang-${mode}`);
            if (button) button.classList.toggle('active', mode === currentLangMode);
        });
    }

    function handleGameAction(event) {
        const control = event.target.closest('[data-action]');
        if (!control) return;

        switch (control.dataset.action) {
            case 'toggle-pause':
                togglePause();
                break;
            case 'start-game':
                startGame();
                break;
            case 'open-menu':
                openMenu(control.dataset.menu);
                break;
            case 'set-language':
                setLanguage(control.dataset.language);
                break;
            case 'toggle-audio':
                if (control.dataset.audioId && control.dataset.syncClass) {
                    toggleAudio(control.dataset.audioId, control.dataset.syncClass);
                }
                break;
            case 'toggle-sfx':
                toggleSfx();
                break;
            case 'play-sfx':
                playSfx(control.dataset.sfx);
                break;
            case 'toggle-ads':
                tryToggleAds();
                break;
            case 'add-food':
                addFood(control.dataset.food);
                break;
        }
    }

    function handleVolumeInput(event) {
        const control = event.target;
        if (!(control instanceof HTMLInputElement) || !control.dataset.volume) return;

        if (control.dataset.volume === 'audio-music' || control.dataset.volume === 'audio-nature') {
            changeVolume(control.dataset.volume, control.value);
        } else if (control.dataset.volume === 'sfx') {
            changeSfxVolume(control.value);
        }
    }

    function updateSunUI() {
        document.getElementById('sun-val').innerText = sunCoins;
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('click', handleGameAction);
        document.addEventListener('input', handleVolumeInput);
        updateLanguageButtons();
        
        updateSunUI();
        initRAMCache();
    });

    function openMenu(menuId) {
        if (!menus.includes(menuId)) return;
        menus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        document.getElementById(menuId).classList.remove('hidden');
    }

    function startGame() {
        if (!isAssetsLoaded) return;
        isPaused = false;
        menus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        applyLocalization(); 
        
        if (document.querySelector('.btn-music-sync').classList.contains('active')) {
            musicAudio.play().catch(e => console.warn('Музыка заблокирована браузером:', e));
        }
        if (document.querySelector('.btn-nature-sync').classList.contains('active')) {
            natureAudio.play().catch(e => console.warn('Природа заблокирована браузером:', e));
        }
    }

    function pauseGame() {
        if (!isAssetsLoaded) return;
        isPaused = true;
        openMenu('menu-main');
        applyLocalization(); 
    }

    function togglePause() {
        if (isPaused) startGame();
        else pauseGame();
    }

    function tryToggleAds() {
        if (!adsEnabled) {
            openMenu('menu-ad-alert');
        } else {
            adsEnabled = false;
            applyLocalization();
        }
    }

    function changeVolume(audioId, val) {
        const v = Math.min(Math.max(Number(val) / 100, 0), 1);
        if (!Number.isFinite(v)) return;
        if (audioId === 'audio-music') musicAudio.volume = v;
        if (audioId === 'audio-nature') natureAudio.volume = v;
    }
    
    function changeSfxVolume(val) {
        const volume = Math.min(Math.max(Number(val) / 100, 0), 1);
        if (Number.isFinite(volume)) sfxVolume = volume;
    }

    function toggleSfx() {
        sfxEnabled = !sfxEnabled;
        const buttons = document.querySelectorAll('.btn-sfx-sync');
        buttons.forEach(btn => {
            if (sfxEnabled) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    function toggleAudio(audioId, syncClass) {
        const targetAudio = (audioId === 'audio-music') ? musicAudio : natureAudio;
        const buttons = document.querySelectorAll('.' + syncClass);
        const isActive = buttons[0].classList.contains('active');
        
        if (isActive) {
            targetAudio.pause();
            buttons.forEach(btn => btn.classList.remove('active'));
        } else {
            targetAudio.play().catch(e => console.warn('Блокировка аудио:', e));
            buttons.forEach(btn => btn.classList.add('active'));
        }
    }

    function playSfx(type) {
        if (!sfxEnabled || !audioPool[type]) return;
        
        const randomIdx = Math.floor(Math.random() * audioPool[type].length);
        const snd = audioPool[type][randomIdx];
        
        snd.currentTime = 0;
        let baseVolumeMultiplier = 1.0;
        snd.volume = Math.min(sfxVolume * baseVolumeMultiplier, 1.0); 
        
        snd.play().catch(e => console.log('SFX block/missing:', e));
    }

    function addFood(type, restored = null) {
        if (!FOOD_TYPES.has(type) || foodOnTable.length >= MAX_FOOD) return;
        const foodDiv = document.createElement('div');
        foodDiv.className = `food-item`;
        
        const isMeat = type === 'meat';
        const foodSize = isMeat ? 40 : 40;
        foodDiv.style.width = `${foodSize}px`;
        foodDiv.style.height = `${foodSize}px`;
        
        foodDiv.style.backgroundImage = `url('${memoryCache[`img/${type}.webp`] || `img/${type}.webp`}')`;
        
        const tableZone = document.getElementById('table-zone');
        const container = document.getElementById('game-container');
        
        const randomX = tableZone.offsetLeft + Math.random() * (tableZone.offsetWidth - foodSize);
        const targetY = tableZone.offsetTop + Math.random() * (tableZone.offsetHeight - foodSize);

        foodDiv.style.left = `${restored ? restored.x : randomX}px`;
        foodDiv.style.top = restored ? `${restored.y * container.offsetHeight / 768}px` : '-50px';
        
        container.appendChild(foodDiv);
        foodOnTable.push({ type: type, element: foodDiv });
        updateUI();

        if (!restored) {
            setTimeout(() => { foodDiv.style.top = `${targetY}px`; saveRun(); }, 50);
            setTimeout(() => { playSfx(type); }, 550);
        }
    }

    function updateUI() {
        saveRun();
        document.getElementById('food-count').innerText = foodOnTable.length;
        document.getElementById('score').innerText = score;
        if (score > highScore) {
            highScore = score;
            secureSave('birdHighScore', highScore); 
            document.getElementById('high-score').innerText = highScore;
        }
        document.getElementById('btn-seeds').disabled = (foodOnTable.length >= MAX_FOOD);
        document.getElementById('btn-meat').disabled = (foodOnTable.length >= MAX_FOOD);
    }

    function changeScore(amount) { 
        if (isPaused) return; 
        score += amount; 
        updateUI(); 
    }

    function getBirdCurrentX(birdEl) {
        const container = document.getElementById('game-container');
        const birdRect = birdEl.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const scale = contRect.width / 1336;
        return (birdRect.left - contRect.left) / scale;
    }

    function createBirdElement(birdData, startX, startY, targetX) {
        const birdEl = document.createElement('div');
        birdEl.className = 'bird';
        const birdSize = 100 * birdData.scale;
        birdEl.style.width = `${birdSize}px`;
        birdEl.style.height = `${birdSize}px`;
        
        birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.fly}`] || `img/${birdData.images.fly}`}')`;
        birdEl.style.left = `${startX}px`;
        birdEl.style.top = `${startY}px`;

        if (birdData.eats === 'enemy') birdEl.classList.add('pigeon-warning'); 

        birdEl.style.transform = targetX > startX ? 'scaleX(-1)' : 'scaleX(1)';
        document.getElementById('game-container').appendChild(birdEl);
        
        birdEl.offsetHeight; 
        return birdEl;
    }

    function sendToTable(birdEl, birdData) {
        if (birdEl.dataset.fled === 'true') return;

        const tableZone = document.getElementById('table-zone');
        const birdSize = 100 * birdData.scale;

        const targetX = tableZone.offsetLeft + Math.random() * (tableZone.offsetWidth - birdSize);
        const targetY = tableZone.offsetTop + Math.random() * (tableZone.offsetHeight - 30) - (birdSize * 1);

        birdEl.style.transition = 'top 2s linear, left 2s linear';
        
        const currentX = getBirdCurrentX(birdEl);
        birdEl.style.transform = targetX > currentX ? 'scaleX(-1)' : 'scaleX(1)';

        birdEl.style.left = `${targetX}px`;
        birdEl.style.top = `${targetY}px`;

        setTimeout(() => {
            if (birdEl.dataset.fled === 'true' || !document.body.contains(birdEl)) return;
            birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.landing}`] || `img/${birdData.images.landing}`}')`;
        }, 1000);

        setTimeout(() => {
            if (birdEl.dataset.fled === 'true' || !document.body.contains(birdEl)) return;
            birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.sit}`] || `img/${birdData.images.sit}`}')`;
            setTimeout(() => approachFood(birdEl, birdData, birdSize), 500); 
        }, 2000);
    }

    function approachFood(birdEl, birdData, birdSize) {
        if (birdEl.dataset.fled === 'true' || !document.body.contains(birdEl)) return;

        let targetFoodObj = null;
        let foodIndex = -1;

        if (birdData.eats === 'enemy') {
            if (foodOnTable.length > 0) foodIndex = Math.floor(Math.random() * foodOnTable.length);
        } else {
            foodIndex = foodOnTable.findIndex(f => f.type === birdData.eats);
        }

        if (foodIndex !== -1) {
            targetFoodObj = foodOnTable[foodIndex];
            const foodLeft = parseFloat(targetFoodObj.element.style.left);
            const foodTop = parseFloat(targetFoodObj.element.style.top);
            
            const currentX = getBirdCurrentX(birdEl);
            const offset = birdSize * 0.35;
            const moveX = foodLeft > currentX ? foodLeft - offset : foodLeft + offset;
            const moveY = foodTop - (birdSize - 30);

            birdEl.style.transform = moveX > currentX ? 'scaleX(-1)' : 'scaleX(1)';
            birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.fly}`] || `img/${birdData.images.fly}`}')`; 
            
            birdEl.style.transition = 'top 0.5s ease-in-out, left 0.5s ease-in-out';
            birdEl.style.left = `${moveX}px`;
            birdEl.style.top = `${moveY}px`;

            setTimeout(() => {
                if (birdEl.dataset.fled === 'true' || !document.body.contains(birdEl)) return; 
                
                const stillExistsIndex = foodOnTable.indexOf(targetFoodObj);
                if (stillExistsIndex !== -1) {
                    foodOnTable.splice(stillExistsIndex, 1);
                    targetFoodObj.element.remove();
                    birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.eat}`] || `img/${birdData.images.eat}`}')`; 
                    
                    if (birdData.eats === 'enemy') {
                        changeScore(-2);
                    } else {
                        changeScore(1);
                        fedBirdsCount++;
                        
                        if (fedBirdsCount >= 100) {
                            fedBirdsCount -= 100;
                            sunCoins++;
                            secureSave('birdSunCoins', sunCoins); 
                            updateSunUI();
                        }
                        secureSave('birdFedCount', fedBirdsCount); 
                    }
                } else {
                    if (birdData.eats !== 'enemy') changeScore(-1); 
                    birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.sit}`] || `img/${birdData.images.sit}`}')`;
                }
                setTimeout(() => flyAway(birdEl, birdData), 1000);
            }, 500);

        } else {
            if (birdData.eats !== 'enemy') changeScore(-1); 
            flyAway(birdEl, birdData);
        }
    }

    function flyAway(birdEl, birdData) {
        if (!document.body.contains(birdEl)) return;
        
        birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.fly}`] || `img/${birdData.images.fly}`}')`;
        const currentX = getBirdCurrentX(birdEl);
        const flyRight = currentX > 1336 / 2;
        birdEl.style.transform = flyRight ? 'scaleX(-1)' : 'scaleX(1)'; 
        
        birdEl.style.transition = 'top 2s linear, left 2s linear';
        birdEl.style.left = flyRight ? '1800px' : '-400px';
        birdEl.style.top = '-400px'; 
        
        setTimeout(() => {
            if (document.body.contains(birdEl)) birdEl.remove();
        }, 2000);
    }

    function spawnLandingBird() {
        const birdData = BIRD_TYPES[BIRD_KEYS[Math.floor(Math.random() * BIRD_KEYS.length)]];
        const startX = Math.random() > 0.5 ? -400 : 1800; 
        const birdEl = createBirdElement(birdData, startX, -100, 600);

        const handleFlee = function(e) {
            e.preventDefault(); 
            if (birdData.eats === 'enemy' && birdEl.dataset.fled !== 'true') {
                birdEl.dataset.fled = 'true'; 
                if (!isPaused) changeScore(1); 
                flyAway(birdEl, birdData);
            }
        };
        birdEl.addEventListener('mousedown', handleFlee);
        birdEl.addEventListener('touchstart', handleFlee);
        setTimeout(() => sendToTable(birdEl, birdData), 50);
    }

    function spawnFlybyBird() {
        const birdData = BIRD_TYPES[BIRD_KEYS[Math.floor(Math.random() * BIRD_KEYS.length)]];
        const startLeft = Math.random() > 0.5;
        const startX = startLeft ? -400 : 1800;
        const targetX = startLeft ? 1800 : -400;
        const birdEl = createBirdElement(birdData, startX, 50 + Math.random() * 200, targetX);
        
        setTimeout(() => {
            birdEl.style.transition = 'left 4s linear, top 4s linear'; 
            birdEl.style.left = `${targetX}px`;
            if (Math.random() < 0.25) {
                setTimeout(() => sendToTable(birdEl, birdData), 1000);
            } else {
                setTimeout(() => { if (foodOnTable.length === 0 && !isPaused) changeScore(-1); }, 2000);
                setTimeout(() => { if (document.body.contains(birdEl)) birdEl.remove(); }, 4000);
            }
        }, 50);
    }

    function startGameLoops() {
        if (gameLoopsStarted) return;
        gameLoopsStarted = true;
        gameLoop();
        flybyLoop();
    }

    function gameLoop() {
        landingLoopTimer = setTimeout(() => {
            if (!gameLoopsStarted) return;
            spawnLandingBird();
            gameLoop();
        }, 3000 + Math.random() * 3000);
    }

    function flybyLoop() {
        flybyLoopTimer = setTimeout(() => {
            if (!gameLoopsStarted) return;
            spawnFlybyBird();
            flybyLoop();
        }, 5000 + Math.random() * 5000);
    }

    function releaseResources() {
        gameLoopsStarted = false;
        clearTimeout(landingLoopTimer);
        clearTimeout(flybyLoopTimer);
        musicAudio?.pause();
        natureAudio?.pause();
        objectUrls.forEach(url => URL.revokeObjectURL(url));
        objectUrls.clear();
    }

    window.addEventListener('beforeunload', releaseResources, { once: true });

})();
