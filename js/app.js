// ===== Навігація між екранами =====
const SECTION_IDS = ["home", "letters", "train"];
const sections = {};
SECTION_IDS.forEach(id => sections[id] = document.getElementById(id) || null);

function showSection(id){
  Object.values(sections).forEach(el => { if(el) el.style.display = "none"; });
  if(sections[id]) sections[id].style.display = "block";
}
showSection("home");

document.getElementById('navBrand')?.addEventListener('click', () => showSection('home'));
document.getElementById('navHome') ?.addEventListener('click', () => showSection('home'));

// ===== SFX (звуки) =========================================
// Поклади файли сюди: assets/sfx/click.mp3, pick.mp3, snap.mp3, correct.mp3, wrong.mp3
const SFX = {
  click:   new Audio('assets/sfx/click.mp3'),   // кліки по кнопках (меню, літери тощо)
  pick:    new Audio('assets/sfx/pick.mp3'),    // взяття вагона
  snap:    new Audio('assets/sfx/snap.mp3'),    // вагон “прилип”
  correct: new Audio('assets/sfx/correct.mp3'), // правильна відповідь
  wrong:   new Audio('assets/sfx/wrong.mp3')    // неправильна відповідь
};
// базові налаштування та універсальний обробник кліків по кнопках
(function setupSfx(){
  for (const a of Object.values(SFX)) { a.preload = 'auto'; a.volume = 0.9; }
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button, .menu__btn, .game-btn, .letter-btn');
    // щоб у квізі не було подвійного звуку (клік + correct/wrong)
    if (btn && !e.target.closest('.quiz-opt')) playSfx('click');
  }, true);
})();
function playSfx(name){
  const a = SFX[name];
  if (!a) return;
  try { a.currentTime = 0; a.play(); } catch(_) {}
}

// (на майбутнє) озвучка слів — підкинеш mp3 у assets/sfx/words/<EN>/<id>.mp3 і викличеш playWordAudio(word)
function playWordAudio(word, letterEN){
  if (!word?.id) return;
  const src = `assets/sfx/words/${letterEN}/${word.id}.mp3`;
  const audio = new Audio(src);
  audio.preload = 'auto';
  try { audio.play(); } catch(_) {}
}
// ==========================================================

// ===== Транслітерація: UA ↔ EN (коди для файлів/папок) =====
const MAP_UA_EN = {
  "А":"A","Б":"B","В":"V","Г":"H","Ґ":"G","Д":"D","Е":"E","Є":"YE","Ж":"ZH","З":"Z",
  "И":"Y","І":"I","Ї":"YI","Й":"J","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P",
  "Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"KH","Ц":"TS","Ч":"CH","Ш":"SH","Щ":"SCH",
  "Ь":"SOFT","Ю":"YU","Я":"YA"
};
const MAP_EN_UA = Object.fromEntries(Object.entries(MAP_UA_EN).map(([ua,en])=>[en,ua]));
const UA_ALPHABET = ["А","Б","В","Г","Ґ","Д","Е","Є","Ж","З","И","І","Ї","Й","К","Л","М","Н","О","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Ь","Ю","Я"];

const uaToEn = ua => MAP_UA_EN[ua] || ua;
const enToUa = en => MAP_EN_UA[en] || en;

// ===== Головна → Вибір літери =====
document.getElementById("gameTrain")?.addEventListener("click", async () => {
  await buildLetters();
  showSection("letters");
});

const lettersGrid = document.getElementById("lettersGrid");
document.getElementById("backToHome")?.addEventListener("click", () => showSection("home"));

// ===== Динамічні дані з JSON (EN-коди) =====
const wordsCache = new Map();   // "R" -> масив слів
let lettersListEN = [];         // ["R","S",...]

async function loadLettersListEN(){
  if (lettersListEN.length) return lettersListEN;
  const res = await fetch('data/letters.json');
  lettersListEN = await res.json();
  return lettersListEN;
}
async function loadWordsEN(letterEN){
  if (wordsCache.has(letterEN)) return wordsCache.get(letterEN);
  const res = await fetch(`data/words/${letterEN}.json`);
  const data = await res.json();
  wordsCache.set(letterEN, data);
  return data;
}

async function buildLetters(){
  lettersGrid.innerHTML = "";
  const listEN = await loadLettersListEN();            // EN-коди доступних
  const available = new Set(listEN);

  UA_ALPHABET.forEach(ua => {
    const en = uaToEn(ua);
    const btn = document.createElement("button");
    btn.className = "letter-btn";
    btn.textContent = ua;
    if (!available.has(en)) {
      btn.disabled = true; btn.title = "Скоро буде";
    } else {
      btn.addEventListener("click", () => startTrain(ua));
    }
    lettersGrid.appendChild(btn);
  });
}

// ===== Елементи сцени =====
const trainLetterEl = document.getElementById("trainLetter");
const locoLetterEl  = document.getElementById("locoLetter");
const wagonsLayer   = document.getElementById("wagonsLayer");
const slotsEl       = document.getElementById("slots");
const playfield     = document.getElementById("playfield");
document.getElementById("backToLetters")?.addEventListener("click", () => showSection("letters"));
document.getElementById("restartTrain") ?.addEventListener("click", () => startTrain(currentLetterUA));

// ---- Стан гри/квізу
let currentLetterUA = "Р";
let currentLetterEN = "R";

let order = [];
let fixedCount = 0;
const MAGNET_PAD = 60;

let currentSet = [];            // 6 обраних слів [{id,text,img}]
let idToWord   = new Map();     // id -> слово

// ===== Допоміжне: шлях до картинки слова (дозволяємо або повний шлях, або тільки файлнейм) =====
function resolveWordImg(word){
  const fallback = "assets/img/placeholder-word.png";
  if (!word) return fallback;
  const src = (word.img || "").trim();
  if (!src) return fallback;
  if (src.includes("/")) return src;                       // вже повний шлях
  return `assets/img/words/${currentLetterEN}/${src}`;     // скласти з EN-кодом
}

// ===== Запуск сцени =====
async function startTrain(letterUA){
  currentLetterUA = letterUA;
  currentLetterEN = uaToEn(letterUA);

  showSection("train");
  trainLetterEl.textContent = letterUA;
  locoLetterEl.textContent  = letterUA;

  const hint = document.getElementById("trainHint");
  if(hint) hint.textContent = "Перетягни вагон до підсвіченого пунктирного слоту (зліва → вправо).";

  order = []; fixedCount = 0;

  // 6 слотів
  slotsEl.innerHTML = "";
  for(let i=0;i<6;i++){ const s=document.createElement("div"); s.className="slot"; slotsEl.appendChild(s); }
  computeAndApplySlotSize();

  // Підтягуємо слова для EN-коду літери
  const pool = await loadWordsEN(currentLetterEN);
  currentSet = pickRandom(pool, Math.min(6, pool.length));
  idToWord = new Map(currentSet.map(w => [w.id ?? resolveWordImg(w), w])); // fallback id = шлях до img

  // Сховати/скинути квіз
  const quizEl = document.getElementById('quiz');
  if (quizEl) { quizEl.style.display = 'none'; document.getElementById('quizRestart').style.display = 'none'; }

  // Розкладемо вагони
  wagonsLayer.innerHTML = "";
  const pfRect = playfield.getBoundingClientRect();
  const baseImg = "assets/img/placeholder.png";

  const slotW = parseFloat(getComputedStyle(playfield).getPropertyValue('--slotSize')) || 160;

  currentSet.forEach(word => {
    const el = document.createElement("div");
    el.className = "wagon";
    el.dataset.id = word.id ?? resolveWordImg(word);  // якщо нема id — унікальність по шляху
    const wordImg = resolveWordImg(word);
    el.innerHTML = `
      <div class="img-wrap">
        <img class="base" src="${baseImg}" alt="вагон">
        <img class="word-img" src="${wordImg}" alt="${word.text ?? ''}"
             onerror="this.onerror=null; this.src='assets/img/placeholder-word.png'">
      </div>
      <div class="label">${word.text ?? ""}</div>
    `;
    wagonsLayer.appendChild(el);

    const pad=10, ew=slotW, eh=slotW;
    const maxX = Math.max(pad, pfRect.width  - ew - pad);
    const maxY = Math.max(pad, pfRect.height - eh - pad);
    const x = rand(pad, maxX);
    const y = rand(pad, Math.max(pad, maxY - 120)); // трохи вище треку

    el.style.left = x + "px";
    el.style.top  = y + "px";

    makeDraggable(el);
  });

  onResizePlayfield(); // синхронізувати, якщо вікно вже ресайзилось
}

// ===== Перетягування =====
function makeDraggable(el){
  let pointerId=null, startX=0, startY=0, origX=0, origY=0;

  const onDown=(e)=>{
    if(el.classList.contains('fixed')) return;
    e.preventDefault();
    playSfx('pick'); // <<< SFX: взяли вагон
    pointerId = e.pointerId; el.setPointerCapture(pointerId);
    startX=e.clientX; startY=e.clientY;
    const r=el.getBoundingClientRect(), pf=playfield.getBoundingClientRect();
    origX=r.left-pf.left; origY=r.top-pf.top;
    el.classList.add('dragging'); el.style.zIndex='10';
  };

  const onMove=(e)=>{
    if(pointerId!==e.pointerId) return;
    e.preventDefault();
    let nx = origX + (e.clientX - startX);
    let ny = origY + (e.clientY - startY);

    const pfRect = playfield.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    nx = Math.max(0, Math.min(nx, pfRect.width  - w));
    ny = Math.max(0, Math.min(ny, pfRect.height - h));

    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';

    highlightNextSlot(el);
  };

  const onUp=(e)=>{
    if(pointerId!==e.pointerId) return;
    el.releasePointerCapture(pointerId); pointerId=null;
    el.classList.remove('dragging'); el.style.zIndex='';
    clearSlotHighlight(); trySnap(el);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

// ===== Підсвітка / магніт =====
function highlightNextSlot(el){
  clearSlotHighlight();
  const nextIndex = fixedCount; if(nextIndex>5) return;
  const slotRect = slotsEl.children[nextIndex].getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const center = { x:r.left+r.width/2, y:r.top+r.height/2 };
  const within =
    center.x >= (slotRect.left  - MAGNET_PAD) &&
    center.x <= (slotRect.right + MAGNET_PAD) &&
    center.y >= (slotRect.top   - MAGNET_PAD) &&
    center.y <= (slotRect.bottom+ MAGNET_PAD);
  if(within) slotsEl.children[nextIndex].classList.add('highlight');
}
function clearSlotHighlight(){ [...slotsEl.children].forEach(s=>s.classList.remove('highlight')); }

function trySnap(el){
  const nextIndex = fixedCount;
  if (nextIndex > 5 || el.classList.contains('fixed')) return;

  const slotNode = slotsEl.children[nextIndex];
  if (!slotNode) return;

  const slotRect = slotNode.getBoundingClientRect();
  const pfRect   = playfield.getBoundingClientRect();
  const r        = el.getBoundingClientRect();

  const center = { x:r.left+r.width/2, y:r.top+r.height/2 };
  const within =
    center.x >= (slotRect.left  - MAGNET_PAD) &&
    center.x <= (slotRect.right + MAGNET_PAD) &&
    center.y >= (slotRect.top   - MAGNET_PAD) &&
    center.y <= (slotRect.bottom+ MAGNET_PAD);
  if (!within) return;

  const targetX = slotRect.left - pfRect.left;
  const targetY = slotRect.top  - pfRect.top;

  const prevTransition = el.style.transition;
  el.style.transition = 'left .12s ease, top .12s ease';
  el.style.left = targetX + 'px';
  el.style.top  = targetY + 'px';

  const onDone = () => {
    el.style.transition = prevTransition || '';
    el.removeEventListener('transitionend', onDone);

    el.classList.add('fixed');
    el.dataset.slotIndex = String(nextIndex);
    el.style.pointerEvents = 'none';
    slotNode.classList.add('occupied'); // сховали пунктир під вагоном

    order.push(el.dataset.id);
    fixedCount++;

    clearSlotHighlight();
    if (navigator.vibrate) { try { navigator.vibrate(20); } catch(_) {} }

    playSfx('snap'); // <<< SFX: зʼєднали вагон

    if (fixedCount === 6) {
      document.getElementById('trainHint').textContent =
        'Готово! Починаємо запитання «хто перед/після».';
      if (typeof startQuiz === 'function') startQuiz(order);
    }
  };
  el.addEventListener('transitionend', onDone);
}

// ===== Ресайз =====
window.addEventListener('resize', onResizePlayfield);
window.addEventListener('orientationchange', onResizePlayfield);

function onResizePlayfield(){
  computeAndApplySlotSize();                // новий розмір
  const pfRect = playfield.getBoundingClientRect();

  document.querySelectorAll('.wagon.fixed').forEach(el=>{
    const idx = Number(el.dataset.slotIndex ?? -1);
    if(idx>=0 && slotsEl.children[idx]){
      const sRect = slotsEl.children[idx].getBoundingClientRect();
      el.style.left = (sRect.left - pfRect.left) + 'px';
      el.style.top  = (sRect.top  - pfRect.top ) + 'px';
    }
  });

  document.querySelectorAll('.wagon:not(.fixed)').forEach(el=> clampToPlayfield(el));
}

function computeAndApplySlotSize(){
  const wrap = slotsEl;
  if (!wrap) return;

  const COLS = 6, GAP = 12;
  const wrapRect = wrap.getBoundingClientRect();
  const available = Math.max(0, wrapRect.width - GAP * (COLS - 1));
  const preferred = Math.floor(available / COLS);

  const MIN_SIZE = 120, MAX_SIZE = 180;
  let size = Math.min(MAX_SIZE, preferred);
  if (preferred >= MIN_SIZE) size = Math.max(MIN_SIZE, size);

  playfield.style.setProperty('--slotSize', size + 'px');

  let scale = 0.68;
  if (size < 140) scale = 0.8;
  if (size < 115) scale = 0.9;
  if (size > 170) scale = 0.60;
  playfield.style.setProperty('--wordScale', String(scale));
}

function clampToPlayfield(el){
  const pfRect = playfield.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = parseFloat(el.style.left)||0;
  let y = parseFloat(el.style.top )||0;
  x = Math.max(0, Math.min(x, pfRect.width  - w));
  y = Math.max(0, Math.min(y, pfRect.height - h));
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}

// ===== КВІЗ =====
let quiz = { list: [], i: 0 };

function buildQuestions(orderIds){
  const qs = [];
  for (let idx = 0; idx < orderIds.length; idx++){
    const targetId = orderIds[idx];

    let type = "before";
    if (idx === 0) type = "after";
    else if (idx === orderIds.length - 1) type = "before";
    else type = Math.random() < 0.5 ? "before" : "after";

    const correctIndex = type === "before" ? idx - 1 : idx + 1;
    const correctId = orderIds[correctIndex];

    const others = orderIds.filter(id => id !== correctId && id !== targetId);
    const wrong3 = pickRandom(others, Math.min(3, others.length));
    const options = pickRandom([correctId, ...wrong3], Math.min(4, 1 + wrong3.length));

    qs.push({ type, targetId, correctId, options });
  }
  return qs;
}

function startQuiz(orderIds){
  quiz.list = buildQuestions(orderIds);
  quiz.i = 0;
  renderQuiz();
  document.getElementById('quiz').style.display = 'block';
}

function miniWagonHTML(word){
  const baseImg = "assets/img/placeholder.png";
  const src = resolveWordImg(word);
  const fallbackWord = "assets/img/placeholder-word.png";
  return `
    <div class="quiz-wagon">
      <img class="base" src="${baseImg}" alt="">
      <img class="word" src="${src}" alt="${word?.text ?? ''}"
           onerror="this.onerror=null; this.src='${fallbackWord}'">
    </div>
  `;
}

function renderQuiz(){
  const q = quiz.list[quiz.i];
  const total = quiz.list.length;

  document.getElementById('quizCounter').textContent = `Питання ${quiz.i+1}/${total}`;

  const target = idToWord.get(q.targetId);
  const who = q.type === "before" ? "Хто їде перед цим вагоном?" : "Хто їде після цього вагона?";
  document.getElementById('quizQuestion').textContent = who;

  document.getElementById('quizTarget').innerHTML = `
    <div class="quiz-opt" style="cursor:default;">
      ${miniWagonHTML(target)}
      <div class="t">${target?.text ?? ""}</div>
    </div>
  `;

  const box = document.getElementById('quizOptions');
  box.innerHTML = "";
  q.options.forEach(id=>{
    const w = idToWord.get(id);
    const opt = document.createElement('button');
    opt.className = 'quiz-opt';
    opt.innerHTML = `${miniWagonHTML(w)}<div class="t">${w?.text ?? ""}</div>`;
    opt.addEventListener('click', ()=>{
      if (id === q.correctId){
        playSfx('correct');             // <<< SFX: правильна відповідь
        opt.classList.add('correct');
        setTimeout(()=>{
          quiz.i++;
          if (quiz.i < quiz.list.length) renderQuiz();
          else finishQuiz();
        }, 400);
      } else {
        playSfx('wrong');               // <<< SFX: неправильна відповідь
        opt.classList.add('wrong');
        setTimeout(()=> opt.classList.remove('wrong'), 300);
      }
    });
    box.appendChild(opt);
  });
}

function finishQuiz(){
  document.getElementById('quizQuestion').textContent = "Чудово! Усі відповіді правильні 🎉";
  document.getElementById('quizOptions').innerHTML = "";
  document.getElementById('quizTarget').innerHTML = "";
  const btn = document.getElementById('quizRestart');
  btn.style.display = 'inline-block';
  btn.onclick = ()=> startQuiz(order);
}

// ===== Утиліти =====
function pickRandom(arr, n){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a.slice(0,n) }
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min }
