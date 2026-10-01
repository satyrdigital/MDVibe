// Language switcher for the MDVibe page. English lives in index.html (works
// without JavaScript); Ukrainian and Russian are swapped in here.
// Choice order: ?lang= in the URL → saved choice → English.
// The choice is remembered in localStorage on this device only; no cookies.
(function () {
  'use strict';

  var T = {
    uk: {
      'doc.title': 'MDVibe — спокійний переглядач Markdown для Windows',
      'nav.features': 'Можливості',
      'nav.install': 'Встановлення',
      'nav.privacy': 'Приватність',
      'hero.tagline': 'Markdown — спокійно.',
      'hero.lead': 'Легкий переглядач Markdown для Windows. Відкривайте файли .md як охайні, зручні для читання документи — з підсвічуванням коду, змістом, темами, друком і PDF.',
      'hero.download': 'Завантажити для Windows',
      'hero.meta': 'Безкоштовно · Windows 10 і 11 · Без реклами · Без стеження',
      'hero.source': 'Вихідний код на GitHub',
      'features.title': 'Усе, що потрібно для читання Markdown, — і нічого зайвого',
      'f1.title': 'Як на GitHub',
      'f1.text': 'Таблиці, списки завдань, виноски, примітки й посилання виглядають так, як ви звикли.',
      'f2.title': 'Зручний код',
      'f2.text': 'Підсвічування синтаксису для 35+ мов і кнопка «Копіювати» біля кожного блоку коду.',
      'f3.title': 'Зміст і нещодавні',
      'f3.text': 'Переходьте між заголовками й відкривайте нещодавні файли. Бічну панель можна сховати, коли хочеться просто читати.',
      'f4.title': 'Світла й темна',
      'f4.text': 'Тема перемикається одним кліком. Або автоматично — слідом за Windows.',
      'f5.title': 'Макети читання',
      'f5.text': 'Зручний, компактний, широкий чи книжковий — або налаштуйте шрифт, розмір і ширину самі. Посторінковий вигляд показує аркуші A4 чи Letter.',
      'f6.title': 'Друк і PDF',
      'f6.text': 'Друкуйте або зберігайте в PDF з охайним макетом — лише документ, без кнопок.',
      'f7.title': 'Живе оновлення',
      'f7.text': 'Коли інша програма змінює файл, MDVibe оновлює його й зберігає місце читання. Кожен файл відкривається у власному вікні.',
      'screens.title': 'Спокійно вдень і вночі',
      'screens.caption': 'Той самий документ у світлій і темній темі.',
      'look.title': 'Налаштуйте під себе',
      'look.layout': 'Макет читання: шаблони, шрифт, розмір, ширина — і посторінковий вигляд для друку.',
      'look.layout.alt': 'Панель макета читання з шаблонами, шрифтом, розміром, інтервалом, шириною й параметрами сторінки',
      'look.settings': 'Налаштування: тема, стиль Markdown та інше — в одному спокійному вікні.',
      'look.settings.alt': 'Вікно налаштувань: тема, стиль Markdown і акцентний колір заголовків',
      'privacy.title': 'Приватність за замовчуванням',
      'privacy.1': 'Без реклами й без стеження — у MDVibe немає жодної аналітики.',
      'privacy.2': 'Файли залишаються на вашому комп’ютері. Документи нікуди не завантажуються.',
      'privacy.3': 'Зображення з інтернету завантажуються лише з вашого дозволу.',
      'privacy.4': 'Посилання в документі ніколи не запускають інші програми.',
      'install.title': 'Встановлення за хвилину',
      'install.1': 'Завантажте MDVibe.',
      'install.2': 'Запустіть MDVibe-Setup.exe. Права адміністратора не потрібні.',
      'install.3': 'Відкрийте будь-який файл .md за допомогою MDVibe.',
      'install.4': 'За бажанням зробіть MDVibe програмою за замовчуванням для файлів Markdown.',
      'install.smartscreen': 'Windows може показати повідомлення SmartScreen, бо поточна збірка ще не має цифрового підпису. Якщо ви завантажили MDVibe з цієї сторінки, натисніть «Докладніше» → «Усе одно запустити».',
      'openwith.title': 'Відкривайте .md у MDVibe',
      'openwith.1': 'Клацніть правою кнопкою на файлі .md → «Відкрити за допомогою» → «Вибрати іншу програму».',
      'openwith.2': 'Виберіть MDVibe.',
      'openwith.3': 'Позначте «Завжди використовувати цю програму для відкриття файлів .md» і натисніть OK.',
      'openwith.note': 'Інсталятор ніколи сам не змінює програму за замовчуванням — вирішуєте ви.',
      'platforms': 'Версії для macOS і Linux заплановано.',
      'source.title': 'Вихідний код',
      'source.text': 'Вихідний код MDVibe відкритий (source-available) за ліцензією MIT із Commons Clause: можна безкоштовно використовувати — зокрема на роботі, — вивчати, змінювати й поширювати. Продавати сам MDVibe не можна.',
      'source.github': 'Переглянути на GitHub',
      'source.issue': 'Повідомити про проблему',
      'footer.by': 'Автор — Andrii Shumak',
      'footer.license': 'Ліцензія'
    },
    ru: {
      'doc.title': 'MDVibe — спокойный просмотрщик Markdown для Windows',
      'nav.features': 'Возможности',
      'nav.install': 'Установка',
      'nav.privacy': 'Приватность',
      'hero.tagline': 'Markdown — спокойно.',
      'hero.lead': 'Лёгкий просмотрщик Markdown для Windows. Открывайте файлы .md как аккуратные, удобные для чтения документы — с подсветкой кода, оглавлением, темами, печатью и PDF.',
      'hero.download': 'Скачать для Windows',
      'hero.meta': 'Бесплатно · Windows 10 и 11 · Без рекламы · Без слежки',
      'hero.source': 'Исходный код на GitHub',
      'features.title': 'Всё, что нужно для чтения Markdown, — и ничего лишнего',
      'f1.title': 'Как на GitHub',
      'f1.text': 'Таблицы, списки задач, сноски, примечания и ссылки выглядят так, как вы привыкли.',
      'f2.title': 'Удобный код',
      'f2.text': 'Подсветка синтаксиса для 35+ языков и кнопка «Копировать» у каждого блока кода.',
      'f3.title': 'Оглавление и недавние',
      'f3.text': 'Переходите между заголовками и открывайте недавние файлы. Боковую панель можно скрыть, когда хочется просто читать.',
      'f4.title': 'Светлая и тёмная',
      'f4.text': 'Тема переключается одним кликом. Или автоматически — вслед за Windows.',
      'f5.title': 'Макеты чтения',
      'f5.text': 'Удобный, компактный, широкий или книжный — или настройте шрифт, размер и ширину сами. Постраничный вид показывает листы A4 или Letter.',
      'f6.title': 'Печать и PDF',
      'f6.text': 'Печатайте или сохраняйте в PDF с аккуратным макетом — только документ, без кнопок.',
      'f7.title': 'Живое обновление',
      'f7.text': 'Когда другая программа меняет файл, MDVibe обновляет его и сохраняет место чтения. Каждый файл открывается в своём окне.',
      'screens.title': 'Спокойно днём и ночью',
      'screens.caption': 'Один и тот же документ в светлой и тёмной теме.',
      'look.title': 'Настройте под себя',
      'look.layout': 'Макет чтения: шаблоны, шрифт, размер, ширина — и постраничный вид для печати.',
      'look.layout.alt': 'Панель макета чтения с шаблонами, шрифтом, размером, интервалом, шириной и параметрами страницы',
      'look.settings': 'Настройки: тема, стиль Markdown и другое — в одном спокойном окне.',
      'look.settings.alt': 'Окно настроек: тема, стиль Markdown и акцентный цвет заголовков',
      'privacy.title': 'Приватность по умолчанию',
      'privacy.1': 'Без рекламы и без слежки — в MDVibe нет никакой аналитики.',
      'privacy.2': 'Файлы остаются на вашем компьютере. Документы никуда не загружаются.',
      'privacy.3': 'Изображения из интернета загружаются только с вашего разрешения.',
      'privacy.4': 'Ссылки в документе никогда не запускают другие программы.',
      'install.title': 'Установка за минуту',
      'install.1': 'Скачайте MDVibe.',
      'install.2': 'Запустите MDVibe-Setup.exe. Права администратора не нужны.',
      'install.3': 'Откройте любой файл .md с помощью MDVibe.',
      'install.4': 'При желании сделайте MDVibe программой по умолчанию для файлов Markdown.',
      'install.smartscreen': 'Windows может показать уведомление SmartScreen, потому что текущая сборка ещё не подписана цифровой подписью. Если вы скачали MDVibe с этой страницы, нажмите «Подробнее» → «Выполнить в любом случае».',
      'openwith.title': 'Открывайте .md в MDVibe',
      'openwith.1': 'Щёлкните правой кнопкой по файлу .md → «Открыть с помощью» → «Выбрать другое приложение».',
      'openwith.2': 'Выберите MDVibe.',
      'openwith.3': 'Отметьте «Всегда использовать это приложение для открытия файлов .md» и нажмите OK.',
      'openwith.note': 'Установщик никогда сам не меняет программу по умолчанию — решаете вы.',
      'platforms': 'Версии для macOS и Linux запланированы.',
      'source.title': 'Исходный код',
      'source.text': 'Исходный код MDVibe открыт (source-available) по лицензии MIT с Commons Clause: можно бесплатно использовать — в том числе на работе, — изучать, изменять и распространять. Продавать сам MDVibe нельзя.',
      'source.github': 'Смотреть на GitHub',
      'source.issue': 'Сообщить о проблеме',
      'footer.by': 'Автор — Andrii Shumak',
      'footer.license': 'Лицензия'
    }
  };

  var LANGS = ['en', 'uk', 'ru'];
  var nodes = document.querySelectorAll('[data-i18n]');
  var alts = document.querySelectorAll('[data-i18n-alt]');
  var english = {};
  for (var i = 0; i < nodes.length; i++) english[nodes[i].getAttribute('data-i18n')] = nodes[i].textContent;
  for (var a = 0; a < alts.length; a++) english[alts[a].getAttribute('data-i18n-alt')] = alts[a].getAttribute('alt');
  english['doc.title'] = document.title;

  function apply(lang) {
    var dict = lang === 'en' ? english : T[lang];
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      var text = (dict && dict[key]) || english[key];
      if (text) nodes[i].textContent = text;
    }
    for (var a = 0; a < alts.length; a++) {
      var akey = alts[a].getAttribute('data-i18n-alt');
      alts[a].setAttribute('alt', (dict && dict[akey]) || english[akey]);
    }
    document.title = (dict && dict['doc.title']) || english['doc.title'];
    document.documentElement.lang = lang;
    var buttons = document.querySelectorAll('.lang [data-lang]');
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].setAttribute('aria-pressed', String(buttons[j].getAttribute('data-lang') === lang));
    }
  }

  function save(lang) {
    try { localStorage.setItem('mdvibe-site-lang', lang); } catch (e) { /* private mode */ }
  }

  function initial() {
    var param = new URLSearchParams(location.search).get('lang');
    if (param && LANGS.indexOf(param) >= 0) return param;
    try {
      var saved = localStorage.getItem('mdvibe-site-lang');
      if (saved && LANGS.indexOf(saved) >= 0) return saved;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  var lang = initial();
  if (lang !== 'en') apply(lang);
  else apply('en');

  document.querySelector('.lang').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-lang]');
    if (!btn) return;
    var next = btn.getAttribute('data-lang');
    apply(next);
    save(next);
    // Shareable link to this language, e.g. …/mdvibe/?lang=uk
    var url = new URL(location.href);
    if (next === 'en') url.searchParams.delete('lang');
    else url.searchParams.set('lang', next);
    history.replaceState(null, '', url.toString());
  });
})();
