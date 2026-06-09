const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

var assemblyAIKey = process.env.ASSEMBLYAI_API_KEY || '';
try {
  var db = require('../database');
  if (db) {
    try { assemblyAIKey = (db.db.prepare("SELECT value FROM settings WHERE key='assemblyai_api_key'").get() || {}).value || assemblyAIKey; } catch(e) {}
  }
} catch(e) {}

async function transcribeAudio(audioBuffer, mimeType) {
  if (!assemblyAIKey) return { text: null, error: 'ASSEMBLYAI_API_KEY no configurada. Crea una cuenta gratis en assemblyai.com y añade la API key en Settings.' };
  try {
    var tmpPath = path.join(os.tmpdir(), 'wa_audio_' + Date.now() + '.ogg');
    fs.writeFileSync(tmpPath, audioBuffer);

    var uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', fs.createReadStream(tmpPath), {
      headers: { 'Authorization': assemblyAIKey, 'Content-Type': 'application/octet-stream' },
      maxContentLength: Infinity, maxBodyLength: Infinity
    });
    var audioUrl = uploadRes.data.upload_url;
    if (!audioUrl) return { text: null, error: 'Error al subir audio a AssemblyAI' };

    var transcribeRes = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl, language_code: 'es'
    }, { headers: { 'Authorization': assemblyAIKey } });
    var transcriptId = transcribeRes.data.id;
    if (!transcriptId) return { text: null, error: 'Error al iniciar transcripción' };

    var result = null;
    for (var i = 0; i < 60; i++) {
      await new Promise(function(r) { setTimeout(r, 2000); });
      var pollRes = await axios.get('https://api.assemblyai.com/v2/transcript/' + transcriptId, {
        headers: { 'Authorization': assemblyAIKey }
      });
      if (pollRes.data.status === 'completed') {
        result = pollRes.data.text;
        break;
      }
      if (pollRes.data.status === 'error') {
        return { text: null, error: 'Error en transcripción: ' + (pollRes.data.error || 'desconocido') };
      }
    }
    try { fs.unlinkSync(tmpPath); } catch(e) {}
    if (result) return { text: result };
    return { text: null, error: 'Timeout esperando transcripción (2 min)' };
  } catch(e) {
    return { text: null, error: 'Error en AssemblyAI: ' + e.message };
  }
}

module.exports = { transcribeAudio };
