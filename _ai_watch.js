// Vigilante automatico: detecta reportes, analiza con opencode API y responde
const axios = require('axios');
const fs = require('fs');
const path = require('path');

var lastId = null;
var checkUrl = 'https://movilbro-crm.onrender.com/ai-assist-pending.json';
var respondUrl = 'https://movilbro-crm.onrender.com/ai-assist/respond';
var secret = process.env.AI_ASSIST_SECRET || 'opencode2026';
var opencodeKey = '';

// Cargar API key de opencode
try {
  var authPath = path.join(require('os').homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (fs.existsSync(authPath)) {
    var auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    opencodeKey = auth.key || auth.opencode?.key || '';
  }
} catch(e) { console.error('Error loading opencode key:', e.message); }

async function analizar(texto, selector, url, elemText) {
  if (!opencodeKey) return 'No hay API key de opencode.';
  
  var prompt = 'Eres un asistente de diagnostico del CRM Movilbro.';
  prompt += ' Analiza este error y propón solucion. Responde en español, conciso.\n\n';
  if (url) prompt += 'URL: ' + url + '\n';
  if (selector) prompt += 'Selector CSS: ' + selector + '\n';
  if (elemText) prompt += 'Texto: ' + elemText.substring(0, 200) + '\n';
  if (texto) prompt += 'Descripcion: ' + texto + '\n';
  prompt += '\nIndica: 1) Que hace ese elemento 2) Diagnostico 3) Solucion con codigo si aplica.';
  
  try {
    var resp = await axios.post('https://opencode.ai/zen/v1/chat/completions', {
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, max_tokens: 600
    }, { timeout: 20000, headers: { 'Authorization': 'Bearer ' + opencodeKey, 'Content-Type': 'application/json' } });
    
    var content = resp?.data?.choices?.[0]?.message?.content || '';
    return content.trim() || 'No se pudo analizar.';
  } catch(e) {
    return 'Error: ' + (e.response?.data?.error?.message || e.message);
  }
}

async function check() {
  try {
    var resp = await axios.get(checkUrl + '?_=' + Date.now(), { timeout: 8000 });
    if (!resp.data || !resp.data.id) return;
    if (resp.data.id === lastId) return;
    lastId = resp.data.id;
    
    var d = resp.data;
    console.log('\n=== NUEVO REPORTE #' + d.id + ' ===');
    if (d.text) console.log('Texto:', d.text.substring(0, 100));
    if (d.selector) console.log('Selector:', d.selector.substring(0, 80));
    
    // Guardar para que yo lo vea
    var info = 'REPORTE #' + d.id + '\n';
    if (d.text) info += 'Texto: ' + d.text + '\n';
    if (d.url) info += 'URL: ' + d.url + '\n';
    if (d.selector) info += 'Selector: ' + d.selector + '\n';
    if (d.element_text) info += 'Elemento: ' + d.element_text.substring(0, 200) + '\n';
    fs.writeFileSync(path.join(__dirname, '_ai_pending.txt'), info);
    console.log('Guardado en _ai_pending.txt');
    
    // Analizar automaticamente con opencode API
    console.log('Analizando...');
    var respuesta = await analizar(d.text, d.selector, d.url, d.element_text);
    console.log('Respuesta:', respuesta.substring(0, 120) + '...');
    
    // Enviar respuesta al CRM
    var sol = respuesta.replace(/```[\s\S]*?```/g, '').substring(0, 500);
    await axios.post(respondUrl, {
      secret: secret,
      response: respuesta,
      solution: sol,
      fix_id: d.id
    }, { timeout: 10000 });
    
    console.log('Respuesta enviada al CRM!\n');
  } catch(e) {
    // Sin reportes o error temporal
  }
}

console.log('🤖 Vigilante opencode iniciado - revisando cada 3s...');
setInterval(check, 3000);
