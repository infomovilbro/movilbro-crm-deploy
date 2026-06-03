const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../database');

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;

const tasks = new Map();
const sseClients = new Map();
const MAX_TASKS = 20;
const TASK_TTL_MS = 30 * 60 * 1000;

setInterval(function cleanupOldTasks() {
  var now = Date.now();
  for (var [id, task] of tasks) {
    if (task.done && (now - task.endTime > TASK_TTL_MS)) {
      tasks.delete(id); sseClients.delete(id);
    }
  }
  if (tasks.size > MAX_TASKS) {
    var entries = Array.from(tasks.entries()).sort((a, b) => a[1].startTime - b[1].startTime);
    var toDelete = entries.slice(0, entries.length - MAX_TASKS);
    toDelete.forEach(e => { tasks.delete(e[0]); sseClients.delete(e[0]); });
  }
}, 60000);

function generateTaskId() {
  return 'co_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

var PROJECT_SUMMARY = '';
try {
  PROJECT_SUMMARY = require('fs').readFileSync(require('path').join(__dirname, '..', 'PROJECT_SUMMARY.md'), 'utf8');
} catch(e) { PROJECT_SUMMARY = ''; }

function getCRMContext() {
  try {
    if (!db) return {};
    var facts = {};
    try { facts = Object.fromEntries(db.prepare("SELECT topic, content FROM shared_context").all().map(r => [r.topic, r.content.substring(0, 500)])); } catch(e) {}
    return {
      project_summary: PROJECT_SUMMARY.substring(0, 3000),
      facts: facts,
      clientes: (db.prepare("SELECT COUNT(*) as c FROM clients").get() || {}).c || 0,
      productos: (db.prepare("SELECT COUNT(*) as c FROM products").get() || {}).c || 0,
      tickets: (db.prepare("SELECT COUNT(*) as c FROM tickets").get() || {}).c || 0,
      facturas: (db.prepare("SELECT COUNT(*) as c FROM isp_facturas").get() || {}).c || 0,
      suscripciones: (db.prepare("SELECT COUNT(*) as c FROM subscriptions").get() || {}).c || 0,
      usuarios: (db.prepare("SELECT COUNT(*) as c FROM users").get() || {}).c || 0,
      leads: (db.prepare("SELECT COUNT(*) as c FROM leads").get() || {}).c || 0,
      presupuestos: (db.prepare("SELECT COUNT(*) as c FROM tienda_presupuestos").get() || {}).c || 0,
    };
  } catch (e) { return {}; }
}

async function callLLM(systemPrompt, userMessage, temperature) {
  if (!OPENCODE_API_KEY) return 'Error: OPENCODE_API_KEY no configurada';
  try {
    const r = await axios.post('https://opencode.ai/zen/v1/chat/completions', {
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: temperature || 0.7, max_tokens: 4096
    }, { timeout: 120000, headers: { 'Authorization': 'Bearer ' + OPENCODE_API_KEY, 'Content-Type': 'application/json' } });
    var text = r?.data?.choices?.[0]?.message?.content;
    return (text || '').trim() || 'Error: Respuesta vacía';
  } catch(e) { console.error('[CodeOpen] LLM error:', e.message); return 'Error: ' + e.message; }
}

const AGENT_CATEGORIES = {
  whatsapp: {
    name: 'WhatsApp', icon: 'ri-whatsapp-line', color: '#25D366',
    desc: 'Lee, analiza y responde mensajes de WhatsApp automáticamente',
    agents: [
      { id: 'lector', name: 'Lector', icon: 'ri-eye-line', desc: 'Lee el mensaje y extrae remitente, intención y urgencia', prompt: 'Eres Lector, experto en análisis de mensajes WhatsApp. Extrae: quién escribe, intención principal, urgencia (alta/media/baja), y tono. Máximo 300 caracteres.' },
      { id: 'analizador', name: 'Analizador', icon: 'ri-search-eye-line', desc: 'Busca contexto del cliente en el CRM', prompt: 'Eres Analizador CRM. Busca si el remitente existe como cliente, su historial de pagos, facturas pendientes, productos contratados. Responde con datos concretos. Máximo 400 caracteres.' },
      { id: 'redactor', name: 'Redactor', icon: 'ri-edit-line', desc: 'Redacta una respuesta profesional', prompt: 'Eres Redactor, experto en comunicación comercial. Redacta una respuesta profesional y empática al mensaje WhatsApp. Incluye saludo, respuesta clara y despedida. Máximo 400 caracteres.' },
      { id: 'validador', name: 'Validador', icon: 'ri-shield-check-line', desc: 'Revisa seguridad y calidad', prompt: 'Eres Validador. Revisa la respuesta propuesta: ¿es segura? ¿revela datos sensibles? ¿el tono es apropiado? ¿cumple normativa? Señala problemas. Máximo 300 caracteres.' },
      { id: 'sintetizador', name: 'Sintetizador', icon: 'ri-mist-line', desc: 'Combina todo en una respuesta final', prompt: 'Eres Sintetizador. Toma el análisis del Lector, contexto del Analizador, borrador del Redactor y revisión del Validador. Combínalos en una respuesta final coherente, profesional y útil. Máximo 800 caracteres.' }
    ]
  },
  email: {
    name: 'Correo', icon: 'ri-mail-send-line', color: '#EA4335',
    desc: 'Clasifica, analiza y responde correos electrónicos',
    agents: [
      { id: 'clasificador', name: 'Clasificador', icon: 'ri-folder-transfer-line', desc: 'Clasifica el correo por tipo y urgencia', prompt: 'Eres Clasificador de correo. Clasifica: tipo (consulta/reclamación/alta/baja/facturación/soporte), urgencia, y destinatario adecuado. Máximo 200 caracteres.' },
      { id: 'extractor', name: 'Extractor', icon: 'ri-database-2-line', desc: 'Extrae datos relevantes del correo', prompt: 'Eres Extractor de datos. Extrae del correo: nombre, email, teléfono, número de factura, motivo. Busca en CRM si el cliente existe. Máximo 400 caracteres.' },
      { id: 'redactor', name: 'Redactor', icon: 'ri-edit-circle-line', desc: 'Redacta respuesta profesional', prompt: 'Eres Redactor de correo profesional. Redacta respuesta formal pero cercana. Incluye asunto, saludo, cuerpo resolutivo y despedida. Máximo 500 caracteres.' },
      { id: 'revisor', name: 'Revisor', icon: 'ri-spell-check-line', desc: 'Revisa ortografía y tono', prompt: 'Eres Revisor. Corrige ortografía, gramática, tono y claridad de la respuesta. Asegura que sea profesional. Máximo 200 caracteres de correcciones.' },
      { id: 'sintetizador', name: 'Sintetizador', icon: 'ri-mist-line', desc: 'Genera versión final del correo', prompt: 'Eres Sintetizador de correo. Combina la clasificación, datos extraídos, borrador y revisiones en un correo final listo para enviar. Máximo 800 caracteres.' }
    ]
  },
  altas: {
    name: 'Altas', icon: 'ri-user-add-line', color: '#7C3AED',
    desc: 'Gestiona altas de nuevos clientes paso a paso',
    agents: [
      { id: 'validador', name: 'Validador', icon: 'ri-file-list-3-line', desc: 'Valida los datos del alta', prompt: 'Eres Validador de altas. Revisa los datos: nombre, NIF/CIF, dirección, email, teléfono. Indica qué falta o es incorrecto. Máximo 300 caracteres.' },
      { id: 'buscador', name: 'Buscador', icon: 'ri-search-line', desc: 'Busca duplicados en CRM', prompt: 'Eres Buscador. Busca en CRM si ya existe un cliente con mismos datos (email, teléfono, NIF). Advierte si hay duplicado. Máximo 300 caracteres.' },
      { id: 'generador', name: 'Generador', icon: 'ri-file-add-line', desc: 'Genera los datos del nuevo cliente', prompt: 'Eres Generador de altas. Prepara los datos del nuevo cliente: nombre, dirección, línea/servicio a contratar, precio, fecha de alta. Máximo 400 caracteres.' },
      { id: 'verificador', name: 'Verificador', icon: 'ri-check-double-line', desc: 'Verifica que todo sea correcto', prompt: 'Eres Verificador. Comprueba: ¿todos los datos obligatorios están completos? ¿el servicio está disponible? ¿la dirección es válida? ¿el precio es correcto? Máximo 300 caracteres.' },
      { id: 'sintetizador', name: 'Sintetizador', icon: 'ri-mist-line', desc: 'Resumen final del alta', prompt: 'Eres Sintetizador de altas. Combina validación, búsqueda, datos generados y verificación en un resumen final del alta listo para ejecutar. Máximo 800 caracteres.' }
    ]
  },
  code: {
    name: 'Código', icon: 'ri-code-line', color: '#0050A1',
    desc: 'Análisis, desarrollo y revisión de código',
    agents: [
      { id: 'orion', name: 'Orion', icon: 'ri-question-answer-line', desc: 'Analiza requisitos', prompt: 'Eres Orion, analista de requisitos. Extrae los requisitos clave, objetivo principal y puntos a resolver. Máximo 500 caracteres.' },
      { id: 'nova', name: 'Nova', icon: 'ri-search-eye-line', desc: 'Investiga contexto del CRM', prompt: 'Eres Nova, investigadora del CRM. Busca contexto relevante en los datos: clientes, productos, tickets, facturas. Responde en español con datos concretos. Máximo 500 caracteres.' },
      { id: 'kronos', name: 'Kronos', icon: 'ri-tools-line', desc: 'Genera soluciones técnicas', prompt: 'Eres Kronos, generador de soluciones técnicas. Propón código, queries SQL o pasos técnicos. Sé práctico y directo. Máximo 500 caracteres.' },
      { id: 'atlas', name: 'Atlas', icon: 'ri-shield-star-line', desc: 'Revisa calidad y seguridad', prompt: 'Eres Atlas, revisor de calidad y seguridad. Identifica errores, problemas de seguridad o mejoras. Máximo 500 caracteres.' },
      { id: 'ether', name: 'Ether', icon: 'ri-mist-line', desc: 'Sintetiza respuesta final', prompt: 'Eres Ether, sintetizador final. Toma las respuestas de Orion, Nova, Kronos y Atlas y combínalas en una respuesta final coherente, bien estructurada y útil. Máximo 2000 caracteres.' }
    ]
  },
  general: {
    name: 'General', icon: 'ri-robot-line', color: '#6366f1',
    desc: 'Consulta general con análisis multi-agente',
    agents: [
      { id: 'orion', name: 'Orion', icon: 'ri-question-answer-line', desc: 'Analiza la consulta', prompt: 'Eres Orion, analista. Extrae el objetivo principal, contexto y puntos clave de la consulta. Máximo 500 caracteres.' },
      { id: 'nova', name: 'Nova', icon: 'ri-search-eye-line', desc: 'Busca datos relevantes', prompt: 'Eres Nova. Busca datos relevantes del CRM relacionados con la consulta. Máximo 500 caracteres.' },
      { id: 'kronos', name: 'Kronos', icon: 'ri-tools-line', desc: 'Propone solución técnica', prompt: 'Eres Kronos. Propón soluciones prácticas, código o pasos a seguir. Máximo 500 caracteres.' },
      { id: 'atlas', name: 'Atlas', icon: 'ri-shield-star-line', desc: 'Revisa y mejora', prompt: 'Eres Atlas. Revisa la solución propuesta, identifica mejoras o riesgos. Máximo 500 caracteres.' },
      { id: 'ether', name: 'Ether', icon: 'ri-mist-line', desc: 'Sintetiza respuesta final', prompt: 'Eres Ether. Sintetiza todo en una respuesta coherente y útil. Máximo 2000 caracteres.' }
    ]
  }
};

function emitSSE(taskId, event, data) {
  var clients = sseClients.get(taskId);
  if (!clients) return;
  var msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  clients.forEach(function(res) {
    try { res.write(msg); } catch(e) { clients.delete(res); }
  });
}

router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('codeopen', { title: 'CodeOpen AI', categories: Object.keys(AGENT_CATEGORIES) });
});

router.post('/', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
  const msg = (req.body.message || '').trim();
  if (!msg) return res.json({ response: 'Escribe un mensaje.' });
  const sessionId = req.sessionID || String(req.session.user?.id || 'anon');
  try {
    var crmCtx = getCRMContext();
    var sysContext = 'Eres CodeOpen AI, asistente experto. Respondes en español.\n\n';
    if (crmCtx.project_summary) sysContext += '## RESUMEN DEL PROYECTO\n' + crmCtx.project_summary + '\n\n';
    if (Object.keys(crmCtx.facts || {}).length) sysContext += '## HECHOS CONOCIDOS\n' + JSON.stringify(crmCtx.facts, null, 2) + '\n\n';
    sysContext += '## ESTADÍSTICAS DEL CRM\nClientes: ' + crmCtx.clientes + ' | Facturas: ' + crmCtx.facturas;
    const history = db.prepare("SELECT role, content FROM chat_history WHERE session_id = ? ORDER BY created_at ASC LIMIT 20").all(sessionId);
    const messages = [{ role: 'system', content: sysContext }];
    history.forEach(h => messages.push({ role: h.role, content: h.content }));
    messages.push({ role: 'user', content: msg });
    db.prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, 'user', ?)").run(sessionId, msg);
    const response = await axios.post('https://opencode.ai/zen/v1/chat/completions', {
      model: 'deepseek-v4-flash-free', messages, temperature: 0.5, max_tokens: 4096
    }, { headers: { 'Authorization': 'Bearer ' + OPENCODE_API_KEY, 'Content-Type': 'application/json' }, timeout: 60000 });
    const reply = response?.data?.choices?.[0]?.message?.content || '';
    if (reply) db.prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, 'assistant', ?)").run(sessionId, reply);
    res.json({ response: reply || 'No obtuve respuesta.' });
  } catch (e) {
    console.error('[CodeOpen] Error:', e.message);
    res.json({ response: 'Error: ' + e.message });
  }
});

router.post('/clear', (req, res) => {
  try {
    db.prepare("DELETE FROM chat_history WHERE session_id = ?").run(req.sessionID || 'anon');
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

router.get('/categories', (req, res) => {
  var cats = {};
  for (var key in AGENT_CATEGORIES) {
    var c = AGENT_CATEGORIES[key];
    cats[key] = { name: c.name, icon: c.icon, color: c.color, desc: c.desc, agents: c.agents.map(function(a) { return { id: a.id, name: a.name, icon: a.icon, desc: a.desc }; }) };
  }
  res.json({ categories: cats });
});

router.post('/ask', async (req, res) => {
  var question = (req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'La pregunta es requerida' });
  var category = req.body.category || 'general';
  var catDef = AGENT_CATEGORIES[category];
  if (!catDef) return res.status(400).json({ error: 'Categoría inválida: ' + category });
  var sessionId = req.body.session_id || req.session?.id || 'anon_' + generateTaskId();
  var taskId = generateTaskId();
  var crmContext = getCRMContext();
  var contextStr = 'Contexto actual del CRM: ' + JSON.stringify(crmContext) + '\n\nProyecto: ' + (crmContext.project_summary || '').substring(0, 1000);
  var task = {
    taskId, sessionId, question, category,
    agents: {},
    finalResponse: '', startTime: Date.now(), endTime: null, done: false
  };
  catDef.agents.forEach(function(a) {
    task.agents[a.id] = { name: a.name, icon: a.icon, status: 'waiting', result: '', progress: 0, steps: [] };
  });
  tasks.set(taskId, task);
  sseClients.set(taskId, new Set());
  db.prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, 'user', ?)").run(sessionId, '[' + catDef.name + '] ' + question);
  emitSSE(taskId, 'start', { taskId, question, category, agents: Object.keys(task.agents) });
  var fullMessage = contextStr + '\n\nConsulta del usuario: ' + question;
  async function runAgent(agentId, agentDef, index) {
    var ag = task.agents[agentId];
    var steps = agentDef.prompt.split('. ').filter(Boolean).map(function(s, i) { return s.length > 20 ? s.substring(0, 60) + '...' : s; });
    ag.status = 'working'; ag.progress = 10;
    ag.steps.push({ text: 'Iniciando ' + agentDef.name + '...', time: Date.now() });
    emitSSE(taskId, 'agent_step', { taskId, agentId, progress: 10, step: ag.steps[ag.steps.length - 1].text, agents: task.agents });
    await new Promise(function(r) { setTimeout(r, 300 + Math.random() * 500); });
    ag.progress = 30;
    ag.steps.push({ text: 'Analizando con contexto del CRM...', time: Date.now() });
    emitSSE(taskId, 'agent_step', { taskId, agentId, progress: 30, step: 'Analizando con contexto del CRM...', agents: task.agents });
    var result = await callLLM(agentDef.prompt, fullMessage, 0.7);
    ag.progress = 80;
    ag.steps.push({ text: result.startsWith('Error') ? 'Error en análisis' : 'Análisis completado', time: Date.now() });
    emitSSE(taskId, 'agent_step', { taskId, agentId, progress: 80, step: ag.steps[ag.steps.length - 1].text, agents: task.agents });
    ag.result = result;
    ag.status = result.startsWith('Error') ? 'error' : 'done';
    ag.progress = 100;
    ag.steps.push({ text: result.startsWith('Error') ? 'Falló: ' + result.substring(0, 50) : 'Listo', time: Date.now() });
    emitSSE(taskId, 'agent_done', { taskId, agentId, result: result.substring(0, 500), agents: task.agents });
  }
  var agentList = catDef.agents;
  Promise.allSettled(agentList.slice(0, 4).map(function(a, i) { return runAgent(a.id, a, i); })
  ).then(async function() {
    var etherDef = agentList[4];
    var ag = task.agents[etherDef.id];
    ag.status = 'working'; ag.progress = 10;
    ag.steps.push({ text: 'Sintetizando respuestas de los agentes...', time: Date.now() });
    emitSSE(taskId, 'agent_step', { taskId, agentId: etherDef.id, progress: 10, step: 'Sintetizando respuestas...', agents: task.agents });
    var synthesisInput = agentList.slice(0, 4).map(function(a) { return '## ' + a.name + ':\n' + (task.agents[a.id].result || 'Sin respuesta'); }).join('\n\n');
    synthesisInput += '\n\nSintetiza todo en una respuesta final para el usuario.';
    ag.progress = 50;
    emitSSE(taskId, 'agent_step', { taskId, agentId: etherDef.id, progress: 50, step: 'Generando respuesta final...', agents: task.agents });
    var finalResult = await callLLM(etherDef.prompt, synthesisInput, 0.8);
    ag.result = finalResult;
    ag.status = finalResult.startsWith('Error') ? 'error' : 'done';
    ag.progress = 100;
    ag.steps.push({ text: finalResult.startsWith('Error') ? 'Error en síntesis' : 'Respuesta final generada', time: Date.now() });
    task.finalResponse = finalResult;
    task.endTime = Date.now();
    task.done = true;
    emitSSE(taskId, 'done', { taskId, finalResponse: finalResult, agents: task.agents });
    if (!finalResult.startsWith('Error')) db.prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, 'assistant', ?)").run(sessionId, finalResult.substring(0, 2000));
  });
  res.json({ taskId, category, agents: Object.keys(task.agents) });
});

router.get('/status/:taskId', (req, res) => {
  var task = tasks.get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({
    taskId: task.taskId, question: task.question, category: task.category,
    agents: task.agents, finalResponse: task.finalResponse,
    startTime: task.startTime, endTime: task.endTime, done: task.done,
    elapsed: task.endTime ? (task.endTime - task.startTime) : (Date.now() - task.startTime)
  });
});

router.get('/events/:taskId', (req, res) => {
  var task = tasks.get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
  var clients = sseClients.get(req.params.taskId);
  if (clients) clients.add(res);
  res.write('event: connected\ndata: {}\n\n');
  if (task.done) {
    res.write('event: done\ndata: ' + JSON.stringify({ taskId: task.taskId, finalResponse: task.finalResponse, agents: task.agents }) + '\n\n');
  }
  req.on('close', function() {
    if (clients) clients.delete(res);
    try { res.end(); } catch(e) {}
  });
});

router.post('/transcribe', (req, res) => {
  res.json({ message: 'Audio transcription endpoint ready for future use' });
});

router.get('/examples/:category', (req, res) => {
  var examples = {
    whatsapp: ['Un cliente dice "no me funciona internet desde ayer"', 'Mensaje: "quiero dar de baja mi línea"', 'Cliente nuevo: "me interesa vuestro fibra 300Mb"', '"no he recibido la factura de este mes"', '"mi wifi va muy lenta por las tardes"'],
    email: ['Reclamación: "me han cobrado de más este mes"', "Alta: solicitud de nuevo servicio fibra + móvil", "Baja: \"quiero cancelar mi línea 6XX XXX XXX\"", "Consulta: \"qué velocidad necesito para teletrabajar\"", "Facturación: \"no me llega la factura por email\""],
    altas: ['Alta para Juan García, NIF 12345678Z, dirección Calle Mayor 5', 'Portabilidad desde Vodafone: 612345678 con fibra 600Mb', "Alta de línea móvil 50GB para María López, DNI 87654321X", "Cliente empresa: TecnoShop SL, CIF B12345678, 3 líneas móviles", "Alta fibra + fijo en Calle Sol 12, 29200 Antequera"],
    code: ['Crea un endpoint para listar facturas de un cliente', 'Cómo hago un backup automático de la BD SQLite?', 'Agrega validación de NIF en el formulario de altas', 'Script para migrar clientes de CSV a SQLite', 'Cómo usar fetchCDRsForFiscalId en una ruta nueva?'],
    general: ['Explica la estructura del proyecto CRM', 'Cuántos clientes hay dados de alta?', 'Cómo funciona el sistema de facturación?', 'Qué tablas usa la tienda?', 'Resumen de tecnologías usadas en el proyecto']
  };
  res.json({ examples: examples[req.params.category] || examples.general });
});

module.exports = router;
