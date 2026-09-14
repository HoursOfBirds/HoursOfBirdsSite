(() => {
    let isAssetsLoaded = false;
    const memoryCache = {};
    const objectUrls = new Set();
    let gameLoopsStarted = false;
    let landingLoopTimer = null;
    let flybyLoopTimer = null;
    let foodOnTable = [];

    const BACKGROUND_SIZE = { width: 1366, height: 768 };
    const TABLE_SURFACE = {
        topLeft: { x: 345, y: 582 },
        topRight: { x: 1070, y: 558 },
        bottomLeft: { x: 245, y: 700 },
        bottomRight: { x: 1115, y: 692 }
    };

    function lerp(a, b, amount) {
        return a + (b - a) * amount;
    }

    function getBackgroundProjection() {
        const board = document.getElementById('game-container');
        const width = board.clientWidth;
        const height = board.clientHeight;
        const scale = Math.max(width / BACKGROUND_SIZE.width, height / BACKGROUND_SIZE.height);
        return {
            scale,
            offsetX: (width - BACKGROUND_SIZE.width * scale) / 2,
            offsetY: (height - BACKGROUND_SIZE.height * scale) / 2
        };
    }

    function projectBackgroundPoint(point) {
        const projection = getBackgroundProjection();
        return {
            x: projection.offsetX + point.x * projection.scale,
            y: projection.offsetY + point.y * projection.scale
        };
    }

    function randomTablePoint(margin = 0) {
        // Bilinear sampling follows the perspective edges of the tabletop.
        // Keep objects away from the vegetation-covered front corners.
        const depth = .08 + Math.random() * .72;
        const left = {
            x: lerp(TABLE_SURFACE.topLeft.x, TABLE_SURFACE.bottomLeft.x, depth),
            y: lerp(TABLE_SURFACE.topLeft.y, TABLE_SURFACE.bottomLeft.y, depth)
        };
        const right = {
            x: lerp(TABLE_SURFACE.topRight.x, TABLE_SURFACE.bottomRight.x, depth),
            y: lerp(TABLE_SURFACE.topRight.y, TABLE_SURFACE.bottomRight.y, depth)
        };
        const usableWidth = Math.max(1, right.x - left.x - margin * 2);
        const across = (margin + Math.random() * usableWidth) / (right.x - left.x);
        return {
            x: lerp(left.x, right.x, across),
            y: lerp(left.y, right.y, across)
        };
    }

    function positionFoodElement(item, animate = false) {
        const point = projectBackgroundPoint({ x: item.x, y: item.y });
        const width = item.element.offsetWidth || 40;
        const height = item.element.offsetHeight || 40;
        if (!animate) item.element.style.transition = 'none';
        item.element.style.left = `${point.x - width / 2}px`;
        item.element.style.top = `${point.y - height / 2}px`;
        if (!animate) requestAnimationFrame(() => item.element.style.removeProperty('transition'));
    }

    function syncTableObjects() {
        foodOnTable.forEach(item => positionFoodElement(item));
        document.querySelectorAll('.bird[data-table-x][data-table-y]').forEach(bird => {
            const point = projectBackgroundPoint({ x: Number(bird.dataset.tableX), y: Number(bird.dataset.tableY) });
            const size = bird.offsetWidth;
            bird.style.left = `${point.x - size / 2}px`;
            bird.style.top = `${point.y - size}px`;
        });
    }

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
            requestAnimationFrame(syncTableObjects);
            return;
        }
        board.style.height = '';
        const navHeight = document.body.classList.contains('standalone-game') ? parseFloat(getComputedStyle(document.body).getPropertyValue('--site-nav-height')) || 60 : 0;
        const scale = Math.min(window.innerWidth / 1350, (window.innerHeight - navHeight) / Math.max(880, wrapper.offsetHeight + 12), 1.5);
        wrapper.style.transform = `scale(${scale})`;
        requestAnimationFrame(syncTableObjects);
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
                if (i === attempts - 1) throw e;
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
        musicAudio.volume = 0.13;
        musicAudio.preload = 'metadata';

        natureAudio = new Audio('audio/nature.ogg');
        natureAudio.loop = true;
        natureAudio.volume = 0.33;
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
    const fallbackStorage = new Map();

    function storageKey(storageName, key) {
        return `${storageName}:${key}`;
    }

    function readStorage(storageName, key) {
        try { return window[storageName].getItem(key); }
        catch { return fallbackStorage.get(storageKey(storageName, key)) ?? null; }
    }

    function writeStorage(storageName, key, value) {
        try {
            window[storageName].setItem(key, value);
            return true;
        } catch {
            fallbackStorage.set(storageKey(storageName, key), String(value));
            return false;
        }
    }

    function removeStorage(storageName, key) {
        try { window[storageName].removeItem(key); }
        catch { /* Storage may be disabled. */ }
        fallbackStorage.delete(storageKey(storageName, key));
    }

    const SAVE_LIMITS = {
        birdHighScore: 10_000_000,
        birdFedCount: 99,
        birdSunCoins: 1_000_000
    };

    function getSaveSecret() {
        const existing = readStorage('localStorage', SAVE_SECRET_KEY);
        if (existing && /^[a-f0-9]{16}$/i.test(existing)) return existing;

        const bytes = new Uint32Array(2);
        try { crypto.getRandomValues(bytes); }
        catch { bytes[0] = Date.now() >>> 0; bytes[1] = Math.floor(Math.random() * 0xffffffff) >>> 0; }
        const secret = Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('');
        writeStorage('localStorage', SAVE_SECRET_KEY, secret);
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
        writeStorage('localStorage', key, String(normalized));
        writeStorage('localStorage', `${key}_hash`, makeChecksum(normalized));
        return true;
    }

    function resetSave(key, defaultVal, reason) {
        console.warn(`[Локальное сохранение] Сброс ${key}: ${reason}`);
        secureSave(key, defaultVal);
        return defaultVal;
    }

    function secureLoad(key, defaultVal) {
        const rawValue = readStorage('localStorage', key);
        const checksum = readStorage('localStorage', `${key}_hash`);
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
        const storedRaw = readStorage('sessionStorage', RUN_KEY);
        const stored = typeof storedRaw === 'string' && storedRaw.length <= 16384 ? JSON.parse(storedRaw) : null;
        if (stored && typeof stored.data === 'string' && stored.data.length <= 8192 && stored.hash === makeChecksum(stored.data)) {
            const run = JSON.parse(stored.data);
            if (Number.isSafeInteger(run.score) && Math.abs(run.score) <= 10000000 && Array.isArray(run.food) && run.food.length <= 10 && run.food.every(item => ['seeds', 'meat'].includes(item.type) && Number.isFinite(item.x) && item.x >= 0 && item.x <= BACKGROUND_SIZE.width && Number.isFinite(item.y) && item.y >= -50 && item.y <= BACKGROUND_SIZE.height)) {
                if (run.coordinateSpace !== 'background-v2') {
                    // Older saves used the 1336px board coordinates. Preserve
                    // their food approximately, then rewrite in the stable
                    // background coordinate space on the next UI update.
                    run.food = run.food.map(item => ({
                        ...item,
                        x: Math.max(275, Math.min(1090, item.x + 15)),
                        y: Math.max(575, Math.min(690, item.y))
                    }));
                }
                savedRun = run;
            }
        }
    } catch { /* Invalid session data must never prevent playing. */ }
    if (savedRun) score = savedRun.score;
    let highScore = secureLoad('birdHighScore', 0);
    let fedBirdsCount = secureLoad('birdFedCount', 0);
    let sunCoins = secureLoad('birdSunCoins', 0);
    
    const MAX_FOOD = 10;
    const FOOD_TYPES = new Set(['seeds', 'meat']);
    document.getElementById('high-score').innerText = highScore;

    let isPaused = true; 
    let sfxEnabled = true;
    let sfxVolume = 0.55;
    let adsEnabled = false;

    const menus = ['menu-main', 'menu-settings', 'menu-language', 'menu-ads', 'menu-lore', 'menu-ad-alert', 'menu-bugs', 'menu-socials'];

    const LANGUAGE_MODES = new Set(['auto', 'ru', 'en']);
    const savedLanguage = readStorage('localStorage', 'siteLang');
    let currentLangMode = LANGUAGE_MODES.has(savedLanguage) ? savedLanguage : 'auto';

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function saveRun() {
        const food = foodOnTable.map(({ type, x, y }) => ({ type, x, y }))
            .filter(item => Number.isFinite(item.x) && Number.isFinite(item.y));
        const data = JSON.stringify({ coordinateSpace: 'background-v2', score, food });
        if (data.length > 8192) return;
        writeStorage('sessionStorage', RUN_KEY, JSON.stringify({ data, hash: makeChecksum(data) }));
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
            removeStorage('localStorage', 'siteLang');
        } else {
            writeStorage('localStorage', 'siteLang', lang);
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
        updateVolumeOutput(control.dataset.volume, control.value);
    }

    function updateVolumeOutput(channel, value) {
        const percent = Math.round(Math.min(100, Math.max(0, Number(value) || 0)));
        const output = document.querySelector(`[data-volume-output="${channel}"]`);
        if (output) output.value = `${percent}%`;
    }

    function updateSunUI() {
        document.getElementById('sun-val').innerText = sunCoins;
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('click', handleGameAction);
        document.addEventListener('input', handleVolumeInput);
        document.querySelectorAll('input[data-volume]').forEach(control => updateVolumeOutput(control.dataset.volume, control.value));
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
        foodDiv.className = 'food-item';
        
        const isMeat = type === 'meat';
        const foodSize = isMeat ? 40 : 40;
        foodDiv.style.width = `${foodSize}px`;
        foodDiv.style.height = `${foodSize}px`;
        
        foodDiv.style.backgroundImage = `url('${memoryCache[`img/${type}.webp`] || `img/${type}.webp`}')`;
        
        const container = document.getElementById('game-container');
        const tablePoint = restored ? { x: restored.x, y: restored.y } : randomTablePoint(32);
        const target = projectBackgroundPoint(tablePoint);

        foodDiv.style.left = `${target.x - foodSize / 2}px`;
        foodDiv.style.top = restored ? `${target.y - foodSize / 2}px` : '-50px';
        
        container.appendChild(foodDiv);
        const foodItem = { type, element: foodDiv, x: tablePoint.x, y: tablePoint.y };
        foodOnTable.push(foodItem);
        updateUI();

        if (!restored) {
            setTimeout(() => { positionFoodElement(foodItem, true); saveRun(); }, 50);
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

    function getBirdCurrentCenterX(birdEl) {
        const container = document.getElementById('game-container');
        const birdRect = birdEl.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const scale = contRect.width / container.offsetWidth;
        return (birdRect.left + birdRect.width / 2 - contRect.left) / scale;
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

        const birdSize = 100 * birdData.scale;
        const tablePoint = randomTablePoint(Math.min(120, birdSize * .45));
        const target = projectBackgroundPoint(tablePoint);
        const targetX = target.x - birdSize / 2;
        const targetY = target.y - birdSize;
        birdEl.dataset.tableX = String(tablePoint.x);
        birdEl.dataset.tableY = String(tablePoint.y);

        birdEl.style.transition = 'top 2s linear, left 2s linear';
        
        const currentX = getBirdCurrentCenterX(birdEl);
        birdEl.style.transform = target.x > currentX ? 'scaleX(-1)' : 'scaleX(1)';

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
        delete birdEl.dataset.tableX;
        delete birdEl.dataset.tableY;

        let targetFoodObj = null;
        let foodIndex = -1;

        if (birdData.eats === 'enemy') {
            if (foodOnTable.length > 0) foodIndex = Math.floor(Math.random() * foodOnTable.length);
        } else {
            foodIndex = foodOnTable.findIndex(f => f.type === birdData.eats);
        }

        if (foodIndex !== -1) {
            targetFoodObj = foodOnTable[foodIndex];
            const foodPoint = projectBackgroundPoint(targetFoodObj);
            
            const currentX = getBirdCurrentCenterX(birdEl);
            const offset = birdSize * 0.35;
            const moveCenterX = foodPoint.x > currentX ? foodPoint.x - offset : foodPoint.x + offset;
            const moveX = moveCenterX - birdSize / 2;
            const moveY = foodPoint.y - birdSize + 16;

            birdEl.style.transform = moveCenterX > currentX ? 'scaleX(-1)' : 'scaleX(1)';
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
        delete birdEl.dataset.tableX;
        delete birdEl.dataset.tableY;
        
        birdEl.style.backgroundImage = `url('${memoryCache[`img/${birdData.images.fly}`] || `img/${birdData.images.fly}`}')`;
        const currentX = getBirdCurrentCenterX(birdEl);
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
            if (!isPaused) spawnLandingBird();
            gameLoop();
        }, 3000 + Math.random() * 3000);
    }

    function flybyLoop() {
        flybyLoopTimer = setTimeout(() => {
            if (!gameLoopsStarted) return;
            if (!isPaused) spawnFlybyBird();
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
