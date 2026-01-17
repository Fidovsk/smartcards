const I18N = {
  ru: {
    brand: "Умные Карточки",
    "nav.home": "Главная",
    "nav.how": "Как это работает",
    "nav.about": "О проекте",
    "nav.contacts": "Контакты",
  },
  en: {
    brand: "Smart Cards",
    "nav.home": "Home",
    "nav.how": "How it works",
    "nav.about": "About",
    "nav.contacts": "Contacts",
  }
};

function getLang(){
  return localStorage.getItem('smartcards_lang') || 'ru';
}
function setLang(lang){
  localStorage.setItem('smartcards_lang', lang);
  applyI18n();
  updateLangButtons();
}
function t(key){
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || key;
}
window.t = t;

async function loadPartial(selector, url) {
  const el = document.querySelector(selector);
  if (!el) return;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.innerHTML = await res.text();
  } catch (e) {
    el.innerHTML = `<div class="p-4 bg-red-100 text-red-800">
      Ошибка загрузки ${url}. Открой сайт через Live Server / локальный сервер.
    </div>`;
  }
}

function setActiveNavLink() {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.nav === current) {
      link.classList.add('text-primary', 'font-semibold');
      link.classList.remove('text-gray-600');
    }
  });
}

function applyI18n(){
  const lang = getLang();
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    el.textContent = (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : el.textContent;
  });

  // placeholder translation
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : el.getAttribute('placeholder'));
  });
}

function updateLangButtons(){
  const lang = getLang();
  const ru = document.getElementById('lang-ru');
  const en = document.getElementById('lang-en');
  if (!ru || !en) return;
  ru.classList.toggle('active', lang === 'ru');
  en.classList.toggle('active', lang === 'en');
}

function initLangSwitcher(){
  const ru = document.getElementById('lang-ru');
  const en = document.getElementById('lang-en');
  if (ru) ru.addEventListener('click', ()=>setLang('ru'));
  if (en) en.addEventListener('click', ()=>setLang('en'));
  updateLangButtons();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadPartial('#site-header', 'partials/header.html');
  await loadPartial('#site-footer', 'partials/footer.html');

  setActiveNavLink();
  initLangSwitcher();
  applyI18n();
});
