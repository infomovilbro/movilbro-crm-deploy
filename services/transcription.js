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
if (!assemblyAIKey) assemblyAIKey = '73009d6b21d6413cbf2637423fa10c8f';

async function transcribeAudio(audioBuffer, mimeType) {
  // Intentar OpenRouter Whisper si no hay AssemblyAI
  if (!assemblyAIKey) {
    var openRouterKey = process.env.OPENROUTER_API_KEY || '';
    if (openRouterKey) {
      try {
        var tmpPath = path.join(os.tmpdir(), 'wa_audio_' + Date.now() + '.ogg');
        fs.writeFileSync(tmpPath, audioBuffer);
        var FormData = require('form-data');
        var fd = new FormData();
        fd.append('model', 'openai/whisper-1');
        fd.append('file', fs.createReadStream(tmpPath), { filename: 'audio.ogg', contentType: mimeType || 'audio/ogg' });
        fd.append('language', 'es');
        var resp = await axios.post('https://openrouter.ai/api/v1/audio/transcriptions', fd, {
          headers: Object.assign({ 'Authorization': 'Bearer ' + openRouterKey }, fd.getHeaders()),
          timeout: 30000, maxContentLength: Infinity, maxBodyLength: Infinity
        });
        try { fs.unlinkSync(tmpPath); } catch(e) {}
        if (resp.data && resp.data.text) return { text: resp.data.text, rawText: resp.data.text };
        if (resp.data && typeof resp.data === 'string') return { text: resp.data, rawText: resp.data };
      } catch(e) { console.log('[Transcription] OpenRouter fallback error:', e.message); }
    }
    return { text: null, error: 'ASSEMBLYAI_API_KEY no configurada. Crea una cuenta gratis en assemblyai.com y añade la API key en Settings.' };
  }
  try {
    var tmpPath = path.join(os.tmpdir(), 'wa_audio_' + Date.now() + '.ogg');
    fs.writeFileSync(tmpPath, audioBuffer);

    // Subir audio usando buffer directamente (más fiable que stream)
    var audioData = fs.readFileSync(tmpPath);
    var uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', audioData, {
      headers: { 'Authorization': assemblyAIKey, 'Content-Type': 'application/octet-stream' },
      maxContentLength: Infinity, maxBodyLength: Infinity,
      timeout: 60000
    });
    var audioUrl = uploadRes.data.upload_url;
    if (!audioUrl) return { text: null, error: 'Error al subir audio (no upload_url)' };

    // Transcripción - solo lo esencial para ser más rápido y compatible
    var transcribeRes = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl,
      language_code: 'es',
      punctuate: true,
      format_text: true
    }, { headers: { 'Authorization': assemblyAIKey }, timeout: 30000 });
    var transcriptId = transcribeRes.data.id;

    // Esperar resultado
    var result = null;
    var fullData = null;
    for (var i = 0; i < 120; i++) {
      await new Promise(function(r) { setTimeout(r, 1000); });
      var pollRes = await axios.get('https://api.assemblyai.com/v2/transcript/' + transcriptId, {
        headers: { 'Authorization': assemblyAIKey }, timeout: 15000
      });
      if (pollRes.data.status === 'completed') {
        result = pollRes.data.text;
        fullData = pollRes.data;
        break;
      }
      if (pollRes.data.status === 'error') {
        try { fs.unlinkSync(tmpPath); } catch(e) {}
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
  var audioBuf = null;

  // 0. SpeechT5 local via Xenova (GRATIS, voz masculina, sin API key)
  if (voice === 'echo') {
    try {
      var { pipeline } = await import('@xenova/transformers');
      var synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', { quantized: true });
      var result = await synthesizer(text.substring(0, 200));
      if (result && result.audio) {
        var numS = result.audio.length;
        var sr = result.sampling_rate || 16000;
        var wav = Buffer.alloc(44 + numS * 2);
        wav.write('RIFF', 0); wav.writeUInt32LE(36 + numS * 2, 4); wav.write('WAVE', 8);
        wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
        wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
        wav.writeUInt32LE(numS * 2, 40);
        for (var wi = 0; wi < numS; wi++) {
          var samp = Math.max(-1, Math.min(1, result.audio[wi]));
          wav.writeInt16LE(Math.round(samp * 32767), 44 + wi * 2);
        }
        audioBuf = wav;
        console.log('[TTS] SpeechT5 (masculino) generado:', audioBuf.length, 'bytes');
      }
    } catch(e) { console.log('[TTS] SpeechT5 error:', e.message); }
  }

  // 1. AssemblyAI TTS (si hay key)
  if (!audioBuf && assemblyAIKey) {
    try {
      // Obtener voces disponibles primero
      var voicesResp = await axios.get('https://api.assemblyai.com/v2/text-to-speech/voices', {
        headers: { 'Authorization': assemblyAIKey }, timeout: 10000
      });
      var voices = voicesResp.data.voices || [];
      var voiceId = null;
      if (voice) {
        var found = voices.find(function(v) { return v.id === voice || v.name === voice; });
        if (found) voiceId = found.id;
      }
      if (!voiceId) {
        var esVoices = voices.filter(function(v) { return v.language && v.language.indexOf('es') >= 0; });
        if (voice === 'echo') {
          var maleVoice = esVoices.find(function(v) {
            var n = (v.name || '').toLowerCase();
            return n.indexOf('male') >= 0 || n.indexOf('hombre') >= 0 || n.indexOf('varon') >= 0 || n.indexOf('masculino') >= 0;
          });
          voiceId = maleVoice ? maleVoice.id : null;
        } else {
          voiceId = esVoices.length > 0 ? esVoices[0].id : (voices.length > 0 ? voices[0].id : null);
        }
      }
      if (voiceId) {
        var resp = await axios.post('https://api.assemblyai.com/v2/text-to-speech/' + voiceId, {
          text: text.substring(0, 1000)
        }, {
          headers: { 'Authorization': assemblyAIKey },
          responseType: 'arraybuffer',
          timeout: 30000
        });
        if (resp.data && resp.data.length > 100) {
          return { audio: Buffer.from(resp.data), format: 'mp3' };
        }
      }
    } catch(e) {
      console.log('[TTS] AssemblyAI falló:', e.message);
    }
  }

  // 2. OpenRouter TTS (si hay key, con voz masculina onyx para echo)
  var openRouterKey = process.env.OPENROUTER_API_KEY || '';
  if (!audioBuf && openRouterKey) {
    try {
      var resp = await axios.post('https://openrouter.ai/api/v1/audio/speech', {
        model: 'openai/tts-1',
        input: text.substring(0, 500),
        voice: voice === 'echo' ? 'onyx' : 'alloy',
        response_format: 'mp3'
      }, {
        headers: { 'Authorization': 'Bearer ' + openRouterKey },
        responseType: 'arraybuffer',
        timeout: 30000
      });
      if (resp.data && resp.data.length > 100) {
        console.log('[TTS] OpenRouter TTS (' + (voice === 'echo' ? 'onyx-masculino' : 'alloy-femenino') + ') generado:', resp.data.length, 'bytes');
        return { audio: Buffer.from(resp.data), format: 'mp3' };
      }
    } catch(e) {
      console.log('[TTS] OpenRouter TTS falló:', e.message);
    }
  }

  // Fallback: Google TTS (gratuito, sin API key, voz femenina - último recurso)
  try {
    var googleTts = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=' + encodeURIComponent(text.substring(0, 200));
    var gResp = await axios.get(googleTts, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (gResp.data && gResp.data.length > 1000) {
      console.log('[TTS] Google TTS generado:', gResp.data.length, 'bytes');
      return { audio: Buffer.from(gResp.data), format: 'mp3' };
    }
  } catch(e) {
    console.log('[TTS] Google TTS falló:', e.message);
  }

  return { audio: null, error: 'No hay servicio TTS disponible. Configura AssemblyAI o API key en Settings.' };
}

async function getVoices() {
  if (!assemblyAIKey) return [];
  try {
    var resp = await axios.get('https://api.assemblyai.com/v2/text-to-speech/voices', {
      headers: { 'Authorization': assemblyAIKey }, timeout: 10000
    });
    return resp.data.voices || [];
  } catch(e) {
    return [];
  }
}

module.exports = { transcribeAudio, textToSpeech, getVoices };
