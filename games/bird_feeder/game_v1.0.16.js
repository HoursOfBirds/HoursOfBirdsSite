// Совместимость с кэшированными страницами версии 1.0.16.
// После обновления HTML они используют game_v1.0.17.js напрямую.
(() => {
    document.title = 'Покорми Птиц! V1.0.17';
    const versionLabel = document.querySelector('.game-version');
    if (versionLabel) versionLabel.textContent = 'V1.0.17';

    const script = document.createElement('script');
    script.src = 'game_v1.0.17.js';
    script.defer = true;
    document.head.appendChild(script);
})();
