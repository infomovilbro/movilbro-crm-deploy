const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const tasks = new Map();

function generateTaskId() {
  return 'co_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function getCRMContext() {
  try {
    const { db } = require('../database');
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

async function callDeepSeek(systemPrompt, userMessage, temperature = 0.7) {
  if (!DEEPSEEK_API_KEY) {
    return 'Error: DEEPSEEK_API_KEY no configurada. Configúrala en las variables de entorno.';
  }
  try {
    const payload = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature,
      max_tokens: 2048
    };
    const r = await axios.post(DEEPSEEK_API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
    return (r?.data?.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    return `Error en llamada DeepSeek: ${e.message}`;
  }
}

const AGENT_PROMPTS = {
  orion: `Eres Orion 🔭, un analista de requisitos experto.
Tu misión es analizar la consulta del usuario, extraer los requisitos clave, identificar el objetivo principal y enumerar los puntos importantes a resolver.
Responde en español, de forma estructurada y clara.
Máximo 500 caracteres.`,

  nova: `Eres Nova 🛸, una investigadora de datos del CRM.
Tu misión es buscar contexto relevante en el CRM relacionado con la consulta del usuario.
Usa los datos disponibles: clientes, productos, tickets, facturas, etc. para dar contexto.
Responde en español con datos concretos si es posible.
Máximo 500 caracteres.`,

  kronos: `Eres Kronos ⚡, un generador de soluciones técnicas.
Tu misión es proponer código, queries SQL, scripts o pasos técnicos para resolver lo que el usuario necesita.
Sé práctico y directo, con ejemplos de código si aplica.
Responde en español.
Máximo 500 caracteres.`,

  atlas: `Eres Atlas 🛡️, un revisor de calidad y seguridad.
Tu misión es revisar la solución propuesta, identificar posibles errores, problemas de seguridad o mejoras.
Sé crítico constructivo y enumera los riesgos si los hay.
Responde en español.
Máximo 500 caracteres.`,

  ether: `Eres Ether 🌀, el sintetizador final.
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
  const question = (req.body.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'La pregunta es requerida' });
  }

  const taskId = generateTaskId();
  const crmContext = getCRMContext();
  const contextStr = `Contexto actual del CRM: ${JSON.stringify(crmContext)}`;

  const task = {
    taskId,
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

  const fullMessage = contextStr + '\n\nConsulta del usuario: ' + question;

  async function runAgent(name, prompt) {
    task.agents[name].status = 'working';
    task.agents[name].progress = 30;
    const result = await callDeepSeek(prompt, fullMessage);
    task.agents[name].result = result;
    task.agents[name].status = result.startsWith('Error') ? 'error' : 'done';
    task.agents[name].progress = 100;
  }

  Promise.allSettled([
    runAgent('orion', AGENT_PROMPTS.orion),
    runAgent('nova', AGENT_PROMPTS.nova),
    runAgent('kronos', AGENT_PROMPTS.kronos),
    runAgent('atlas', AGENT_PROMPTS.atlas)
  ]).then(async () => {
    task.agents.ether.status = 'working';
    task.agents.ether.progress = 30;

    const synthesisInput = `## Orion (Análisis):
${task.agents.orion.result}

## Nova (Contexto CRM):
${task.agents.nova.result}

## Kronos (Solución técnica):
${task.agents.kronos.result}

## Atlas (Revisión calidad):
${task.agents.atlas.result}

Sintetiza todo esto en una respuesta final para el usuario.`;

    const finalResult = await callDeepSeek(AGENT_PROMPTS.ether, synthesisInput, 0.8);
    task.agents.ether.result = finalResult;
    task.agents.ether.status = finalResult.startsWith('Error') ? 'error' : 'done';
    task.agents.ether.progress = 100;
    task.finalResponse = finalResult;
    task.endTime = Date.now();
    task.done = true;
  });

  res.json({ taskId });
});

router.get('/status/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId);
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
