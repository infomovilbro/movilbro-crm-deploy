// Vigilante automatico de reportes del Asistente IA
// Responde automaticamente usando la API opencode
const axios = require('axios');
const fs = require('fs');
const path = require('path');

var lastId = null;
var checkUrl = 'https://movilbro-crm.onrender.com/ai-assist-pending.json';
var respondUrl = 'https://movilbro-crm.onrender.com/ai-assist/respond';
var secret = process.env.AI_ASSIST_SECRET || 'opencode2026';
var opencodeKey = '';

// Leer key desde opencode auth.json
try {
  var authPath = path.join(require('os').homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (fs.existsSync(authPath)) {
    var auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    opencodeKey = auth.key || auth.opencode?.key || '';
  }
} catch(e) {}

async function analyze(text, selector, url) {
  if (!opencodeKey) return 'No hay API key de opencode configurada.';
  
  var prompt = 'Eres un asistente de diagnostico del CRM Movilbro. Analiza este error y propón una solución técnica. Responde en español, sé conciso. Incluye diagnostico y solucion.\n\n';
  if (url) prompt += 'URL: ' + url + '\n';
  if (selector) prompt += 'Selector: ' + selector + '\n';
  if (text) prompt += 'Descripcion: ' + text + '\n';
  
  try {
    var resp = await axios.post('https://opencode.ai/zen/v1/chat/completions', {
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    }, { timeout: 15000, headers: { 'Authorization': 'Bearer ' + opencodeKey, 'Content-Type': 'application/json' } });
    
    var content = resp?.data?.choices?.[0]?.message?.content || '';
    return content.trim();
  } catch(e) {
    return 'Error al analizar: ' + e.message;
  }
}

async function check() {
  try {
    var resp = await axios.get(checkUrl + '?_=' + Date.now(), { timeout: 5000 });
    if (!resp.data || !resp.data.id) return;
    
    var data = resp.data;
    if (data.id === lastId) return;
    lastId = data.id;
    
    console.log('Nuevo reporte #' + data.id + ':', (data.text || '').substring(0, 80));
    
    // Analizar
    var response = await analyze(data.text, data.selector, data.url);
    console.log('Respuesta:', response.substring(0, 100) + '...');
    
    // Enviar respuesta
    await axios.post(respondUrl, {
      secret: secret,
      response: response,
      solution: response.replace(/```[\s\S]*?```/g, '').substring(0, 500),
      fix_id: data.id
    }, { timeout: 5000 });
    
    console.log('Respuesta enviada correctamente.');
  } catch(e) {
    // Sin reportes nuevos o error de conexion
  }
}

console.log('Vigilante AI iniciado - revisando cada 3s...');
setInterval(check, 3000);
