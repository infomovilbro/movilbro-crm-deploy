const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

var assemblyAIKey = '';
var openRouterKey = '';

function getKeyFromSettings(keyName) {
  try {
    var db = require('../database');
    if (db) {
      var row = db.db.prepare("SELECT value FROM settings WHERE key=?").get(keyName);
      if (row && row.value) return row.value;
    }
  } catch(e) {}
  return process.env[keyName.toUpperCase()] || '';
}

assemblyAIKey = getKeyFromSettings('assemblyai_api_key');
openRouterKey = getKeyFromSettings('openrouter_api_key');

async function transcribeAudio(audioBuffer, mimeType) {
  // 1. OpenRouter Whisper (necesita OPENROUTER_API_KEY en Settings)
  var openRouterKey = getKeyFromSettings('openrouter_api_key');
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
      if (resp.data && resp.data.text) return { text: resp.data.text, rawText: resp.data.text, source: 'openrouter' };
    } catch(e) { console.log('[Transcription] OpenRouter error:', e.message); }
  }

  // 2. HuggingFace Whisper gratis (sin API key, limitado)
  try {
    var tmpPath = path.join(os.tmpdir(), 'wa_audio_' + Date.now() + '.ogg');
    fs.writeFileSync(tmpPath, audioBuffer);
    var audioData = fs.readFileSync(tmpPath);
    var resp = await axios.post('https://api-inference.huggingface.co/models/openai/whisper-tiny', audioData, {
      headers: { 'Content-Type': 'audio/ogg' },
      timeout: 30000, responseType: 'json'
    });
    try { fs.unlinkSync(tmpPath); } catch(e) {}
    if (resp.data && resp.data.text) return { text: resp.data.text, rawText: resp.data.text, source: 'huggingface' };
  } catch(e) { console.log('[Transcription] HuggingFace error:', e.message); }

  // 3. AssemblyAI
  if (assemblyAIKey) {
    try {
      var tmpPath = path.join(os.tmpdir(), 'wa_audio_' + Date.now() + '.ogg');
      fs.writeFileSync(tmpPath, audioBuffer);
      var audioData = fs.readFileSync(tmpPath);
      var uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', audioData, {
        headers: { 'Authorization': assemblyAIKey, 'Content-Type': 'application/octet-stream' },
        maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 60000
      });
      var audioUrl = uploadRes.data.upload_url;
      if (!audioUrl) return { text: null, error: 'Error al subir audio (no upload_url)' };
      var transcribeRes = await axios.post('https://api.assemblyai.com/v2/transcript', {
        audio_url: audioUrl, language_code: 'es', punctuate: true, format_text: true
      }, { headers: { 'Authorization': assemblyAIKey }, timeout: 30000 });
      var transcriptId = transcribeRes.data.id;
      for (var i = 0; i < 120; i++) {
        await new Promise(function(r) { setTimeout(r, 1000); });
        var pollRes = await axios.get('https://api.assemblyai.com/v2/transcript/' + transcriptId, {
          headers: { 'Authorization': assemblyAIKey }, timeout: 15000
        });
        if (pollRes.data.status === 'completed') {
          try { fs.unlinkSync(tmpPath); } catch(e) {}
          return { text: pollRes.data.text, rawText: pollRes.data.text, source: 'assemblyai' };
        }
        if (pollRes.data.status === 'error') {
          try { fs.unlinkSync(tmpPath); } catch(e) {}
          return { text: null, error: 'Error transcripción: ' + (pollRes.data.error || '') };
        }
      }
      try { fs.unlinkSync(tmpPath); } catch(e) {}
      return { text: null, error: 'Timeout (2 min)' };
    } catch(e) { return { text: null, error: 'Error AssemblyAI: ' + e.message }; }
  }
  return { text: null, error: 'No hay API de transcripción configurada.' };
}

async function textToSpeech(text, voice) {
  var audioBuf = null;

  // 1. Google TTS (gratis, voz femenina por defecto - para voz masculina usar OpenRouter)
  try {
    var chunks = [];
    for (var i = 0; i < text.length; i += 180) {
      var part = text.substring(i, i + 180);
      var url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=' + encodeURIComponent(part);
      var resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (resp.data && resp.data.length > 100) chunks.push(Buffer.from(resp.data));
    }
    if (chunks.length > 0) {
      audioBuf = Buffer.concat(chunks);
      console.log('[TTS] Google TTS generado:', audioBuf.length, 'bytes en', chunks.length, 'partes');
    }
  } catch(e) { console.log('[TTS] Google TTS falló:', e.message); }

  // 2. OpenRouter TTS con voz masculina (echo) como alternativa
  if (!audioBuf) {
    var orKey = getKeyFromSettings('openrouter_api_key');
    if (orKey) {
      try {
        var resp = await axios.post('https://openrouter.ai/api/v1/audio/speech', {
          model: 'openai/tts-1', input: text.substring(0, 500), voice: voice || 'echo', response_format: 'mp3'
        }, { headers: { 'Authorization': 'Bearer ' + orKey }, responseType: 'arraybuffer', timeout: 30000 });
        if (resp.data && resp.data.length > 100) audioBuf = Buffer.from(resp.data);
      } catch(e) { console.log('[TTS] OpenRouter TTS falló:', e.message); }
    }
  }

  // 3. AssemblyAI TTS
  if (!audioBuf && assemblyAIKey) {
    try {
      var voicesResp = await axios.get('https://api.assemblyai.com/v2/text-to-speech/voices', {
        headers: { 'Authorization': assemblyAIKey }, timeout: 10000
      });
      var list = voicesResp.data.voices || [];
      var maleVoice = list.find(function(v) { return v.gender === 'male' && v.language && v.language.indexOf('es') >= 0; });
      var vid = voice ? (list.find(function(v) { return v.id === voice || v.name === voice; })?.id) : (maleVoice?.id || list[0]?.id);
      if (vid) {
        var resp = await axios.post('https://api.assemblyai.com/v2/text-to-speech/' + vid, { text: text.substring(0, 1000) }, {
          headers: { 'Authorization': assemblyAIKey }, responseType: 'arraybuffer', timeout: 30000
        });
        if (resp.data && resp.data.length > 100) audioBuf = Buffer.from(resp.data);
      }
    } catch(e) { console.log('[TTS] AssemblyAI falló:', e.message); }
  }

  if (audioBuf) return { audio: audioBuf, format: 'mp3' };
  return { audio: null, error: 'No hay servicio TTS disponible.' };
}

async function getVoices() {
  if (!assemblyAIKey) return [];
  try {
    var resp = await axios.get('https://api.assemblyai.com/v2/text-to-speech/voices', {
      headers: { 'Authorization': assemblyAIKey }, timeout: 10000
    });
    return resp.data.voices || [];
  } catch(e) { return []; }
}

module.exports = { transcribeAudio, textToSpeech, getVoices };
