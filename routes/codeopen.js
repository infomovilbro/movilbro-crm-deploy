const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../database');

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const isGroq = !!(process.env.LLM_API_KEY || process.env.GROQ_API_KEY);
const LLM_API_URL = process.env.LLM_API_URL || (isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions');
const LLM_MODEL = process.env.LLM_MODEL || (isGroq ? 'llama3-8b-8192' : 'deepseek-chat');

const tasks = new Map();
const MAX_TASKS = 20;
const TASK_TTL_MS = 30 * 60 * 1000;

setInterval(function cleanupOldTasks() {
  var now = Date.now();
  for (var [id, task] of tasks) {
    if (task.done && (now - task.endTime > TASK_TTL_MS)) {
      tasks.delete(id);
    }
  }
  if (tasks.size > MAX_TASKS) {
    var entries = Array.from(tasks.entries()).sort((a, b) => a[1].startTime - b[1].startTime);
    var toDelete = entries.slice(0, entries.length - MAX_TASKS);
    toDelete.forEach(e => tasks.delete(e[0]));
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
      facturas: (db.prepare("SELECT COUNT(*) as c FROM invoices").get() || {}).c || 0,
      suscripciones: (db.prepare("SELECT COUNT(*) as c FROM subscriptions").get() || {}).c || 0,
      usuarios: (db.prepare("SELECT COUNT(*) as c FROM users").get() || {}).c || 0,
      leads: (db.prepare("SELECT COUNT(*) as c FROM leads").get() || {}).c || 0,
      presupuestos: (db.prepare("SELECT COUNT(*) as c FROM tienda_presupuestos").get() || {}).c || 0,
    };
  } catch (e) { return {}; }
}

async function callLLM(systemPrompt, userMessage, temperature) {
  if (OPENCODE_API_KEY) {
    try {
      const r = await axios.post('https://opencode.ai/zen/v1/chat/completions', {
        model: 'deepseek-v4-flash-free',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        temperature: temperature || 0.7,
        max_tokens: 4096
      }, { timeout: 60000, headers: { 'Authorization': 'Bearer ' + OPENCODE_API_KEY, 'Content-Type': 'application/json' } });
      var text = r?.data?.choices?.[0]?.message?.content;
      if (text) return text.trim();
    } catch(e) { console.error('[CodeOpen] OpenCode API error:', e.message); }
  }
  if (!LLM_API_KEY) {
    return 'Error: No hay API key. Configura OPENCODE_API_KEY (gratis) o LLM_API_KEY en Render dashboard.';
  }
  try {
    var r = await axios.post(LLM_API_URL, {
      model: LLM_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: temperature || 0.7, max_tokens: 600
    }, { timeout: 30000, headers: { 'Authorization': 'Bearer ' + LLM_API_KEY, 'Content-Type': 'application/json' } });
    var text = r?.data?.choices?.[0]?.message?.content;
    return (text || '').trim() || 'Error: Respuesta vacía';
  } catch (e) { return 'Error: ' + e.message; }
}

const AGENT_PROMPTS = {
  orion: 'Eres Orion, analista de requisitos. Extrae los requisitos clave, objetivo principal y puntos a resolver. Máximo 500 caracteres.',
  nova: 'Eres Nova, investigadora del CRM. Busca contexto relevante en los datos: clientes, productos, tickets, facturas. Responde en español con datos concretos. Máximo 500 caracteres.',
  kronos: 'Eres Kronos, generador de soluciones técnicas. Propón código, queries SQL o pasos técnicos. Sé práctico y directo. Máximo 500 caracteres.',
  atlas: 'Eres Atlas, revisor de calidad y seguridad. Identifica errores, problemas de seguridad o mejoras. Máximo 500 caracteres.',
  ether: 'Eres Ether, sintetizador final. Toma las respuestas de Orion, Nova, Kronos y Atlas y combínalas en una respuesta final coherente, bien estructurada y útil. Máximo 2000 caracteres.'
};

router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('codeopen', { title: 'CodeOpen AI' });
});

router.post('/', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
  const msg = (req.body.message || '').trim();
  if (!msg) return res.json({ response: 'Escribe un mensaje.' });

  const sessionId = req.sessionID || String(req.session.user?.id || 'anon');

  try {
    var crmCtx = getCRMContext();
    var sysContext = 'Eres CodeOpen AI, asistente experto en programación y desarrollo web. Respondes en español.\n\n';
    if (crmCtx.project_summary) sysContext += '## RESUMEN DEL PROYECTO\n' + crmCtx.project_summary + '\n\n';
    if (Object.keys(crmCtx.facts || {}).length) sysContext += '## HECHOS CONOCIDOS\n' + JSON.stringify(crmCtx.facts, null, 2) + '\n\n';
    sysContext += '## ESTADÍSTICAS DEL CRM\nClientes: ' + crmCtx.clientes + ' | Productos: ' + crmCtx.productos + ' | Facturas: ' + crmCtx.facturas + ' | Suscripciones: ' + crmCtx.suscripciones;

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

// ---- Multi-agent async system ----

router.post('/ask', async (req, res) => {
  var question = (req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'La pregunta es requerida' });

  var sessionId = req.body.session_id || req.session?.id || 'anon_' + generateTaskId();
  var taskId = generateTaskId();
  var crmContext = getCRMContext();
  var contextStr = 'Contexto actual del CRM: ' + JSON.stringify(crmContext);

  var task = { taskId, sessionId, question, agents: { orion: {status:'waiting',result:'',progress:0}, nova: {status:'waiting',result:'',progress:0}, kronos: {status:'waiting',result:'',progress:0}, atlas: {status:'waiting',result:'',progress:0}, ether: {status:'waiting',result:'',progress:0} }, finalResponse: '', startTime: Date.now(), endTime: null, done: false };
  tasks.set(taskId, task);

  db.prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, 'user', ?)").run(sessionId, question);

  var fullMessage = contextStr + '\n\nConsulta del usuario: ' + question;

  async function runAgent(name, prompt) {
    task.agents[name].status = 'working'; task.agents[name].progress = 30;
    var result = await callLLM(prompt, fullMessage, 0.7);
    task.agents[name].result = result;
    task.agents[name].status = result.startsWith('Error') ? 'error' : 'done'; task.agents[name].progress = 100;
  }

  Promise.allSettled([
    runAgent('orion', AGENT_PROMPTS.orion), runAgent('nova', AGENT_PROMPTS.nova),
    runAgent('kronos', AGENT_PROMPTS.kronos), runAgent('atlas', AGENT_PROMPTS.atlas)
  ]).then(async function() {
    task.agents.ether.status = 'working'; task.agents.ether.progress = 30;
    var synthesisInput = '## Orion:\n' + task.agents.orion.result + '\n\n## Nova:\n' + task.agents.nova.result + '\n\n## Kronos:\n' + task.agents.kronos.result + '\n\n## Atlas:\n' + task.agents.atlas.result + '\n\nSintetiza todo en una respuesta final para el usuario.';
    var finalResult = await callLLM(AGENT_PROMPTS.ether, synthesisInput, 0.8);
    task.agents.ether.result = finalResult;
    task.agents.ether.status = finalResult.startsWith('Error') ? 'error' : 'done'; task.agents.ether.progress = 100;
    task.finalResponse = finalResult; task.endTime = Date.now(); task.done = true;
    if (!finalResult.startsWith('Error')) db.prepare("INSERT INTO chat_history (session_id, role, content) VALUES (?, 'assistant', ?)").run(sessionId, finalResult.substring(0, 2000));
  });

  res.json({ taskId });
});

router.get('/status/:taskId', (req, res) => {
  var task = tasks.get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ taskId: task.taskId, question: task.question, agents: task.agents, finalResponse: task.finalResponse, startTime: task.startTime, endTime: task.endTime, done: task.done, elapsed: task.endTime ? (task.endTime - task.startTime) : (Date.now() - task.startTime) });
});

router.post('/transcribe', (req, res) => {
  res.json({ message: 'Audio transcription endpoint ready for future use' });
});

module.exports = router;
