const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { db } = require('../database');

const HF_API_URL = 'https://api-inference.huggingface.co/models/';
const HF_MODELS = ['mistralai/Mistral-7B-Instruct-v0.3', 'HuggingFaceH4/zephyr-7b-beta'];

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
    var entries = Array.from(tasks.entries()).sort(function(a, b) { return a[1].startTime - b[1].startTime; });
    var toDelete = entries.slice(0, entries.length - MAX_TASKS);
    toDelete.forEach(function(e) { tasks.delete(e[0]); });
  }
}, 60000);

db.exec(`CREATE TABLE IF NOT EXISTS codeopen_conversaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

function generateTaskId() {
  return 'co_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function getCRMContext() {
  try {
    if (!db) return {};
    const stats = {
      clientes: (db.prepare("SELECT COUNT(*) as c FROM clients").get() || {}).c || 0,
      productos: (db.prepare("SELECT COUNT(*) as c FROM products").get() || {}).c || 0,
      tickets: (db.prepare("SELECT COUNT(*) as c FROM tickets").get() || {}).c || 0,
      facturas: (db.prepare("SELECT COUNT(*) as c FROM invoices").get() || {}).c || 0,
      suscripciones: (db.prepare("SELECT COUNT(*) as c FROM subscriptions").get() || {}).c || 0,
      usuarios: (db.prepare("SELECT COUNT(*) as c FROM users").get() || {}).c || 0,
      leads: (db.prepare("SELECT COUNT(*) as c FROM leads").get() || {}).c || 0,
      presupuestos: (db.prepare("SELECT COUNT(*) as c FROM tienda_presupuestos").get() || {}).c || 0,
    };
    return stats;
  } catch (e) {
    return {};
  }
}

function getRecentHistory(sessionId, limit) {
  if (!sessionId) return '';
  try {
    var rows = db.prepare("SELECT role, content FROM codeopen_conversaciones WHERE session_id=? ORDER BY id DESC LIMIT ?").all(sessionId, limit || 6);
    if (!rows.length) return '';
    var history = rows.reverse().map(function(r) { return (r.role === 'user' ? 'Usuario: ' : 'Asistente: ') + r.content; }).join('\n');
    return '\n\nHistorial reciente de la conversación:\n' + history;
  } catch(e) { return ''; }
}

function saveConversation(sessionId, role, content) {
  if (!sessionId || !content) return;
  try {
    db.prepare("INSERT INTO codeopen_conversaciones (session_id, role, content) VALUES (?,?,?)").run(sessionId, role, content.substring(0, 2000));
  } catch(e) {}
}

function truncateOldConversations() {
  try {
    db.prepare("DELETE FROM codeopen_conversaciones WHERE id NOT IN (SELECT id FROM codeopen_conversaciones ORDER BY id DESC LIMIT 1000)").run();
  } catch(e) {}
}
setInterval(truncateOldConversations, 3600000);

async function callLLM(systemPrompt, userMessage, temperature) {
  var fullPrompt = systemPrompt + '\n\n' + userMessage;
  var payload = {
    inputs: fullPrompt,
    parameters: { max_new_tokens: 600, temperature: temperature || 0.7, return_full_text: false }
  };
  var lastError = '';
  for (var model of HF_MODELS) {
    try {
      var r = await axios.post(HF_API_URL + model, payload, {
        timeout: 45000,
        headers: { 'Content-Type': 'application/json' }
      });
      var text = '';
      if (Array.isArray(r.data) && r.data[0]) text = r.data[0].generated_text || '';
      else text = r.data.generated_text || '';
      if (text) return text.trim();
    } catch(e) {
      lastError = e.message;
    }
  }
  return 'Error: ' + lastError;
}

const AGENT_PROMPTS = {
  orion: `Eres Orion, un analista de requisitos experto.
Tu misión es analizar la consulta del usuario, extraer los requisitos clave, identificar el objetivo principal y enumerar los puntos importantes a resolver.
Responde en español, de forma estructurada y clara.
Máximo 500 caracteres.`,
  nova: `Eres Nova, una investigadora de datos del CRM.
Tu misión es buscar contexto relevante en el CRM relacionado con la consulta del usuario.
Usa los datos disponibles: clientes, productos, tickets, facturas, etc. para dar contexto.
Responde en español con datos concretos si es posible.
Máximo 500 caracteres.`,
  kronos: `Eres Kronos, un generador de soluciones técnicas.
Tu misión es proponer código, queries SQL, scripts o pasos técnicos para resolver lo que el usuario necesita.
Sé práctico y directo, con ejemplos de código si aplica.
Responde en español.
Máximo 500 caracteres.`,
  atlas: `Eres Atlas, un revisor de calidad y seguridad.
Tu misión es revisar la solución propuesta, identificar posibles errores, problemas de seguridad o mejoras.
Sé crítico constructivo y enumera los riesgos si los hay.
Responde en español.
Máximo 500 caracteres.`,
  ether: `Eres Ether, el sintetizador final.
Tu misión es tomar TODAS las respuestas de los otros agentes (Orion, Nova, Kronos, Atlas) y combinarlas en una respuesta final coherente, bien estructurada y útil para el usuario.
Debes sintetizar, no repetir. Da una respuesta completa que integre análisis, datos, soluciones y recomendaciones de calidad.
Responde en español de forma clara y profesional.
Máximo 2000 caracteres.`
};

router.get('/', (req, res) => {
  res.render('codeopen/index', {
    title: 'CodeOpen Agentes',
    layout: 'layout'
  });
});

router.post('/ask', async (req, res) => {
  var question = (req.body.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'La pregunta es requerida' });
  }

  var sessionId = req.body.session_id || req.session?.id || 'anon_' + generateTaskId();

  var taskId = generateTaskId();
  var crmContext = getCRMContext();
  var history = getRecentHistory(sessionId, 6);
  var contextStr = 'Contexto actual del CRM: ' + JSON.stringify(crmContext);
  if (history) contextStr += history;

  var task = {
    taskId,
    sessionId,
    question,
    agents: {
      orion: { status: 'waiting', result: '', progress: 0 },
      nova: { status: 'waiting', result: '', progress: 0 },
      kronos: { status: 'waiting', result: '', progress: 0 },
      atlas: { status: 'waiting', result: '', progress: 0 },
      ether: { status: 'waiting', result: '', progress: 0 }
    },
    finalResponse: '',
    startTime: Date.now(),
    endTime: null,
    done: false
  };
  tasks.set(taskId, task);

  saveConversation(sessionId, 'user', question);

  var fullMessage = contextStr + '\n\nConsulta del usuario: ' + question;

  async function runAgent(name, prompt) {
    task.agents[name].status = 'working';
    task.agents[name].progress = 30;
    var result = await callLLM(prompt, fullMessage, 0.7);
    task.agents[name].result = result;
    task.agents[name].status = result.startsWith('Error') ? 'error' : 'done';
    task.agents[name].progress = 100;
  }

  Promise.allSettled([
    runAgent('orion', AGENT_PROMPTS.orion),
    runAgent('nova', AGENT_PROMPTS.nova),
    runAgent('kronos', AGENT_PROMPTS.kronos),
    runAgent('atlas', AGENT_PROMPTS.atlas)
  ]).then(async function() {
    task.agents.ether.status = 'working';
    task.agents.ether.progress = 30;

    var synthesisInput = '## Orion (Análisis):\n' + task.agents.orion.result +
      '\n\n## Nova (Contexto CRM):\n' + task.agents.nova.result +
      '\n\n## Kronos (Solución técnica):\n' + task.agents.kronos.result +
      '\n\n## Atlas (Revisión calidad):\n' + task.agents.atlas.result +
      '\n\nSintetiza todo esto en una respuesta final para el usuario.';

    var finalResult = await callLLM(AGENT_PROMPTS.ether, synthesisInput, 0.8);
    task.agents.ether.result = finalResult;
    task.agents.ether.status = finalResult.startsWith('Error') ? 'error' : 'done';
    task.agents.ether.progress = 100;
    task.finalResponse = finalResult;
    task.endTime = Date.now();
    task.done = true;

    if (!finalResult.startsWith('Error')) {
      saveConversation(sessionId, 'assistant', finalResult);
    }
  });

  res.json({ taskId });
});

router.get('/status/:taskId', (req, res) => {
  var task = tasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json({
    taskId: task.taskId,
    question: task.question,
    agents: task.agents,
    finalResponse: task.finalResponse,
    startTime: task.startTime,
    endTime: task.endTime,
    done: task.done,
    elapsed: task.endTime ? (task.endTime - task.startTime) : (Date.now() - task.startTime)
  });
});

router.post('/transcribe', (req, res) => {
  res.json({ message: 'Audio transcription endpoint ready for future use' });
});

module.exports = router;
