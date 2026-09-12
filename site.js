(() => {
    const translations = {
        ru: {
            title: 'Hours of Birds',
            description: 'Wow! Основной сайт всё ещё в разработке. Но вы уже можете поиграть в игру или посетить официальные соцсети проекта!',
            btn_game: '🎮 Игра «Покорми Птиц!»'
        },
        en: {
            title: 'Hours of Birds',
            description: "Wow! The main website is still under development. But you can already play the game or visit the project's official social networks!",
            btn_game: '🎮 Play «Feed the Birds!»'
        }
    };
    const supportedLanguages = new Set(Object.keys(translations));

    function getLanguage() {
        const stored = localStorage.getItem('siteLang');
        return supportedLanguages.has(stored) ? stored : (navigator.language.startsWith('ru') ? 'ru' : 'en');
    }

    function setLanguage(lang) {
        if (!supportedLanguages.has(lang)) return;
        localStorage.setItem('siteLang', lang);
        const dictionary = translations[lang];
        document.getElementById('title').textContent = dictionary.title;
        document.getElementById('description').textContent = dictionary.description;
        document.getElementById('btn-game').textContent = dictionary.btn_game;
        document.querySelectorAll('[data-site-language]').forEach(button => {
            button.classList.toggle('active', button.dataset.siteLanguage === lang);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-site-language]');
            if (button) setLanguage(button.dataset.siteLanguage);
        });
        setLanguage(getLanguage());
    });
})();
