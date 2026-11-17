// Código para colar em: Extensões > Apps Script na sua Planilha Google

const SHEET_NAME = 'Votos_CIPA_2027';

function normalizeName_(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Protocolo',
      'Nome Completo',
      'Setor',
      'Funcao',
      'Chapa ID',
      'Chapa',
      'Horario'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = JSON.parse(e.postData.contents);
    const nome = String(data.nome || '').trim();
    const setor = String(data.setor || '').trim();
    const funcao = String(data.funcao || '').trim();
    const chapaId = Number(data.chapaId);
    const chapaNome = String(data.chapaNome || '').trim();
    const protocolo = String(data.protocolo || '').trim();
    const horario = String(data.horario || new Date().toLocaleString('pt-BR')).trim();

    if (!nome || !setor || !funcao || !chapaId) {
      return jsonResponse({ ok: false, error: 'Dados incompletos.' });
    }

    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();

    // Limitador de voto por funcionário (ignora acentos, maiúsculas e espaços extras)
    const nomeNorm = normalizeName_(nome);
    for (let i = 1; i < rows.length; i++) {
      if (normalizeName_(rows[i][1]) === nomeNorm) {
        return jsonResponse({ ok: false, error: 'Voto bloqueado: este(a) funcionário(a) já votou.' });
      }
    }

    sheet.appendRow([protocolo, nome, setor, funcao, chapaId, chapaNome, horario]);
    return jsonResponse({ ok: true, protocolo: protocolo });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  try {
    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    const votes = [];

    for (let i = 1; i < rows.length; i++) {
      votes.push({
        protocolo: rows[i][0],
        nome: rows[i][1],
        setor: rows[i][2],
        funcao: rows[i][3],
        chapaId: rows[i][4],
        chapaNome: rows[i][5],
        horario: String(rows[i][6])
      });
    }

    return jsonResponse({ ok: true, votes: votes });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
