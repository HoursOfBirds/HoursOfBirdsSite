(() => {
    let isAssetsLoaded = false;
    const memoryCache = {};

    function resizeContainer() {
        const wrapper = document.getElementById('app-wrapper');
        const scale = Math.min(window.innerWidth / 1350, window.innerHeight / 880, 1.5);
        wrapper.style.transform = `scale(${scale})`;
    }
    window.addEventListener('resize', resizeContainer);
    resizeContainer();

    const BIRD_TYPES = {
        tit: { id: 'tit', eats: 'seeds', scale: 0.75, images: { fly: 'tit_fly.png', landing: 'tit_landing.png', sit: 'tit_sit.png', eat: 'tit_eat.png' } },
        sparrow: { id: 'sparrow', eats: 'seeds', scale: 0.8, images: { fly: 'sparrow_fly.png', landing: 'sparrow_landing.png', sit: 'sparrow_sit.png', eat: 'sparrow_eat.png' } },
        bluetit: { id: 'bluetit', eats: 'seeds', scale: 0.7, images: { fly: 'bluetit_fly.png', landing: 'bluetit_landing.png', sit: 'bluetit_sit.png', eat: 'bluetit_eat.png' } },
        bullfinch: { id: 'bullfinch', eats: 'seeds', scale: 0.85, images: { fly: 'bullfinch_fly.png', landing: 'bullfinch_landing.png', sit: 'bullfinch_sit.png', eat: 'bullfinch_eat.png' } },
        crow: { id: 'crow', eats: 'meat', scale: 1.6, images: { fly: 'crow_fly.png', landing: 'crow_landing.png', sit: 'crow_sit.png', eat: 'crow_eat.png' } },
        magpie: { id: 'magpie', eats: 'meat', scale: 1.5, images: { fly: 'magpie_fly.png', landing: 'magpie_landing.png', sit: 'magpie_sit.png', eat: 'magpie_eat.png' } },
        kite: { id: 'kite', eats: 'meat', scale: 3.0, images: { fly: 'kite_fly.png', landing: 'kite_landing.png', sit: 'kite_sit.png', eat: 'kite_eat.png' } },
        pigeon: { id: 'pigeon', eats: 'enemy', scale: 1.4, images: { fly: 'pigeon_fly.png', landing: 'pigeon_landing.png', sit: 'pigeon_sit.png', eat: 'pigeon_eat.png' } }
    };
    const BIRD_KEYS = Object.keys(BIRD_TYPES);
    const SFX_CONFIG = { meat: 3, seeds: 22 };

    // --- ФИКС: РАБОТА С ОЗУ (RAM CACHE) + МУЗЫКА ---
    const assetList = [
        'img/seeds.png', 
        'img/meat.png',
        'audio/music.ogg',   // Добавлена музыка
        'audio/nature.ogg'   // Добавлена природа
    ];
    
    Object.values(BIRD_TYPES).forEach(bird => {
        assetList.push(`img/${bird.images.fly}`);
        assetList.push(`img/${bird.images.landing}`);
        assetList.push(`img/${bird.images.sit}`);
        assetList.push(`img/${bird.images.eat}`);
    });
    for (let i = 1; i <= SFX_CONFIG.seeds; i++) assetList.push(`audio/Seedsfall${i}.ogg`);
    for (let i = 1; i <= SFX_CONFIG.meat; i++) assetList.push(`audio/Meatfall${i}.ogg`);

    // Вспомогательная функция: Пытается скачать файл 5 раз с паузой 1 сек
    async function fetchWithRetry(url, retries = 5) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.blob();
            } catch (e) {
                if (i === retries - 1) throw e; // Если последняя попытка - выбрасываем ошибку
                console.warn(`[ОЗУ] Сбой скачивания ${url}. Попытка ${i + 2} из ${retries}...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Ждем 1 секунду
            }
        }
    }

    async function initRAMCache() {
        applyLocalization(); 
        try {
            const fetchPromises = assetList.map(async (url) => {
                try {
                    const blob = await fetchWithRetry(url, 5); // 5 попыток
                    memoryCache[url] = URL.createObjectURL(blob);
                } catch(e) {
                    console.warn(`[ОЗУ] Не удалось скачать ${url} после 5 попыток. Включен фолбэк.`);
                    memoryCache[url] = url; 
                }
            });
            
            await Promise.all(fetchPromises);
            console.log("[ОЗУ] Все файлы игры (включая музыку) загружены в оперативную память.");
            
            initAudioPool(); 
            
            isAssetsLoaded = true;
            applyLocalization(); 
            
            gameLoop();
            flybyLoop();

        } catch(e) {
            console.error("Критическая ошибка кэша", e);
            isAssetsLoaded = true;
            applyLocalization();
            gameLoop();
            flybyLoop();
        }
    }

    // --- ФИКС: АУДИО-ПУЛ ---
    const audioPool = {};
    let musicAudio = null;
    let natureAudio = null;

    function initAudioPool() {
        // Подхватываем музыку из памяти
        const musicUrl = memoryCache['audio/music.ogg'] || 'audio/music.ogg';
        const natureUrl = memoryCache['audio/nature.ogg'] || 'audio/nature.ogg';
        
        musicAudio = new Audio(musicUrl);
        musicAudio.loop = true;
        musicAudio.volume = 0.34;

        natureAudio = new Audio(natureUrl);
        natureAudio.loop = true;
        natureAudio.volume = 0.69;

        // Подхватываем звуки
        audioPool['seeds'] = [];
        for (let i = 1; i <= SFX_CONFIG.seeds; i++) {
            const url = memoryCache[`audio/Seedsfall${i}.ogg`] || `audio/Seedsfall${i}.ogg`;
            const audio = new Audio(url);
            audio.preload = "auto";
            audioPool['seeds'].push(audio);
        }
        
        audioPool['meat'] = [];
        for (let i = 1; i <= SFX_CONFIG.meat; i++) {
            const url = memoryCache[`audio/Meatfall${i}.ogg`] || `audio/Meatfall${i}.ogg`;
            const audio = new Audio(url);
            audio.preload = "auto";
            audioPool['meat'].push(audio);
        }
    }

    const getSalt = () => atob("SDB1clNfMGZfQjFyZFNfUzNjcjN0XzIwMjYh"); 
    
    function generateHash(val) {
        return btoa(val.toString() + getSalt()); 
    }

    function secureSave(key, val) {
        localStorage.setItem(key, val);
        localStorage.setItem(key + '_hash', generateHash(val));
    }

    function secureLoad(key, defaultVal) {
        const val = localStorage.getItem(key);
        const hash = localStorage.getItem(key + '_hash');
        
        if (val === null) return defaultVal; 
        
        if (hash === null) {
            let parsedVal = parseInt(val) || defaultVal;
            let isCheater = false;
            
            if (key === 'birdSunCoins' && parsedVal > 20) isCheater = true;
            if (key === 'birdHighScore' && parsedVal > 2000) isCheater = true;
            if (key === 'birdFedCount' && parsedVal > 2000) isCheater = true;

            if (isCheater) {
                console.warn(`[Античит] Сброс сохранения ${key}: ${parsedVal}`);
                secureSave(key, defaultVal); 
                return defaultVal;
            } else {
                secureSave(key, parsedVal); 
                return parsedVal;
            }
        }

        if (hash !== generateHash(val)) {
            console.warn(`[Античит] Подделка ${key}!`);
            secureSave(key, defaultVal); 
            return defaultVal;
        }
        
        return parseInt(val) || defaultVal;
    }

    let score = 0;
    let highScore = secureLoad('birdHighScore', 0);
    let fedBirdsCount = secureLoad('birdFedCount', 0);
    let sunCoins = secureLoad('birdSunCoins', 0);
    
    let foodOnTable = [];
    const MAX_FOOD = 10;
    document.getElementById('high-score').innerText = highScore;

    let isPaused = true; 
    let sfxEnabled = true;
    let sfxVolume = 1.0;
    let adsEnabled = false;

    const menus = ['menu-main', 'menu-settings', 'menu-language', 'menu-ads', 'menu-lore', 'menu-ad-alert', 'menu-bugs', 'menu-socials'];

    let currentLangMode = localStorage.getItem('siteLang') || 'auto';

    function setText(id, text, isHTML = false) {
        const el = document.getElementById(id);
        if (el) {
            if (isHTML) el.innerHTML = text;
            else el.innerText = text;
        }
    }

    function applyLocalization() {
        let lang = currentLangMode;
        if (lang === 'auto') {
            lang = localStorage.getItem('siteLang') || (navigator.language.startsWith('ru') ? 'ru' : 'en');
        }
        if (lang === 'auto') lang = 'ru'; 
        
        const dict = GAME_TEXTS[lang];
        if (!dict) return;

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
        setText('txt-desc-lore', dict.text_lore, true);
        
        setText('txt-title-ads', dict.title_ads);
        setText('txt-desc-ads', dict.text_ads, true);
        setText('txt-btn-enable-ads', dict.btn_enable_ads);
        setText('txt-title-ad-alert', dict.title_ad_alert);
        setText('txt-desc-ad-alert', dict.text_ad_alert, true);
        
        setText('txt-title-bugs', dict.title_bugs);
        setText('txt-desc-bugs', dict.text_bugs, true);
        
        setText('txt-title-socials', dict.title_socials);
        const socialsContainer = document.getElementById('socials-container');
        if (socialsContainer) {
            socialsContainer.innerHTML = ''; 
            dict.social_links.forEach(link => {
                const a = document.createElement('a');
                a.href = link.url;
                a.target = "_blank"; 
                a.className = "menu-btn social-btn";
                a.innerText = link.name;
                socialsContainer.appendChild(a);
            });
        }

        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.innerText = dict.btn_back;
        });
    }

    function setLanguage(lang) {
        currentLangMode = lang;
        if (lang === 'auto') {
            localStorage.removeItem('siteLang'); 
        } else {
            localStorage.setItem('siteLang', lang); 
        }
        
        document.getElementById('lang-auto').classList.remove('active');
        document.getElementById('lang-ru').classList.remove('active');
        document.getElementById('lang-en').classList.remove('active');
        document.getElementById('lang-' + lang).classList.add('active');
        applyLocalization();
    }

    function updateSunUI() {
        document.getElementById('sun-val').innerText = sunCoins;
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('lang-auto').classList.remove('active');
        document.getElementById('lang-ru').classList.remove('active');
        document.getElementById('lang-en').classList.remove('active');
        document.getElementById('lang-' + currentLangMode).classList.add('active');
        
        updateSunUI();
        initRAMCache();
    });

    function openMenu(menuId) {
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
        const v = val / 100;
        if (audioId === 'audio-music') musicAudio.volume = v;
        if (audioId === 'audio-nature') natureAudio.volume = v;
    }
    
    function changeSfxVolume(val) { sfxVolume = val / 100; }

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

    function addFood(type) {
        if (foodOnTable.length >= MAX_FOOD) return;
        const foodDiv = document.createElement('div');
        foodDiv.className = `food-item`;
        
        const isMeat = type === 'meat';
        const foodSize = isMeat ? 80 : 40;
        foodDiv.style.width = `${foodSize}px`;
        foodDiv.style.height = `${foodSize}px`;
        
        foodDiv.style.backgroundImage = `url('${memoryCache[`img/${type}.png`] || `img/${type}.png`}')`; 
        
        const tableZone = document.getElementById('table-zone');
        const container = document.getElementById('game-container');
        
        const randomX = tableZone.offsetLeft + Math.random() * (tableZone.offsetWidth - foodSize);
        const targetY = tableZone.offsetTop + Math.random() * (tableZone.offsetHeight - foodSize);

        foodDiv.style.left = `${randomX}px`;
        foodDiv.style.top = `-50px`; 
        
        container.appendChild(foodDiv);
        foodOnTable.push({ type: type, element: foodDiv });
        updateUI();

        setTimeout(() => { foodDiv.style.top = `${targetY}px`; }, 50);
        setTimeout(() => { playSfx(type); }, 550);
    }

    function updateUI() {
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
        const targetY = tableZone.offsetTop + Math.random() * (tableZone.offsetHeight - 30) - (birdSize * 0.75);

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
            const moveY = foodTop - (birdSize * 0.4);

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

    function gameLoop() { setTimeout(() => { spawnLandingBird(); gameLoop(); }, 3000 + Math.random() * 3000); }
    function flybyLoop() { setTimeout(() => { spawnFlybyBird(); flybyLoop(); }, 5000 + Math.random() * 5000); }

    window.togglePause = togglePause;
    window.startGame = startGame;
    window.openMenu = openMenu;
    window.setLanguage = setLanguage;
    window.tryToggleAds = tryToggleAds;
    window.changeVolume = changeVolume;
    window.changeSfxVolume = changeSfxVolume;
    window.toggleSfx = toggleSfx;
    window.toggleAudio = toggleAudio;
    window.playSfx = playSfx;
    window.addFood = addFood;

})();