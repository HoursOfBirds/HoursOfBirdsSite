// Скрипт для управления Cookie-баннером и Google Analytics

// Твой ID аналитики
const GA_ID = 'G-VQQGBNZLET';

// Функция запуска Google Analytics
function injectGoogleAnalytics() {
    // Создаем первый скрипт (внешний)
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script1);

    // Создаем второй скрипт (инициализация)
    const script2 = document.createElement('script');
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    `;
    document.head.appendChild(script2);
}

// Функция создания баннера согласия
function createCookieBanner() {
    // Проверяем, давал ли пользователь согласие ранее
    if (localStorage.getItem('cookieConsent') === 'true') {
        injectGoogleAnalytics(); // Если да, просто запускаем аналитику и выходим
        return;
    }

    // Создаем сам баннер
    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    
    // Настраиваем дизайн баннера
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
        maxWidth: '600px',
        border: '1px solid #3a3a40',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    });

    banner.innerHTML = `
        <div style="flex-grow: 1; font-size: 14px; line-height: 1.5; color: #b0b0b0;">
            <b style="color: white; font-size: 16px;">🍪 Мы используем Cookie</b><br>
            Этот сайт использует файлы cookie и Google Analytics для сбора анонимной статистики, чтобы сделать проект лучше.
        </div>
        <button id="cookie-accept" style="background-color: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;">Понятно</button>
    `;

    document.body.appendChild(banner);

    // Вешаем событие на кнопку "Понятно"
    const btn = document.getElementById('cookie-accept');
    
    // Анимация при наведении
    btn.onmouseover = () => btn.style.backgroundColor = '#45a049';
    btn.onmouseout = () => btn.style.backgroundColor = '#4CAF50';

    btn.addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'true'); // Сохраняем согласие
        banner.remove(); // Удаляем баннер
        injectGoogleAnalytics(); // Запускаем аналитику
    });
}

// Запускаем проверку при загрузке страницы
document.addEventListener('DOMContentLoaded', createCookieBanner);