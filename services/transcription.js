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

    // Subir audio
    var uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', fs.createReadStream(tmpPath), {
      headers: { 'Authorization': assemblyAIKey, 'Content-Type': 'application/octet-stream' },
      maxContentLength: Infinity, maxBodyLength: Infinity
    });
    var audioUrl = uploadRes.data.upload_url;
    if (!audioUrl) return { text: null, error: 'Error al subir audio' };

    // Transcripción con análisis completo: sentimiento, entidades, temas
    var transcribeRes = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl,
      language_code: 'es',
      sentiment_analysis: true,
      entity_detection: true,
      iab_categories: true,
      auto_chapters: true,
      summarization: true,
      summary_type: 'paragraph'
    }, { headers: { 'Authorization': assemblyAIKey } });
    var transcriptId = transcribeRes.data.id;

    // Esperar resultado
    var result = null;
    var fullData = null;
    for (var i = 0; i < 60; i++) {
      await new Promise(function(r) { setTimeout(r, 2000); });
      var pollRes = await axios.get('https://api.assemblyai.com/v2/transcript/' + transcriptId, {
        headers: { 'Authorization': assemblyAIKey }
      });
      if (pollRes.data.status === 'completed') {
        result = pollRes.data.text;
        fullData = pollRes.data;
        break;
      }
      if (pollRes.data.status === 'error') {
        return { text: null, error: 'Error transcripción: ' + (pollRes.data.error || '') };
      }
    }
    try { fs.unlinkSync(tmpPath); } catch(e) {}

    if (!result) return { text: null, error: 'Timeout (2 min)' };

    // Construir análisis enriquecido
    var analysis = [];
    // Sentimiento general
    if (fullData.sentiment_analysis_results && fullData.sentiment_analysis_results.length > 0) {
      var sentiments = {};
      fullData.sentiment_analysis_results.forEach(function(s) {
        sentiments[s.sentiment] = (sentiments[s.sentiment] || 0) + 1;
      });
      var total = Object.values(sentiments).reduce(function(a, b) { return a + b; }, 0);
      var dominant = Object.keys(sentiments).reduce(function(a, b) { return sentiments[a] > sentiments[b] ? a : b; });
      var sentimentEmoji = dominant === 'POSITIVE' ? '😊' : dominant === 'NEGATIVE' ? '😠' : '😐';
      analysis.push(sentimentEmoji + ' Sentimiento: ' + dominant + ' (' + Math.round(sentiments[dominant] / total * 100) + '%)');
    }
    // Entidades
    if (fullData.entities && fullData.entities.length > 0) {
      var entities = fullData.entities.map(function(e) { return e.entity_type + ': ' + e.text; }).slice(0, 5);
      analysis.push('📌 Entidades: ' + entities.join(' | '));
    }
    // Categorías/temas
    if (fullData.iab_categories_result && fullData.iab_categories_result.categories) {
      var cats = fullData.iab_categories_result.categories.filter(function(c) { return c.relevance > 0.5; }).slice(0, 3);
      if (cats.length > 0) analysis.push('🏷️ Temas: ' + cats.map(function(c) { return c.label; }).join(', '));
    }
    // Resumen
    if (fullData.summary) analysis.push('📝 Resumen: ' + fullData.summary.substring(0, 300));
    // Capítulos
    if (fullData.chapters && fullData.chapters.length > 1) {
      var chaps = fullData.chapters.map(function(c) { return c.gist || c.headline; }).filter(Boolean).slice(0, 3);
      if (chaps.length > 0) analysis.push('📑 Capítulos: ' + chaps.join(' → '));
    }
    // Duración
    var duration = fullData.audio_duration ? Math.round(fullData.audio_duration) : 0;
    if (duration > 0) analysis.unshift('⏱️ ' + duration + 's');

    var enrichedText = result;
    if (analysis.length > 0) {
      enrichedText = result + '\n\n━━━━━━━━━━━━━━━\n' + analysis.join('\n');
    }

    return { text: enrichedText, rawText: result, analysis: analysis, data: fullData };
  } catch(e) {
    return { text: null, error: 'Error AssemblyAI: ' + e.message };
  }
}

async function textToSpeech(text, voice) {
  if (!assemblyAIKey) return { audio: null, error: 'ASSEMBLYAI_API_KEY no configurada' };
  try {
    var voiceId = voice || 'f199a85a-472e-4f72-857f-064e85467d14'; // AssemblyAI femenina español
    var resp = await axios.post('https://api.assemblyai.com/v2/text-to-speech/' + voiceId, {
      text: text.substring(0, 1000)
    }, {
      headers: { 'Authorization': assemblyAIKey },
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return { audio: Buffer.from(resp.data), format: 'mp3' };
  } catch(e) {
    return { audio: null, error: 'Error TTS: ' + e.message };
  }
}

async function getVoices() {
  if (!assemblyAIKey) return [];
  try {
    var resp = await axios.get('https://api.assemblyai.com/v2/text-to-speech/voices', {
      headers: { 'Authorization': assemblyAIKey }
    });
    return resp.data.voices || [];
  } catch(e) {
    return [];
  }
}

module.exports = { transcribeAudio, textToSpeech, getVoices };
