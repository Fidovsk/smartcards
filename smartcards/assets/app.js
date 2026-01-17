/***********************
 * Helpers
 ***********************/
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showAlert(message, type = 'info') {
  const map = {
    info:    { wrap: 'bg-blue-100 text-blue-800 border-blue-500',    btn:'text-blue-600',  icon:'fa-info-circle' },
    success: { wrap: 'bg-green-100 text-green-800 border-green-500', btn:'text-green-600', icon:'fa-check-circle' },
    error:   { wrap: 'bg-red-100 text-red-800 border-red-500',       btn:'text-red-600',   icon:'fa-exclamation-circle' },
    warning: { wrap: 'bg-yellow-100 text-yellow-800 border-yellow-500',btn:'text-yellow-600',icon:'fa-exclamation-triangle' }
  };
  const t = map[type] || map.info;
  const id = `alert-${Date.now()}`;

  const html = `
    <div id="${id}" class="fixed top-4 right-4 ${t.wrap} border-l-4 p-4 rounded-lg shadow-lg max-w-sm z-50 modal-fade">
      <div class="flex items-center">
        <i class="fas ${t.icon} mr-3"></i>
        <div class="flex-1">${message}</div>
        <button class="${t.btn} ml-4" onclick="document.getElementById('${id}')?.remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById(id)?.remove(), 4500);
}

function getLang(){ return localStorage.getItem('smartcards_lang') || 'ru'; }
function tr(ru, en){ return getLang()==='en' ? en : ru; }

/***********************
 * State
 ***********************/
let terms = [];
let flashcards = [];   // {term, front, back}
let questions = [];    // {q, a}
let currentCardIndex = 0;

const expandedCards = new Set(); // for read more toggles

const LS_NOTES_KEY = 'smartcards_notes_v1';
const LS_SETS_KEY  = 'smartcards_sets_v1';

const sampleText = `Митохондрия — это двумембранная органелла, являющаяся энергетической станцией клетки.
В ней происходит клеточное дыхание и синтезируется АТФ — универсальный источник энергии.

Фотосинтез — это процесс превращения световой энергии в химическую.
Он происходит в хлоропластах растений и некоторых бактерий.

Клеточное дыхание — процесс окисления органических веществ с выделением энергии.`;

/***********************
 * Definition finder (better)
 ***********************/
function getDefinitionForTerm(term, text) {
  const clean = term.replace(/"/g,'').trim();
  if (!clean) return null;

  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const reTerm = new RegExp(`\\b${escapeRegExp(clean)}\\b`, 'i');

  for (const s of sentences) {
    if (!reTerm.test(s)) continue;

    // try "— это / является / представляет собой"
    const reDef = new RegExp(
      `${escapeRegExp(clean)}\\s*[—-,:]?\\s*(?:это|является|представляет собой)\\s+([^.!?]+)`,
      'i'
    );
    if (reDef.test(s)) return s;

    // fallback
    return s;
  }
  return null;
}

/***********************
 * Questions generator with answers
 ***********************/
function generateQA(notesText, cards){
  const qa = [];

  // from cards
  for (const c of cards) {
    qa.push({ q: c.front, a: c.back, term: c.term });
  }

  // if very few, add generic
  if (qa.length < 5) {
    for (const c of cards.slice(0, 10)) {
      qa.push({
        q: tr(`Что вы знаете о «${c.term}»?`, `What do you know about "${c.term}"?`),
        a: c.back,
        term: c.term
      });
    }
  }

  // limit
  return qa.slice(0, 15);
}

/***********************
 * Sets (save/load)
 ***********************/
function loadSets(){
  try{
    return JSON.parse(localStorage.getItem(LS_SETS_KEY) || '[]');
  }catch{
    return [];
  }
}
function saveSets(sets){
  localStorage.setItem(LS_SETS_KEY, JSON.stringify(sets));
}
function refreshSetsUI(){
  const select = document.getElementById('sets-select');
  if (!select) return;

  const sets = loadSets();
  select.innerHTML = `<option value="">${tr('Выберите набор…','Select a set…')}</option>` +
    sets.map(s=>`<option value="${s.id}">${s.name} — ${new Date(s.createdAt).toLocaleString()}</option>`).join('');
}

function saveCurrentSet(){
  const name = prompt(tr('Название набора:','Set name:'));
  if (!name) return;

  const notes = document.getElementById('notes')?.value || '';
  const sets = loadSets();

  sets.unshift({
    id: `set_${Date.now()}`,
    name: name.trim(),
    createdAt: Date.now(),
    data: { notes, terms, flashcards, questions }
  });

  saveSets(sets.slice(0, 30));
  refreshSetsUI();
  showAlert(tr('Набор сохранён','Set saved'), 'success');
}

function loadSelectedSet(){
  const select = document.getElementById('sets-select');
  const id = select?.value;
  if (!id) return showAlert(tr('Выберите набор','Select a set'), 'warning');

  const sets = loadSets();
  const set = sets.find(s=>s.id===id);
  if (!set) return showAlert(tr('Набор не найден','Set not found'), 'error');

  const notesInput = document.getElementById('notes');
  if (notesInput) {
    notesInput.value = set.data.notes || '';
    localStorage.setItem(LS_NOTES_KEY, notesInput.value);
  }

  terms = set.data.terms || [];
  flashcards = set.data.flashcards || [];
  questions = set.data.questions || [];

  expandedCards.clear();
  renderAll();
  showAlert(tr('Набор загружен','Set loaded'), 'success');
}

function deleteSelectedSet(){
  const select = document.getElementById('sets-select');
  const id = select?.value;
  if (!id) return showAlert(tr('Выберите набор','Select a set'), 'warning');

  if (!confirm(tr('Удалить выбранный набор?','Delete selected set?'))) return;

  const sets = loadSets().filter(s=>s.id!==id);
  saveSets(sets);
  refreshSetsUI();
  showAlert(tr('Набор удалён','Set deleted'), 'success');
}

/***********************
 * Test mode
 ***********************/
let testItems = [];
let testIndex = 0;
let testAnswerVisible = false;

function openTestModal(){
  if (!questions.length && flashcards.length) {
    questions = generateQA(document.getElementById('notes')?.value || '', flashcards);
  }
  if (!questions.length) return showAlert(tr('Сначала сгенерируйте материалы','Generate materials first'), 'error');

  testItems = [...questions];
  testIndex = 0;
  testAnswerVisible = false;

  updateTestUI();

  const modal = document.getElementById('test-modal');
  modal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeTestModal(){
  document.getElementById('test-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function shuffleTest(){
  for (let i=testItems.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [testItems[i], testItems[j]] = [testItems[j], testItems[i]];
  }
  testIndex = 0;
  testAnswerVisible = false;
  updateTestUI();
}

function nextTest(){
  if (!testItems.length) return;
  testIndex = (testIndex + 1) % testItems.length;
  testAnswerVisible = false;
  updateTestUI();
}

function prevTest(){
  if (!testItems.length) return;
  testIndex = (testIndex - 1 + testItems.length) % testItems.length;
  testAnswerVisible = false;
  updateTestUI();
}

function toggleAnswer(){
  testAnswerVisible = !testAnswerVisible;
  updateTestUI();
}

function updateTestUI(){
  const qEl = document.getElementById('test-question');
  const aEl = document.getElementById('test-answer');
  const pEl = document.getElementById('test-progress');
  const btn = document.getElementById('test-show-answer-btn');

  if (!testItems.length) return;

  const item = testItems[testIndex];
  if (qEl) qEl.textContent = item.q;
  if (aEl) {
    aEl.textContent = item.a;
    aEl.classList.toggle('hidden', !testAnswerVisible);
  }
  if (pEl) pEl.textContent = tr(`Вопрос ${testIndex+1} из ${testItems.length}`, `Question ${testIndex+1} of ${testItems.length}`);
  if (btn) btn.textContent = testAnswerVisible ? tr('Скрыть ответ','Hide answer') : tr('Показать ответ','Show answer');
}

/***********************
 * DOM init
 ***********************/
document.addEventListener('DOMContentLoaded', () => {
  const notesInput = document.getElementById('notes');
  if (!notesInput) return; // in case non-index pages include this js by mistake

  // restore notes
  const saved = localStorage.getItem(LS_NOTES_KEY);
  if (saved && !notesInput.value.trim()) notesInput.value = saved;

  notesInput.addEventListener('input', () => {
    localStorage.setItem(LS_NOTES_KEY, notesInput.value);
    updateStats();
  });

  // main buttons
  document.getElementById('analyze-btn')?.addEventListener('click', analyzeNotes);
  document.getElementById('generate-btn')?.addEventListener('click', generateMaterials);
  document.getElementById('clear-btn')?.addEventListener('click', clearAll);
  document.getElementById('sample-btn')?.addEventListener('click', () => {
    notesInput.value = sampleText;
    localStorage.setItem(LS_NOTES_KEY, notesInput.value);
    updateStats();
    showAlert(tr('Пример загружен','Sample loaded'), 'info');
  });

  // export/share
  document.getElementById('export-anki-btn')?.addEventListener('click', exportToAnki);
  document.getElementById('export-pdf-btn')?.addEventListener('click', exportToPDF);
  document.getElementById('share-btn')?.addEventListener('click', shareMaterials);

  // copy/shuffle
  document.getElementById('copy-terms-btn')?.addEventListener('click', copyTerms);
  document.getElementById('shuffle-cards-btn')?.addEventListener('click', shuffleCards);
  document.getElementById('copy-questions-btn')?.addEventListener('click', copyQuestions);

  // sets UI
  document.getElementById('save-set-btn')?.addEventListener('click', saveCurrentSet);
  document.getElementById('load-set-btn')?.addEventListener('click', loadSelectedSet);
  document.getElementById('delete-set-btn')?.addEventListener('click', deleteSelectedSet);

  // test mode
  document.getElementById('test-mode-btn')?.addEventListener('click', openTestModal);
  document.getElementById('test-close-btn')?.addEventListener('click', closeTestModal);
  document.getElementById('test-prev-btn')?.addEventListener('click', prevTest);
  document.getElementById('test-next-btn')?.addEventListener('click', nextTest);
  document.getElementById('test-show-answer-btn')?.addEventListener('click', toggleAnswer);
  document.getElementById('test-shuffle-btn')?.addEventListener('click', shuffleTest);

  // flashcard modal
  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('prev-card-btn')?.addEventListener('click', showPrevCard);
  document.getElementById('next-card-btn')?.addEventListener('click', showNextCard);
  document.getElementById('flip-card-btn')?.addEventListener('click', flipCard);
  document.getElementById('modal-flashcard')?.addEventListener('click', flipCard);

  // globals for inline events
  window.openFlashcardModal = openFlashcardModal;
  window.toggleCardExpand = toggleCardExpand;
  window.addFlashcardForTerm = addFlashcardForTerm;
  window.editQuestion = editQuestion;

  refreshSetsUI();
  renderAll();
  updateStats();

  // close modals on ESC
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') {
      closeModal();
      closeTestModal();
    }
  });
});

/***********************
 * Core features
 ***********************/
function analyzeNotes(){
  const notes = document.getElementById('notes')?.value.trim() || '';
  if (!notes) return showAlert(tr('Пожалуйста, введите текст','Please paste your notes'), 'error');

  // better term extraction
  const termPattern = /([А-ЯЁA-Z][а-яёa-z]+-?[А-ЯЁA-Zа-яёa-z]*)|"[^"]+"|\b[A-ZА-ЯЁ]{2,}\b/g;
  const matches = notes.match(termPattern) || [];

  const nounsPattern = /\b[А-Яа-яЁё]{4,}\b/g;
  const nouns = notes.match(nounsPattern) || [];

  terms = [...new Set([...matches, ...nouns])]
    .map(t => t.trim())
    .filter(t => t.length > 3)
    .slice(0, 25);

  renderTerms();
  updateStats();

  showAlert(tr(`Найдено терминов: ${terms.length}`, `Terms found: ${terms.length}`), terms.length ? 'success' : 'warning');
}

function generateMaterials(){
  const notes = document.getElementById('notes')?.value.trim() || '';
  if (!notes) return showAlert(tr('Пожалуйста, введите текст','Please paste your notes'), 'error');
  if (!terms.length) return showAlert(tr('Сначала нажмите “Анализировать”','Click “Analyze” first'), 'error');

  flashcards = terms.map(term=>{
    const def = getDefinitionForTerm(term, notes);
    const clean = term.replace(/"/g,'');
    return {
      term: clean,
      front: tr(`Что такое «${clean}»?`, `What is "${clean}"?`),
      back: def || tr(`Определение для «${clean}» не найдено.`, `Definition for "${clean}" not found.`)
    };
  });

  questions = generateQA(notes, flashcards);

  expandedCards.clear();
  renderFlashcards();
  renderQuestions();
  updateStats();

  showAlert(tr(`Создано карточек: ${flashcards.length}, вопросов: ${questions.length}`, `Created cards: ${flashcards.length}, questions: ${questions.length}`), 'success');
}

/***********************
 * Render
 ***********************/
function renderAll(){
  renderTerms();
  renderFlashcards();
  renderQuestions();
}

function renderTerms(){
  const box = document.getElementById('key-terms');
  const badge = document.getElementById('terms-badge');
  if (!box) return;

  if (!terms.length){
    box.innerHTML = `<div class="text-gray-500 text-sm">${tr('Термины появятся после анализа','Terms will appear after analysis')}</div>`;
    if (badge) badge.textContent = '0';
    return;
  }

  box.innerHTML = terms.map(term => `
    <div class="p-3 bg-gray-50 rounded-lg border flex justify-between items-center s-card">
      <span class="font-medium">${term}</span>
      <button class="text-primary btn-soft" onclick="addFlashcardForTerm(${JSON.stringify(term)})" title="${tr('Добавить карточку','Add card')}">
        <i class="fas fa-plus-circle"></i>
      </button>
    </div>
  `).join('');

  if (badge) badge.textContent = String(terms.length);
}

function renderFlashcards(){
  const box = document.getElementById('flashcards');
  const badge = document.getElementById('cards-badge');
  if (!box) return;

  if (!flashcards.length){
    box.innerHTML = `<div class="text-gray-500 text-sm">${tr('Карточки будут здесь после генерации','Cards will appear here after generation')}</div>`;
    if (badge) badge.textContent = '0';
    return;
  }

  box.innerHTML = flashcards.map((c,i)=>{
    const isExp = expandedCards.has(i);
    const btnText = isExp ? tr('Скрыть','Hide') : tr('Читать полностью','Read more');
    const areaClass = isExp ? 'expand-area expanded' : 'expand-area';
    const previewClass = isExp ? '' : 'clamp-3';

    return `
      <div class="p-4 bg-white rounded-xl border s-card">
        <div class="text-sm font-semibold mb-2">${c.front}</div>

        <div class="${areaClass}">
          <div class="text-sm text-gray-700 ${previewClass}">
            ${c.back}
          </div>
        </div>

        <div class="mt-3 flex justify-between items-center text-sm">
          <button class="text-primary hover:underline btn-soft" onclick="toggleCardExpand(${i})">${btnText}</button>
          <button class="text-gray-600 hover:text-primary btn-soft" onclick="openFlashcardModal(${i})" title="${tr('Открыть','Open')}">
            <i class="fas fa-up-right-from-square"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (badge) badge.textContent = String(flashcards.length);
}

function renderQuestions(){
  const box = document.getElementById('quiz-questions');
  const badge = document.getElementById('questions-badge');
  if (!box) return;

  if (!questions.length){
    box.innerHTML = `<div class="text-gray-500 text-sm">${tr('Вопросы появятся после генерации','Questions will appear after generation')}</div>`;
    if (badge) badge.textContent = '0';
    return;
  }

  box.innerHTML = questions.map((x,i)=>`
    <div class="p-3 bg-gray-50 rounded-lg border s-card">
      <div class="font-medium mb-1">${i+1}. ${x.q}</div>
      <div class="flex justify-end gap-3 text-xs">
        <button class="text-amber-600 hover:underline btn-soft" onclick="editQuestion(${i})">
          <i class="fas fa-edit mr-1"></i> ${tr('Изменить','Edit')}
        </button>
      </div>
    </div>
  `).join('');

  if (badge) badge.textContent = String(questions.length);
}

/***********************
 * Actions
 ***********************/
function toggleCardExpand(index){
  if (expandedCards.has(index)) expandedCards.delete(index);
  else expandedCards.add(index);
  renderFlashcards();
}

function addFlashcardForTerm(term){
  const notes = document.getElementById('notes')?.value || '';
  const clean = String(term).replace(/"/g,'');
  const def = getDefinitionForTerm(clean, notes) || tr(`Определение для «${clean}» не найдено.`, `Definition for "${clean}" not found.`);
  flashcards.unshift({
    term: clean,
    front: tr(`Что такое «${clean}»?`, `What is "${clean}"?`),
    back: def
  });

  questions = generateQA(notes, flashcards);
  renderFlashcards();
  renderQuestions();
  updateStats();
  showAlert(tr('Карточка добавлена','Card added'), 'success');
}

function editQuestion(i){
  const cur = questions[i]?.q || '';
  const n = prompt(tr('Измените вопрос:','Edit question:'), cur);
  if (n === null) return;
  questions[i].q = n.trim();
  renderQuestions();
  showAlert(tr('Вопрос обновлён','Question updated'), 'success');
}

function clearAll(){
  const notesInput = document.getElementById('notes');
  if (notesInput) notesInput.value = '';
  localStorage.removeItem(LS_NOTES_KEY);

  terms = [];
  flashcards = [];
  questions = [];
  expandedCards.clear();

  renderAll();
  updateStats();
  showAlert(tr('Все данные очищены','All cleared'), 'info');
}

function shuffleCards(){
  if (!flashcards.length) return showAlert(tr('Нет карточек','No cards'), 'warning');
  for (let i=flashcards.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
  }
  expandedCards.clear();
  renderFlashcards();
  showAlert(tr('Карточки перемешаны','Cards shuffled'), 'success');
}

function copyTerms(){
  if (!terms.length) return showAlert(tr('Нет терминов','No terms'), 'warning');
  navigator.clipboard.writeText(terms.join('\n'))
    .then(()=>showAlert(tr('Термины скопированы','Terms copied'), 'success'))
    .catch(()=>showAlert(tr('Не удалось скопировать','Copy failed'), 'error'));
}

function copyQuestions(){
  if (!questions.length) return showAlert(tr('Нет вопросов','No questions'), 'warning');
  const text = questions.map((q,i)=>`${i+1}. ${q.q}`).join('\n');
  navigator.clipboard.writeText(text)
    .then(()=>showAlert(tr('Вопросы скопированы','Questions copied'), 'success'))
    .catch(()=>showAlert(tr('Не удалось скопировать','Copy failed'), 'error'));
}

function exportToAnki(){
  if (!flashcards.length) return showAlert(tr('Нет карточек для экспорта','No cards to export'), 'warning');
  const txt = flashcards.map(c => `${c.front}\t${c.back}`).join('\n');
  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'anki_cards.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showAlert(tr('Экспортировано для Anki','Exported for Anki'), 'success');
}

function exportToPDF(){
  if (!terms.length && !flashcards.length && !questions.length) {
    return showAlert(tr('Сначала сгенерируйте материалы','Generate materials first'), 'warning');
  }
  window.print();
}

function shareMaterials(){
  if (navigator.share) {
    navigator.share({
      title: tr('Умные Карточки','Smart Cards'),
      text: tr('Мои учебные материалы','My study materials'),
      url: location.href
    }).catch(()=>{});
  } else {
    showAlert(tr('Поделиться доступно чаще в мобильных браузерах','Sharing works best on mobile'), 'info');
  }
}

/***********************
 * Stats
 ***********************/
function calculateCompletion(){
  const notes = document.getElementById('notes')?.value.trim() || '';
  let c = 0;
  if (notes.length > 100) c += 30;
  if (terms.length) c += 20;
  if (flashcards.length) c += 30;
  if (questions.length) c += 20;
  return Math.min(100, c);
}

function updateStats(){
  const notes = document.getElementById('notes')?.value || '';
  const len = notes.length;
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0;

  const textLength = document.getElementById('text-length');
  const textProgress = document.getElementById('text-progress');
  const termsCount = document.getElementById('terms-count');
  const cardsCount = document.getElementById('cards-count');
  const questionsCount = document.getElementById('questions-count');
  const completionPercent = document.getElementById('completion-percent');
  const completionRing = document.getElementById('completion-ring');

  if (textLength) textLength.textContent = tr(`${len} символов, ${words} слов`, `${len} chars, ${words} words`);
  if (textProgress) textProgress.style.width = `${Math.min(100, (len/5000)*100)}%`;

  const comp = calculateCompletion();
  if (completionPercent) completionPercent.textContent = `${comp}%`;
  if (completionRing) completionRing.style.strokeDashoffset = String(100 - comp);

  if (termsCount) termsCount.textContent = String(terms.length);
  if (cardsCount) cardsCount.textContent = String(flashcards.length);
  if (questionsCount) questionsCount.textContent = String(questions.length);
}

/***********************
 * Flashcard modal
 ***********************/
function openFlashcardModal(i){
  if (!flashcards.length) return;
  currentCardIndex = i;

  const modal = document.getElementById('flashcard-modal');
  const front = document.getElementById('modal-front');
  const back = document.getElementById('modal-back');
  const card = flashcards[currentCardIndex];

  if (front) front.textContent = card.front;
  if (back) back.textContent = card.back;

  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
  document.body.style.overflow = 'hidden';

  document.getElementById('modal-flashcard')?.classList.remove('flipped');
}

function closeModal(){
  const modal = document.getElementById('flashcard-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  document.body.style.overflow = '';
  document.getElementById('modal-flashcard')?.classList.remove('flipped');
}

function showPrevCard(){
  if (!flashcards.length) return;
  currentCardIndex = (currentCardIndex - 1 + flashcards.length) % flashcards.length;
  openFlashcardModal(currentCardIndex);
}

function showNextCard(){
  if (!flashcards.length) return;
  currentCardIndex = (currentCardIndex + 1) % flashcards.length;
  openFlashcardModal(currentCardIndex);
}

function flipCard(){
  document.getElementById('modal-flashcard')?.classList.toggle('flipped');
}
