// Файл с локализацией и текстами
const GAME_TEXTS = {
    ru: {
        lbl_auto: "Авто",
        lbl_ru: "Русский",
        lbl_en: "English",
        
        btn_play: "▶ Играть",
        btn_pause: "⏸ Пауза",
        btn_loading: "⏳ Загрузка...",
        btn_back: "⬅ Назад",
        
        menu_vol: "⚙ Громкость",
        menu_lang: "🌍 Язык / Language:",
        menu_ads_on: "📺 Реклама: ВКЛ",
        menu_ads_off: "📺 Реклама: ВЫКЛ",
        menu_lore: "📖 Лор игры",
        menu_socials: "📱 Соцсети разработчика",
        menu_bugs: "🐛 Сообщить об ошибке",
        
        lbl_score: "Счет:",
        lbl_record: "Рекорд:",
        lbl_food: "Еда:",
        
        btn_seeds: "🌻 Семечки",
        btn_meat: "🥩 Мясо",

        title_lang: "Язык / Language",
        btn_lang_auto: "Авто",
        btn_lang_ru: "Русский",
        btn_lang_en: "English",

        title_settings: "Настройка громкости",
        lbl_music: "🎵 Музыка",
        lbl_nature: "🌲 Природа",
        lbl_sfx: "🔊 Звуки",

        title_lore: "Лор игры",
        text_lore: "Кормите Птиц! Суть игры в том, что вы кормите птиц. Кладите на стол мясо и семечки в зависимости от вида птицы. Максимум на столе помещается 10 штук еды! Для Сорок, Чёрных Коршунов и Серых Ворон нужно класть мясо, а для Синичек, Лазоревок, Снегирей и Воробьёв - семечки!<br><br>Прогоняйте голубей, нажимая на них, когда они сели на стол! За каждое успешное кормление птиц кроме голубей +1 очко, за отсутствие корма на столе -1 очко, если вдруг вы не успели прогнать голубя, то -2 очка!<br><br>Копите солнышки! За успешное кормление каждых 100 птиц, вам будет выдаваться по 1 солнышку! В будущем появится внутриигровой магазин, где вы сможете обменять солнышки на что-нибуть новое.<br><br>Включайте и настраивайте громкость музыки, звуков, природы на свой выбор через паузу.",

        title_ads: "Настройка рекламы",
        text_ads: "Кормя птиц с рекламой, вы фактически, кормите их и в реальной жизни. Деньги, полученные с рекламы, идут на корм птицам и поддержания проекта в целом. Однако, включать или выключать рекламу - решение остаётся за вами.",
        btn_enable_ads: "📺 Включить рекламу",
        
        title_ad_alert: "Реклама",
        text_ad_alert: "Спасибо, что решили включить рекламу. Но сейчас её нет физически, поэтому включить её не получится, надеюсь у меня получится добавить её позже. <br><br>Однако вы можете подписаться на телеграмм канал или Ютуб канал, буду вам благодарен!",

        title_bugs: "Сообщить об ошибке",
        text_bugs: "<b>Известные проблемы:</b><br>- Птицы иногда летают спиной (ИСПРАВЛЕНО!)<br>- Птицы иногда выходят за край стола<br>- Не пугайтесь невидимых птиц! Они подгружаются. Подождите немного, конечная скорость загрузки зависит от скорости вашего интернета. В будущем я постараюсь оптимизировать этот момент. Хорошей игры!<br><br>На данный момент, чтобы сообщить об проблеме, нужно перейти в телеграмм канал разработчика и написать о проблеме в комментариях, приложив фото/видео в своём сообщении. Не забудьте добавить тег #проблема чтобы я быстрее среагировал. Спасибо за ваш вклад в развитие проекта!",

        title_socials: "Соцсети разработчика",
        social_links: [
            { name: "📱 Telegram", url: "https://t.me/HoursOfBirds" },
            { name: "▶️ YouTube", url: "https://youtube.com/@hoursofbirds" },
            { name: "🟩 Пикабу", url: "https://pikabu.ru/@HoursOfBirds" },
            { name: "🌐 Сайт", url: "https://hoursofbirds.com" }
        ]
    },
    en: {
        lbl_auto: "Auto",
        lbl_ru: "Русский",
        lbl_en: "English",
        
        btn_play: "▶ Play",
        btn_pause: "⏸ Pause",
        btn_loading: "⏳ Loading...",
        btn_back: "⬅ Back",
        
        menu_vol: "⚙ Volume",
        menu_lang: "🌍 Language / Язык:",
        menu_ads_on: "📺 Ads: ON",
        menu_ads_off: "📺 Ads: OFF",
        menu_lore: "📖 Game Lore",
        menu_socials: "📱 Developer Socials",
        menu_bugs: "🐛 Report a Bug",
        
        lbl_score: "Score:",
        lbl_record: "Best:",
        lbl_food: "Food:",
        
        btn_seeds: "🌻 Seeds",
        btn_meat: "🥩 Meat",

        title_lang: "Language",
        btn_lang_auto: "Auto",
        btn_lang_ru: "Русский",
        btn_lang_en: "English",

        title_settings: "Volume Settings",
        lbl_music: "🎵 Music",
        lbl_nature: "🌲 Nature",
        lbl_sfx: "🔊 SFX",

        title_lore: "Game Lore",
        text_lore: "Feed the Birds! The goal is to feed the birds. Put meat and seeds on the table depending on the bird type. A maximum of 10 food items fit on the table! Magpies, Black Kites, and Hooded Crows eat meat. Tits, Blue Tits, Bullfinches, and Sparrows eat seeds!<br><br>Chase away the pigeons by clicking on them when they land! Each successfully fed bird gives +1 point, no food on the table gives -1 point, and missing a pigeon gives -2 points!<br><br>Collect suns! You will receive 1 sun for every 100 birds you successfully feed! An in-game store will be added in the future where you can exchange your suns for something new.<br><br>Turn on and adjust the volume of music, sounds, and nature to your liking via the pause menu.",

        title_ads: "Ad Settings",
        text_ads: "By feeding birds with ads enabled, you actually feed them in real life. The money earned from ads goes towards bird food and supporting the overall project. However, turning ads on or off is completely up to you.",
        btn_enable_ads: "📺 Enable Ads",
        
        title_ad_alert: "Advertisements",
        text_ad_alert: "Thank you for deciding to enable ads. However, they are not physically available right now, so it's not possible to turn them on. I hope to add them later.<br><br>In the meantime, you can subscribe to my Telegram or YouTube channel, I would be grateful!",

        title_bugs: "Report a Bug",
        text_bugs: "<b>Known issues:</b><br>- Birds sometimes fly backwards (FIXED!)<br>- Birds sometimes land off the table edges<br>- Don't worry about the invisible birds! They are just loading. Please wait a bit, the loading time depends on your internet speed. I'll try to optimize this in the future. Enjoy the game!<br><br>Currently, to report an issue, please go to the developer's Telegram channel and describe the problem in the comments, attaching a photo/video. Don't forget to add the #bug tag so I can react faster. Thank you for contributing to the project!",

        title_socials: "Developer Socials",
        social_links: [
            { name: "📱 Telegram", url: "https://t.me/HoursOfBirds" },
            { name: "▶️ YouTube", url: "https://youtube.com/@hoursofbirds" },
            { name: "🔥 Reddit", url: "https://www.reddit.com/u/HoursOfBirds" },
            { name: "🌐 Site", url: "https://hoursofbirds.com" }
        ]
    }
};