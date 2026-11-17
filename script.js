/* Lógica da Votação CIPA 2026/2027 — Policlínica de Sobral */

// =========================================================================
// 1. COLE AQUI A URL DO SEU GOOGLE APPS SCRIPT (deixe '' para teste local)
// =========================================================================
const APPS_SCRIPT_URL = '';

// Dados das 5 chapas conforme arte oficial
const CHAPAS = [
  { id: 1, codigo: 'Chapa 01', candidato: 'Victor Emanuel', foto: 'assets/chapa1_victor.jpg' },
  { id: 2, codigo: 'Chapa 02', candidato: 'Talisson Albuquerque', foto: 'assets/chapa2_talisson.jpg' },
  { id: 3, codigo: 'Chapa 03', candidato: 'Rosemary Mouta', foto: 'assets/chapa3_rosemary.jpg' },
  { id: 4, codigo: 'Chapa 04', candidato: 'Clarice Lira', foto: 'assets/chapa4_clarice.jpg' },
  { id: 5, codigo: 'Chapa 05', candidato: 'Érica Ponte', foto: 'assets/chapa5_erica.jpg' }
];

const STORAGE_KEY = 'cipa_2027_policlinica_sobral_votos';
let votes = [];
let selectedChapaId = null;
let pendingVote = null;
let isSubmitting = false;
let soundEnabled = true;
let audioCtx = null;

// Normaliza nome para impedir voto duplicado (ignora maiúsculas, acentos e espaços extras)
function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Síntese de áudio (Web Audio API) — Som de bipe estilo urna eletrônica
function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq, startOffset, duration, volume = 0.16, type = 'sine') {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.02);
}

// Bipe curto ao selecionar uma chapa
function playSelectBeep() {
  playTone(880, 0, 0.08, 0.1, 'sine');
}

// Bipe clássico de confirmação ("pilili" da urna)
function playConfirmBeep() {
  playTone(1046.5, 0, 0.11, 0.18, 'triangle');
  playTone(1318.5, 0.12, 0.11, 0.18, 'triangle');
  playTone(1567.98, 0.24, 0.28, 0.2, 'triangle');
}

// Bipe grave de erro / voto duplicado
function playErrorBeep() {
  playTone(260, 0, 0.18, 0.15, 'sawtooth');
  playTone(200, 0.19, 0.22, 0.15, 'sawtooth');
}

function isRemoteEnabled() {
  return Boolean(APPS_SCRIPT_URL && APPS_SCRIPT_URL.trim().startsWith('https://'));
}

function loadLocalVotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) votes = parsed;
    }
  } catch (e) {
    votes = [];
  }
}

function saveLocalVotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
  } catch (e) {
    // Fallback em memória
  }
}

async function fetchRemoteVotes() {
  if (!isRemoteEnabled()) {
    loadLocalVotes();
    updateSyncStatus();
    updateHeaderCount();
    renderResultados();
    return;
  }

  const statusEl = document.getElementById('syncStatusText');
  if (statusEl) statusEl.textContent = 'Sincronizando votos com a Planilha Google...';

  try {
    const resp = await fetch(APPS_SCRIPT_URL.trim(), { method: 'GET' });
    const data = await resp.json();
    if (data && data.ok && Array.isArray(data.votes)) {
      votes = data.votes;
      updateHeaderCount();
      renderResultados();
      if (statusEl) statusEl.textContent = 'Conectado à Planilha Google • Apuração em tempo real.';
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Não foi possível atualizar agora. Tente clicar em Atualizar.';
  }
}

function updateSyncStatus() {
  const statusEl = document.getElementById('syncStatusText');
  const btnLimpar = document.getElementById('btnLimparVotos');
  if (!statusEl) return;

  if (isRemoteEnabled()) {
    statusEl.textContent = 'Conectado à Planilha Google • Apuração em tempo real.';
    if (btnLimpar) btnLimpar.classList.add('hidden');
  } else {
    statusEl.textContent = 'Modo local de teste. Cole a URL do Google Apps Script em script.js para apuração centralizada.';
    if (btnLimpar) btnLimpar.classList.remove('hidden');
  }
}

function renderChapas() {
  const container = document.getElementById('chapasContainer');
  container.innerHTML = '';

  CHAPAS.forEach((chapa) => {
    const isSelected = selectedChapaId === chapa.id;
    const card = document.createElement('label');
    card.className = `chapa-card cursor-pointer rounded-2xl border-2 overflow-hidden flex flex-col bg-white ${
      isSelected ? 'selected border-emerald-700' : 'border-emerald-200 hover:border-emerald-500'
    }`;

    card.innerHTML = `
      <div class="relative bg-slate-100 aspect-[3/4] w-full overflow-hidden">
        <img src="${chapa.foto}" alt="${chapa.candidato} — ${chapa.codigo}" class="w-full h-full object-cover object-top" />
        <div class="absolute top-2.5 right-2.5 bg-white/90 rounded-full p-1 shadow-xs flex items-center justify-center">
          <input
            type="radio"
            name="chapa"
            value="${chapa.id}"
            ${isSelected ? 'checked' : ''}
            class="h-4 w-4 accent-emerald-700 cursor-pointer"
          />
        </div>
      </div>
      <div class="bg-emerald-800 text-white px-3 py-2.5 text-center flex-1 flex flex-col justify-between gap-2">
        <div class="font-bold text-sm leading-snug">${chapa.candidato}</div>
        <span class="chapa-badge inline-block mx-auto px-3 py-0.5 rounded-full text-xs font-extrabold tracking-wide shadow-xs">
          ${chapa.codigo}
        </span>
      </div>
    `;

    card.addEventListener('click', () => {
      selectedChapaId = chapa.id;
      playSelectBeep();
      hideError();
      renderChapas();
    });

    container.appendChild(card);
  });
}

function showError(msg) {
  const box = document.getElementById('formError');
  document.getElementById('formErrorText').textContent = msg;
  box.classList.remove('hidden');
  playErrorBeep();
}

function hideError() {
  document.getElementById('formError').classList.add('hidden');
}

function showModalError(msg) {
  const el = document.getElementById('modalError');
  el.textContent = msg;
  el.classList.remove('hidden');
  playErrorBeep();
}

function hideModalError() {
  const el = document.getElementById('modalError');
  el.classList.add('hidden');
  el.textContent = '';
}

function switchTab(tab) {
  const viewVotacao = document.getElementById('viewVotacao');
  const viewComprovante = document.getElementById('viewComprovante');
  const viewResultados = document.getElementById('viewResultados');
  const btnVotacao = document.getElementById('tabBtnVotacao');
  const btnResultados = document.getElementById('tabBtnResultados');

  if (tab === 'votacao') {
    viewVotacao.classList.remove('hidden');
    viewComprovante.classList.add('hidden');
    viewResultados.classList.add('hidden');
    btnVotacao.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-emerald-700 text-white shadow-sm transition';
    btnResultados.className = 'px-4 py-2 rounded-lg text-sm font-semibold text-emerald-800 hover:bg-emerald-100 transition';
  } else if (tab === 'comprovante') {
    viewVotacao.classList.add('hidden');
    viewComprovante.classList.remove('hidden');
    viewResultados.classList.add('hidden');
  } else if (tab === 'resultados') {
    viewVotacao.classList.add('hidden');
    viewComprovante.classList.add('hidden');
    viewResultados.classList.remove('hidden');
    btnResultados.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-emerald-700 text-white shadow-sm transition';
    btnVotacao.className = 'px-4 py-2 rounded-lg text-sm font-semibold text-emerald-800 hover:bg-emerald-100 transition';
    fetchRemoteVotes();
  }
}

function updateHeaderCount() {
  document.getElementById('headerVoteCount').textContent = votes.length;
}

function renderResultados() {
  const total = votes.length;
  document.getElementById('statTotalVotos').textContent = total;

  const counts = {};
  CHAPAS.forEach((c) => { counts[c.id] = 0; });
  votes.forEach((v) => {
    const cid = Number(v.chapaId);
    if (counts[cid] !== undefined) counts[cid]++;
  });

  let leaderText = '—';
  if (total > 0) {
    let maxVotes = -1;
    let leaders = [];
    CHAPAS.forEach((c) => {
      if (counts[c.id] > maxVotes) {
        maxVotes = counts[c.id];
        leaders = [`${c.codigo} (${c.candidato})`];
      } else if (counts[c.id] === maxVotes) {
        leaders.push(`${c.codigo} (${c.candidato})`);
      }
    });
    leaderText = leaders.length > 1 ? 'Empate' : `${leaders[0]} — ${maxVotes}`;
  }
  document.getElementById('statLider').textContent = leaderText;

  const barsContainer = document.getElementById('resultsBars');
  barsContainer.innerHTML = '';
  CHAPAS.forEach((c) => {
    const count = counts[c.id];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'space-y-1.5';
    row.innerHTML = `
      <div class="flex items-center justify-between text-xs sm:text-sm">
        <span class="font-bold text-slate-800">${c.codigo} — ${c.candidato}</span>
        <span class="font-semibold text-emerald-800">${count} voto(s) • ${pct}%</span>
      </div>
      <div class="w-full h-3 bg-emerald-100 rounded-full overflow-hidden">
        <div class="h-full bg-emerald-600 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
      </div>
    `;
    barsContainer.appendChild(row);
  });

  const tbody = document.getElementById('votersTableBody');
  tbody.innerHTML = '';
  if (votes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-4 py-6 text-center text-slate-400">
          Nenhum voto registrado ainda.
        </td>
      </tr>
    `;
    return;
  }

  votes.slice().reverse().forEach((v) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-emerald-50/40';
    tr.innerHTML = `
      <td class="px-4 py-2.5 font-medium text-slate-900">${escapeHtml(v.nome)}</td>
      <td class="px-4 py-2.5 text-slate-600">${escapeHtml(v.setor)}</td>
      <td class="px-4 py-2.5 text-slate-600">${escapeHtml(v.funcao)}</td>
      <td class="px-4 py-2.5 font-bold text-emerald-700">${escapeHtml(v.chapaNome)}</td>
      <td class="px-4 py-2.5 text-slate-500 font-mono text-xs">${escapeHtml(v.horario)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Botão de ligar/desligar som
document.getElementById('btnToggleSound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  const label = document.getElementById('soundLabel');
  label.textContent = soundEnabled ? 'Som: ON' : 'Som: OFF';
  if (soundEnabled) playSelectBeep();
});

// Eventos do formulário
document.getElementById('votingForm').addEventListener('submit', (e) => {
  e.preventDefault();
  hideError();
  hideModalError();

  const nome = document.getElementById('nomeCompleto').value.trim();
  const setor = document.getElementById('setor').value.trim();
  const funcao = document.getElementById('funcao').value.trim();

  if (!nome || !setor || !funcao) {
    showError('Por favor, preencha seu nome completo, setor e função.');
    return;
  }

  if (!selectedChapaId) {
    showError('Selecione um candidato (Chapa 01 a Chapa 05) para votar.');
    return;
  }

  // Limitador de voto por funcionário (ignora acentos, maiúsculas e espaços extras)
  const nomeNorm = normalizeName(nome);
  const jaVotou = votes.some((v) => normalizeName(v.nome) === nomeNorm);
  if (jaVotou) {
    showError('Voto bloqueado: já existe um voto registrado para este(a) funcionário(a).');
    return;
  }

  const chapa = CHAPAS.find((c) => c.id === selectedChapaId);
  pendingVote = {
    nome,
    setor,
    funcao,
    chapaId: chapa.id,
    chapaNome: `${chapa.codigo} — ${chapa.candidato}`,
    foto: chapa.foto
  };

  document.getElementById('modNome').textContent = nome;
  document.getElementById('modSetor').textContent = setor;
  document.getElementById('modFuncao').textContent = funcao;
  document.getElementById('modChapa').textContent = pendingVote.chapaNome;
  document.getElementById('modFoto').src = chapa.foto;
  document.getElementById('confirmModal').classList.remove('hidden');
});

document.getElementById('btnCancelModal').addEventListener('click', () => {
  if (isSubmitting) return;
  document.getElementById('confirmModal').classList.add('hidden');
  pendingVote = null;
});

document.getElementById('btnConfirmModal').addEventListener('click', async () => {
  if (!pendingVote || isSubmitting) return;
  hideModalError();

  const confirmBtn = document.getElementById('btnConfirmModal');
  isSubmitting = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Registrando...';

  const now = new Date();
  const protocolo = 'CIPA27-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const horario = now.toLocaleString('pt-BR');

  const record = {
    nome: pendingVote.nome,
    setor: pendingVote.setor,
    funcao: pendingVote.funcao,
    chapaId: pendingVote.chapaId,
    chapaNome: pendingVote.chapaNome,
    protocolo,
    horario
  };

  if (isRemoteEnabled()) {
    try {
      const resp = await fetch(APPS_SCRIPT_URL.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(record)
      });
      const result = await resp.json();
      if (!result || !result.ok) {
        showModalError((result && result.error) || 'Não foi possível registrar o voto na planilha.');
        isSubmitting = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmar Voto';
        return;
      }
      votes.push(record);
    } catch (err) {
      showModalError('Erro de conexão com a planilha. Verifique a URL do Apps Script.');
      isSubmitting = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirmar Voto';
      return;
    }
  } else {
    votes.push(record);
    saveLocalVotes();
  }

  isSubmitting = false;
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Confirmar Voto';

  updateHeaderCount();
  document.getElementById('confirmModal').classList.add('hidden');
  document.getElementById('recNome').textContent = record.nome;
  document.getElementById('recSetor').textContent = record.setor;
  document.getElementById('recFuncao').textContent = record.funcao;
  document.getElementById('recChapa').textContent = record.chapaNome;
  document.getElementById('recProtocolo').textContent = `${record.protocolo} • ${record.horario}`;

  document.getElementById('votingForm').reset();
  selectedChapaId = null;
  pendingVote = null;
  renderChapas();

  // Toca o bipe de confirmação e exibe o pop-up de voto computado
  playConfirmBeep();
  document.getElementById('successModalText').textContent = `${record.nome}, seu voto para ${record.chapaNome} foi registrado (Protocolo ${record.protocolo}).`;
  document.getElementById('successModal').classList.remove('hidden');
});

document.getElementById('btnCloseSuccessModal').addEventListener('click', () => {
  document.getElementById('successModal').classList.add('hidden');
  switchTab('comprovante');
});

document.getElementById('btnNovoVoto').addEventListener('click', () => switchTab('votacao'));
document.getElementById('btnVerApuracao').addEventListener('click', () => switchTab('resultados'));
document.getElementById('tabBtnVotacao').addEventListener('click', () => switchTab('votacao'));
document.getElementById('tabBtnResultados').addEventListener('click', () => switchTab('resultados'));
document.getElementById('btnAtualizarApuracao').addEventListener('click', () => fetchRemoteVotes());

document.getElementById('btnExportCsv').addEventListener('click', () => {
  if (votes.length === 0) return;
  const header = 'Protocolo,Nome Completo,Setor,Funcao,Chapa,Horario\n';
  const rows = votes.map((v) =>
    [v.protocolo, v.nome, v.setor, v.funcao, v.chapaNome, v.horario]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'votacao_cipa_2027_sobral.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('btnLimparVotos').addEventListener('click', () => {
  if (isRemoteEnabled()) return;
  votes = [];
  saveLocalVotes();
  updateHeaderCount();
  renderResultados();
});

// Inicialização
updateSyncStatus();
fetchRemoteVotes();
renderChapas();
