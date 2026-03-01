// --- Vocab from your image (Food & drink) ---
const vocab = [
  { fr: "Je mange", en: "I eat" },
  { fr: "Je bois", en: "I drink" },
  { fr: "du pain", en: "bread" },
  { fr: "du poulet", en: "chicken" },
  { fr: "du bœuf", en: "beef" },
  { fr: "du jambon", en: "ham" },
  { fr: "du yaourt", en: "yoghurt" },
  { fr: "du gâteau", en: "cake" },
  { fr: "du poisson", en: "fish" },
  { fr: "du riz", en: "rice" },
  { fr: "du fromage", en: "cheese" },
  { fr: "de l’eau", en: "water" },
  { fr: "de la viande", en: "meat" },
  { fr: "de la salade", en: "green salad" },
  { fr: "de la baguette", en: "French stick" },
  { fr: "de la pizza", en: "pizza" },
  { fr: "des saucisses", en: "sausages" },
  { fr: "des œufs", en: "eggs" },
  { fr: "des chips", en: "crisps" },
  { fr: "des légumes", en: "vegetables" },
  { fr: "des frites", en: "chips (fries)" },
  { fr: "des pâtes", en: "pasta" },
  { fr: "une glace", en: "ice cream" },
  { fr: "une crêpe", en: "pancake" },
];

const $ = (sel) => document.querySelector(sel);

const stateKey = "french_vocab_arcade_v1";
const defaultState = {
  mode: "flash",          // flash | mcq | type
  reverse: false,         // direction EN->FR if true
  speak: false,
  score: 0,
  streak: 0,
  // Per-card stats
  stats: Object.fromEntries(vocab.map(v => [v.fr, { correct: 0, wrong: 0 }]))
};

let S = loadState();
let current = null;
let revealed = false;

const modePill = $("#modePill");
const directionPill = $("#directionPill");
const questionEl = $("#question");
const hintEl = $("#hint");
const answerArea = $("#answerArea");
const feedbackEl = $("#feedback");
const scoreEl = $("#score");
const streakEl = $("#streak");

renderWordList();
syncUIFromState();

document.querySelectorAll("[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    S.mode = btn.dataset.mode;
    saveState();
    syncUIFromState();
    startRound();
  });
});

$("#reverse").addEventListener("change", (e) => {
  S.reverse = e.target.checked;
  saveState();
  syncUIFromState();
  startRound();
});

$("#speak").addEventListener("change", (e) => {
  S.speak = e.target.checked;
  saveState();
});

$("#next").addEventListener("click", startRound);

$("#reveal").addEventListener("click", () => {
  if (!current) return;
  revealed = true;
  showReveal();
});

$("#reset").addEventListener("click", () => {
  if (!confirm("Reset score + saved progress?")) return;
  localStorage.removeItem(stateKey);
  S = loadState(true);
  syncUIFromState();
  startRound();
});

function loadState(forceDefault = false){
  if (forceDefault) return structuredClone(defaultState);
  try{
    const raw = localStorage.getItem(stateKey);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    // Shallow migrations: ensure keys exist
    return {
      ...structuredClone(defaultState),
      ...parsed,
      stats: { ...structuredClone(defaultState.stats), ...(parsed.stats || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState(){
  localStorage.setItem(stateKey, JSON.stringify(S));
}

function syncUIFromState(){
  modePill.textContent = S.mode === "flash" ? "Flashcards" : (S.mode === "mcq" ? "Multiple choice" : "Type it");
  directionPill.textContent = S.reverse ? "EN → FR" : "FR → EN";
  $("#reverse").checked = S.reverse;
  $("#speak").checked = S.speak;
  scoreEl.textContent = String(S.score);
  streakEl.textContent = String(S.streak);
}

function startRound(){
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  revealed = false;

  current = pickCardWeighted();
  const q = S.reverse ? current.en : current.fr;
  questionEl.textContent = q;
  hintEl.textContent = " ";

  if (S.speak && !S.reverse) speakFrench(current.fr);

  if (S.mode === "flash") renderFlash();
  if (S.mode === "mcq") renderMCQ();
  if (S.mode === "type") renderType();
}

function renderFlash(){
  answerArea.innerHTML = "";
  const p = document.createElement("div");
  p.className = "small muted";
  p.textContent = "Try to say it out loud. Click Reveal to check.";
  answerArea.appendChild(p);
}

function renderMCQ(){
  answerArea.innerHTML = "";
  const correct = S.reverse ? current.fr : current.en;

  const distractors = shuffle(vocab
    .filter(v => (S.reverse ? v.fr : v.en) !== correct)
    .map(v => (S.reverse ? v.fr : v.en))
  ).slice(0, 3);

  const options = shuffle([correct, ...distractors]);

  const wrap = document.createElement("div");
  wrap.className = "choices";
  options.forEach(opt => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = opt;
    b.addEventListener("click", () => grade(opt, correct));
    wrap.appendChild(b);
  });
  answerArea.appendChild(wrap);
}

function renderType(){
  answerArea.innerHTML = "";

  const row = document.createElement("div");
  row.className = "input-row";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = S.reverse ? "Type the French…" : "Type the English…";
  input.autocomplete = "off";
  input.spellcheck = false;

  const submit = document.createElement("button");
  submit.className = "btn btn-primary";
  submit.textContent = "Check";

  const correct = S.reverse ? current.fr : current.en;

  const check = () => grade(input.value, correct);

  submit.addEventListener("click", check);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") check();
  });

  row.appendChild(input);
  row.appendChild(submit);

  const tip = document.createElement("div");
  tip.className = "small muted";
  tip.textContent = "Accents are forgiving (e.g., eau = eau, bœuf = boeuf is OK).";

  answerArea.appendChild(row);
  answerArea.appendChild(tip);

  input.focus();
}

function showReveal(){
  if (!current) return;
  const a = S.reverse ? current.fr : current.en;
  hintEl.textContent = `Answer: ${a}`;
}

function grade(givenRaw, correctRaw){
  if (!current) return;

  // flash mode: accept "reveal" as checking step; score only if user used mcq/type
  const given = normalize(givenRaw);
  const correct = normalize(correctRaw);

  const isCorrect = given === correct;

  if (S.mode === "flash"){
    // In flashcards we don't score clicks; reveal just shows answer.
    showReveal();
    return;
  }

  if (isCorrect){
    S.score += 10;
    S.streak += 1;
    S.stats[current.fr].correct += 1;
    feedbackEl.textContent = "Correct ✅";
    feedbackEl.className = "feedback good";
  } else {
    S.score = Math.max(0, S.score - 5);
    S.streak = 0;
    S.stats[current.fr].wrong += 1;
    feedbackEl.textContent = `Not quite. Correct: ${correctRaw}`;
    feedbackEl.className = "feedback bad";
  }

  saveState();
  syncUIFromState();
}

function pickCardWeighted(){
  // Simple weighting: prioritize items with more wrong answers,
  // and items not yet answered correctly.
  const weighted = vocab.map(v => {
    const st = S.stats[v.fr] || { correct: 0, wrong: 0 };
    const base = 1;
    const wrongBoost = st.wrong * 2;
    const newBoost = st.correct === 0 ? 2 : 0;
    const weight = base + wrongBoost + newBoost;
    return { v, weight };
  });

  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let r = Math.random() * total;
  for (const item of weighted){
    r -= item.weight;
    if (r <= 0) return item.v;
  }
  return weighted[weighted.length - 1].v;
}

function normalize(s){
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")                 // split accents
    .replace(/[\u0300-\u036f]/g, "")  // remove accents
    .replace(/[’']/g, "'")
    .replace(/œ/g, "oe")
    .replace(/\s+/g, " ");
}

function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function speakFrench(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function renderWordList(){
  const list = $("#list");
  list.innerHTML = "";
  vocab.forEach(v => {
    const row = document.createElement("div");
    row.className = "row";
    const fr = document.createElement("div");
    fr.className = "fr";
    fr.textContent = v.fr;

    const en = document.createElement("div");
    en.className = "en";
    en.textContent = v.en;

    row.appendChild(fr);
    row.appendChild(en);
    list.appendChild(row);
  });
}
