// ====== CONFIGURAÇÃO ======
const KEY      = "46ddecd2597afed887b0b010971d97d6";
const TOKEN    = "ATTAd41d38f5aee213a4f12e03993f8e74bb4b1a08545416ab640edd9b3aecaf53dbCAFC0952";
const BOARD_ID = "NoURu3ls";
const REFRESH_MS = 30_000; // 30s
// ==========================

const $ = s => document.querySelector(s);
const boardEl = $("#board");

let audioCtx = null;
let soundEnabled = false;
let masterGain = null;          // para controlar volume
let prevAllCards = null;        // Set com TODOS os cartões vistos (primeira rodada = null)

function enableSound(){
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = getVolumeGain();  // volume inicial
    masterGain.connect(audioCtx.destination);
  }
  soundEnabled = true;
}
function getVolumeGain(){
  const pct = parseInt(localStorage.getItem("panel_volume") ?? "100", 10); // padrão 70%
  // converte 0..100 para ganho (curva suave)
  return Math.max(0, Math.min(1, Math.pow(pct/100, 1.6)));
}
function setVolumeFromSlider(v){
  localStorage.setItem("panel_volume", String(v));
  if (masterGain) masterGain.gain.value = getVolumeGain();
}
function initVolumeUI(){
  const slider = $("#volume");
  const saved = parseInt(localStorage.getItem("panel_volume") ?? "70", 10);
  slider.value = saved;
  slider.addEventListener("input", e => setVolumeFromSlider(e.target.value));
}

function beep(){
  if (!soundEnabled) return;
  if (!audioCtx) enableSound();

  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);

  // envelope
  env.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.6, audioCtx.currentTime + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 20.0); // O som vai durar 5s

  osc.connect(env);
  env.connect(masterGain ?? audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 5.01); // O oscilador para após 5s
}

function safeHtml(s){
  return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
}

async function api(path){
  const url = `https://api.trello.com/1/${path}${path.includes('?')?'&':'?'}key=${encodeURIComponent(KEY)}&token=${encodeURIComponent(TOKEN)}`;
  const r = await fetch(url);
  if(!r.ok){
    const txt = await r.text();
    throw new Error(`HTTP ${r.status}: ${txt}`);
  }
  return r.json();
}

async function render(){
  boardEl.innerHTML = "";

  // pega listas
  const listas = await api(`boards/${BOARD_ID}/lists?fields=name`);

  // set atual com todos os cartões
  const currAllCards = new Set();

  // renderiza cada lista
  for (const lista of listas){
    const wrap = document.createElement("section");
    wrap.className = "list";
    wrap.innerHTML = `<div class="list__header">${lista.name}</div>
                      <div class="cards" id="cards-${lista.id}"><div class="empty">Carregando…</div></div>`;
    boardEl.appendChild(wrap);

    const cardsEl = $("#cards-"+lista.id);
    try{
      const cards = await api(`lists/${lista.id}/cards?fields=name,desc,dateLastActivity,shortUrl&limit=1000`);
      if (!cards.length){
        cardsEl.innerHTML = `<div class="empty">Sem cartões</div>`;
      }else{
        // ordena: mais recentes primeiro
        cards.sort((a,b)=> new Date(b.dateLastActivity) - new Date(a.dateLastActivity));
        // coleta IDs no conjunto global
        cards.forEach(c => currAllCards.add(c.id));
        // desenha
        cardsEl.innerHTML = cards.map(c=>`
          <article class="card">
            <h3 class="card__title">
              <a href="${c.shortUrl}" target="_blank" rel="noopener">${safeHtml(c.name)}</a>
            </h3>
            <div class="meta">${new Date(c.dateLastActivity).toLocaleString('pt-BR',{hour12:false})}</div>
            ${c.desc ? `<div class="card__desc">${safeHtml(c.desc)}</div>` : ``}
          </article>
        `).join("");
      }
    }catch(e){
      cardsEl.innerHTML = `<div class="empty">Erro ao carregar cartões</div>`;
      console.error(e);
    }
  }

  // detecção de novos cartões (sem referência a lista)
  if (prevAllCards !== null) { // ignora primeira rodada
    let newOnes = 0;
    currAllCards.forEach(id => { if (!prevAllCards.has(id)) newOnes++; });
    if (newOnes > 0) beep(); // um beep por rodada com novos
  }
  prevAllCards = currAllCards;
}

function start(){
  initVolumeUI();
  $("#btnEnableSound").addEventListener("click", ()=>{ enableSound(); beep(); });
  render().catch(console.error);
  setInterval(()=>render().catch(console.error), REFRESH_MS);
}

start();
