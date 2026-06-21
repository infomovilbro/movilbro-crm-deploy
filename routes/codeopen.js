const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../database');
const LikesAPI = require('../likes-api');

function getOpenCodeKey() {
  var key = process.env.OPENCODE_API_KEY || '';
  try {
    var dbKey = db.prepare("SELECT value FROM settings WHERE key='opencode_api_key'").get();
    if (dbKey && dbKey.value) key = dbKey.value;
  } catch(e) {}
  if (!key) key = 'sk-ByGEsXh2rCIBC6bkv7BvhS30adEiPieE1ZcLIXTl0G2dA3ywHOEycNIYFTXaQvEY';
  return key;
}
function getOpenRouterKey() {
  var key = process.env.OPENROUTER_API_KEY || '';
  try {
    var orKey = db.prepare("SELECT value FROM settings WHERE key='openrouter_api_key'").get();
    if (orKey && orKey.value) key = orKey.value;
  } catch(e) {}
  return key;
}

// Modelos disponibles
function getModelConfig(modelId) {
  var models = {
    'deepseek-v4-flash-free': {
      name: 'DeepSeek V4 Flash Free',
      provider: 'opencode',
      apiEndpoint: 'https://opencode.ai/zen/v1/chat/completions',
      key: getOpenCodeKey(),
      description: 'Gratis, DeepSeek V4 Flash',
      type: 'text',
      fallbacks: ['nemotron-3-ultra-free', 'gemini-2.0-flash-openrouter']
    },
    'nemotron-3-ultra-free': {
      name: 'Nemotron 3 Ultra Free',
      provider: 'opencode',
      apiEndpoint: 'https://opencode.ai/zen/v1/chat/completions',
      key: getOpenCodeKey(),
      description: 'Gratis, NVIDIA Nemotron 3 Ultra',
      type: 'text',
      fallbacks: ['gemini-2.0-flash-openrouter', 'deepseek-v4-flash-free']
    },
    'nemotron-3-super-free': {
      name: 'Nemotron 3 Super Free',
      provider: 'opencode',
      apiEndpoint: 'https://opencode.ai/zen/v1/chat/completions',
      key: getOpenCodeKey(),
      description: 'Gratis, NVIDIA Nemotron 3 Super',
      type: 'text',
      fallbacks: ['deepseek-v4-flash-free', 'nemotron-3-ultra-free']
    },
    'gemini-2.0-flash-openrouter': {
      name: 'Gemini 2.0 Flash',
      provider: 'openrouter',
      apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      key: getOpenRouterKey(),
      description: 'Gratis via OpenRouter, Google Gemini 2.0 Flash',
      type: 'text',
      requiresKey: 'OPENROUTER_API_KEY',
      keyHint: 'Crea API key gratis en https://openrouter.ai/keys',
      fallbacks: ['mistral-small-openrouter', 'deepseek-v4-flash-free']
    },
    'mistral-small-openrouter': {
      name: 'Mistral Small',
      provider: 'openrouter',
      apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      key: getOpenRouterKey(),
      description: 'Gratis via OpenRouter, Mistral Small 24B',
      type: 'text',
      requiresKey: 'OPENROUTER_API_KEY',
      keyHint: 'Crea API key gratis en https://openrouter.ai/keys',
      fallbacks: ['llama-3.2-openrouter', 'gemini-2.0-flash-openrouter']
    },
    'llama-3.2-openrouter': {
      name: 'Llama 3.2 3B',
      provider: 'openrouter',
      apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      key: getOpenRouterKey(),
      description: 'Gratis via OpenRouter, Meta Llama 3.2 3B',
      type: 'text',
      requiresKey: 'OPENROUTER_API_KEY',
      keyHint: 'Crea API key gratis en https://openrouter.ai/keys',
      fallbacks: ['gemini-2.0-flash-openrouter', 'deepseek-v4-flash-free']
    }
  };
  return modelId ? models[modelId] : models;
}

function getUserModel() {
  try {
    var row = db.prepare("SELECT value FROM settings WHERE key='ai_model'").get();
    if (row && row.value && getModelConfig()[row.value]) return row.value;
  } catch(e) {}
  return 'deepseek-v4-flash-free';
}

function setUserModel(modelId) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_model', ?)").run(modelId);
  } catch(e) {}
}

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
      acciones_disponibles: 'bloquear_linea(telefono) - Bloquea línea por robo/perdida. cobertura(direccion) - Consulta cobertura fibra. cambiar_tarifa(linea, nuevoProducto) - Cambia tarifa.',
    };
  } catch (e) { return {}; }
}

// ---- DETECCIÓN Y RECUPERACIÓN DE DOCUMENTOS ----
// Cuando un cliente pide una factura/contrato, el sistema la busca y la prepara
async function detectAndFetchDocument(msgBody, fromName, fromAddress) {
  try {
    // 1. Preguntar a la IA si esto es una petición de documento
    var docPrompt = 'Analiza si el cliente está pidiendo UN DOCUMENTO (factura, contrato, recibo, albarán, justificante). ' +
      'Responde SOLO con JSON: {"isDocument":true/false, "type":"factura/contrato/recibo/otro", "periodo":"mes-año o null", "clientName":"nombre del cliente si lo menciona o null", "clientDni":"DNI si lo menciona o null"}\n\n' +
      'Cliente: ' + fromName + '\nMensaje: ' + msgBody;
    
    var llmResp = await callLLM(docPrompt, '', 0.3, 'deepseek-v4-flash-free');
    // Limpiar la respuesta: quitar thinking y markdown, extraer solo JSON
    var cleanResp = llmResp.replace(/.*?\{/s, '{').replace(/\}.*/s, '}');
    cleanResp = cleanResp.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    var jsonMatch = cleanResp.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try { var info = JSON.parse(jsonMatch[0]); } catch(e) { return null; }
    if (!info.isDocument) return null;
    
    // 2. Buscar el cliente en la BD
    var client = null;
    var searchPhone = fromAddress.replace(/[^0-9]/g, '');
    if (searchPhone.length >= 9) {
      client = db.prepare("SELECT * FROM clients WHERE telefono LIKE ? OR telefono2 LIKE ? LIMIT 1").get('%' + searchPhone + '%', '%' + searchPhone + '%');
    }
    if (!client && info.clientDni) {
      client = db.prepare("SELECT * FROM clients WHERE dni_nif=? LIMIT 1").get(info.clientDni);
    }
    if (!client && info.clientName) {
      client = db.prepare("SELECT * FROM clients WHERE nombre LIKE ? LIMIT 1").get('%' + info.clientName.substring(0, 30) + '%');
    }
    if (!client) return { error: 'Cliente no identificado. Pídele nombre completo y DNI.' };
    
    // 3. Buscar la factura/documento
    if (info.type === 'factura' || info.type === 'recibo') {
      var periodo = info.periodo || '';
      var factura = null;
      if (periodo) {
        factura = db.prepare("SELECT * FROM isp_facturas WHERE fiscal_id=? AND periodo=? LIMIT 1").get(client.dni_nif || client.likes_customer_id, periodo);
      }
      if (!factura) {
        factura = db.prepare("SELECT * FROM isp_facturas WHERE fiscal_id=? ORDER BY created_at DESC LIMIT 1").get(client.dni_nif || client.likes_customer_id);
      }
      if (!factura) return { error: 'No encontré facturas para ' + client.nombre + '.', clientName: client.nombre };
      
      // 4. Buscar el PDF generado en archivos
      var archivo = db.prepare("SELECT * FROM archivos WHERE nombre LIKE ? ORDER BY created_at DESC LIMIT 1").get('%' + factura.serie + '-' + factura.numero_factura + '%');
      if (!archivo) {
        // Intentar con el periodo
        archivo = db.prepare("SELECT * FROM archivos WHERE periodo=? AND nombre LIKE '%factura%' ORDER BY created_at DESC LIMIT 1").get(factura.periodo);
      }
      
      return {
        clientName: client.nombre,
        factura: factura,
        archivo: archivo ? { id: archivo.id, nombre: archivo.nombre, driveId: archivo.drive_id } : null,
        encontrado: !!archivo,
        resumen: 'Factura de ' + factura.periodo + ' por ' + factura.importe_total + '€'
      };
    }
    
    if (info.type === 'contrato') {
      var contrato = db.prepare("SELECT * FROM isp_contratos WHERE fiscal_id=? ORDER BY created_at DESC LIMIT 1").get(client.dni_nif || client.likes_customer_id);
      if (!contrato) return { error: 'No encontré contrato para ' + client.nombre + '.', clientName: client.nombre };
      return { clientName: client.nombre, contrato: contrato, encontrado: true };
    }
    
    return { error: 'No sé cómo obtener ' + info.type + '. Pregunta al administrador.' };
  } catch(e) {
    return { error: 'Error buscando documento: ' + e.message };
  }
}

// ---- DETECCIÓN DE ALTAS (nuevas contrataciones) ----
function detectAltaIntent(msgBody, fromName) {
  var keywords = ['alta', 'contratar', 'nueva línea', 'nueva linea', 'portabilidad', 'quiero fibra', 'quiero móvil', 'me interesa', 'presupuesto', 'tarifa', 'cuanto cuesta', 'precio', 'contratación', 'contratacion', 'dar de alta', 'nuevo servicio', 'activar', 'instalación', 'instalacion', 'me gustaria', 'me gustaría'];
  var text = (msgBody + ' ' + fromName).toLowerCase();
  var matches = keywords.filter(function(k) { return text.indexOf(k) >= 0; });
  if (matches.length > 0) {
    var score = Math.min(matches.length, 5) / 5;
    return { isAlta: score > 0.3, score: score, matches: matches, keywords: matches.slice(0, 3) };
  }
  return { isAlta: false, score: 0, matches: [] };
}

async function callLLM(systemPrompt, userMessage, temperature, modelId, maxTokens) {
  maxTokens = maxTokens || 200;
  var primaryModel = modelId || getUserModel();
  if (!getModelConfig(primaryModel)) return 'Error: Modelo no disponible';

  var modelsToTry = [primaryModel, 'deepseek-v4-flash-free', 'nemotron-3-ultra-free', 'nemotron-3-super-free'];
  if (getModelConfig('gemini-2.0-flash-openrouter')?.key) modelsToTry.push('gemini-2.0-flash-openrouter');
  
  // Probar modelos en ORDEN (secuencial), fallback si falla
  var factories = modelsToTry.filter(function(m) { return getModelConfig(m) && getModelConfig(m).key; }).map(function(m) {
    return function() {
      var cfg = getModelConfig(m);
      return axios.post(cfg.apiEndpoint, {
        model: m,
        messages: [{ role: 'user', content: ((systemPrompt || '') + '\n' + (userMessage || '')).substring(0, 500) }],
        temperature: temperature || 0.3, max_tokens: maxTokens
      }, { timeout: 8000, headers: { 'Authorization': 'Bearer ' + cfg.key, 'Content-Type': 'application/json' } })
      .then(function(resp) {
        var msg = resp?.data?.choices?.[0]?.message;
        var text = msg?.content || msg?.reasoning_content || '';
        if (text && text.trim()) {
          try { db.prepare("INSERT INTO model_usage (model_id, date, calls) VALUES (?, ?, 1) ON CONFLICT(model_id, date) DO UPDATE SET calls = calls + 1, updated_at = CURRENT_TIMESTAMP").run(m, new Date().toISOString().split('T')[0]); } catch(e) {}
          return { model: m, text: text.trim() };
        }
        return null;
      })
      .catch(function(e) {
        var is429 = e.response && e.response.status === 429;
        if (!is429) console.log('[CodeOpen] Error en ' + m + ':', e.message);
        return null;
      });
    };
  });

  // Probar modelos en orden secuencial, como funcionaba antes
  return await new Promise(function(resolve) {
    if (factories.length === 0) resolve('Error: Inténtalo de nuevo en unos segundos.');
    var timedOut = false;
    var timer = setTimeout(function() {
      timedOut = true;
      resolve('Error: Inténtalo de nuevo en unos segundos.');
    }, 25000);
    async function tryNext(idx) {
      if (timedOut || idx >= factories.length) {
        if (!timedOut) resolve('Error: Inténtalo de nuevo en unos segundos.');
        return;
      }
      try {
        var result = await factories[idx]();
        if (timedOut) return;
        if (result && result.text) {
          clearTimeout(timer);
          try { db.prepare("UPDATE model_usage SET calls = calls + 1, updated_at = CURRENT_TIMESTAMP WHERE model_id = ? AND date = ?").run(result.model, new Date().toISOString().split('T')[0]); } catch(e) {}
          resolve(result.text);
          return;
        }
      } catch(e) {}
      tryNext(idx + 1);
    }
    tryNext(0);
  });
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
  var modelId = req.body.model || getUserModel();
  var modelConfig = getModelConfig(modelId);
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
    const response = await axios.post(modelConfig.apiEndpoint, {
      model: modelId, messages, temperature: 0.5, max_tokens: 4096
    }, { headers: { 'Authorization': 'Bearer ' + modelConfig.key, 'Content-Type': 'application/json' }, timeout: 25000 });
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
  
  // Si es categoría "code", ejecutar cambios reales
  if (category === 'code') {
    var modelId = req.body.model || getUserModel();
    try {
      var execResult = await executeCodeTask(question, modelId);
      res.json({ taskId: generateTaskId(), category: 'code', directResult: execResult, agents: ['orion', 'nova', 'kronos', 'atlas', 'ether'], done: true });
      return;
    } catch(e) {
      res.json({ taskId: generateTaskId(), category: 'code', directResult: { ok: false, error: e.message }, agents: [], done: true });
      return;
    }
  }
  
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
  var sessionIdForContext = req.body.session_id || req.session?.id || 'anon_' + generateTaskId();
  var recentHistory = [];
  try {
    recentHistory = db.prepare("SELECT role, content FROM chat_history WHERE session_id = ? ORDER BY created_at ASC LIMIT 10").all(sessionIdForContext);
  } catch(e) {}
  var historyStr = recentHistory.length > 0 ? '\n\nHistorial reciente:\n' + recentHistory.map(function(h) { return h.role + ': ' + h.content.substring(0, 200); }).join('\n') : '';
  var fullMessage = contextStr + historyStr + '\n\nNueva consulta del usuario: ' + question;
  async function runAgent(agentId, agentDef, index) {
    var ag = task.agents[agentId];
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

// ---- MODELOS DISPONIBLES ----
router.get('/models', (req, res) => {
  var models = {};
  for (var key in getModelConfig()) {
    var m = getModelConfig()[key];
    var needsKey = m.requiresKey && !m.key;
    models[key] = { id: key, name: m.name, description: m.description, type: m.type, needsKey: needsKey, keyHint: needsKey ? m.keyHint : null };
  }
  res.json({ models: models, current: getUserModel() });
});

router.get('/model/current', (req, res) => {
  res.json({ model: getUserModel(), config: getModelConfig()[getUserModel()] ? { name: getModelConfig()[getUserModel()].name, description: getModelConfig()[getUserModel()].description } : null });
});

router.post('/model/select', (req, res) => {
  var modelId = req.body.model || req.query.model;
  if (!modelId || !getModelConfig()[modelId]) return res.status(400).json({ error: 'Modelo inválido' });
  setUserModel(modelId);
  console.log('[CodeOpen] Modelo cambiado a:', modelId);
  res.json({ ok: true, model: modelId, name: getModelConfig()[modelId].name });
});

// ---- MODEL USAGE TRACKING (real desde tabla model_usage) ----
router.get('/model-usage', (req, res) => {
  try {
    var usage = {};
    var models = Object.keys(getModelConfig());
    var today = new Date().toISOString().split('T')[0];
    models.forEach(function(m) {
      var row = db.prepare("SELECT calls FROM model_usage WHERE model_id=? AND date=?").get(m, today);
      var count = row ? row.calls : 0;
      var MAX_CALLS = 100;
      var pct = Math.min(Math.round(count / MAX_CALLS * 100), 100);
      usage[m] = { name: getModelConfig()[m].name, calls: count, percent: pct, maxCalls: MAX_CALLS };
    });
    res.json({ usage: usage, date: today });
  } catch(e) { res.json({ usage: {}, error: e.message }); }
});

// ---- WEBHOOK WHATSAPP ----
var whatsappMessages = [];
var emailMessages = [];

// Dedup DB: evitar textos repetidos (persistente entre reinicios)
function esDuplicado(texto) {
  if (!texto || texto.length < 5) return true;
  var existente = db.prepare("SELECT id FROM pending_messages WHERE body = ? AND created_at > datetime('now', '-2 hours') LIMIT 1").get(texto.trim().substring(0, 200));
  return !!existente;
}

router.post('/webhook/whatsapp', async (req, res) => {
  var from = req.body.from || req.body.remitente || 'desconocido';
  var message = req.body.message || req.body.mensaje || req.body.text || '';
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
  
  // Solo aceptar mensajes CON timestamp posterior a las 12:45 del 6 de junio
  var cutoff = new Date('2026-06-06T12:45:00+02:00');
  var msgDate = req.body.timestamp ? new Date(req.body.timestamp) : null;
  if (msgDate === null || isNaN(msgDate.getTime())) {
    return res.json({ ok: false, message: 'Mensaje sin timestamp válido, rechazado' });
  }
  if (msgDate < cutoff) {
    return res.json({ ok: false, message: 'Mensaje anterior a las 12:45, rechazado' });
  }
  
  // Dedup persistente en DB: mismo texto en las ultimas 2h = duplicado
  if (esDuplicado(message)) {
    return res.json({ ok: true, dedup: true, message: 'Duplicado ignorado' });
  }
  
  // SIN auto-análisis: solo guardar pendiente para que el usuario decida
  var id = db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category) VALUES (?,?,?,?,?,'pending','whatsapp')").run('whatsapp', from, from, message, null);
  // Detectar si es una solicitud de alta
  var altaInfo = detectAltaIntent(message, from);
  if (altaInfo.isAlta) {
    db.prepare("UPDATE pending_messages SET category='altas', altas_score=? WHERE id=?").run(altaInfo.score, id.lastInsertRowid);
  }
  whatsappMessages.push({ id: id.lastInsertRowid, from, message, status: 'pending' });
  console.log('[WhatsApp] Mensaje de', from, '→ pendiente #' + id.lastInsertRowid, '→ esperando análisis manual');
  
  res.json({ ok: true, pending_id: id.lastInsertRowid, message: 'Mensaje recibido. Ve a Pendientes para analizarlo manualmente.' });
});

router.post('/webhook/whatsapp/test', async (req, res) => {
  var msg = req.body.message || 'Hola, quería saber el estado de mi factura';
  var fakeReq = { body: { from: 'Cliente de prueba', message: msg } };
  var fakeRes = { json: function(d) { console.log('[Test Webhook] Response:', d); }, status: function() { return this; } };
  try {
    var from = fakeReq.body.from;
    var message = fakeReq.body.message;
    var crmCtx = getCRMContext();
    var ctx = 'Contexto CRM: ' + JSON.stringify(crmCtx) + '\n\nMensaje WhatsApp de ' + from + ': ' + message;
    var catDef = AGENT_CATEGORIES.whatsapp;
    var results = {};
    for (var a of catDef.agents.slice(0, 4)) { results[a.id] = await callLLM(a.prompt, ctx, 0.7); }
    var synthesisInput = catDef.agents.slice(0, 4).map(function(a) { return '## ' + a.name + ':\n' + (results[a.id] || ''); }).join('\n\n') + '\n\nSintetiza todo en una respuesta final lista para enviar.';
    var finalResponse = await callLLM(catDef.agents[4].prompt, synthesisInput, 0.8);
    var id = db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category) VALUES (?,?,?,?,?, 'pending', 'whatsapp')").run('whatsapp_test', from, from, message, finalResponse || '');
    res.json({ ok: true, pending_id: id.lastInsertRowid, response: finalResponse });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- WEBHOOK EMAIL ----
router.post('/webhook/email', async (req, res) => {
  var from = req.body.from || req.body.remitente || req.body.de || 'desconocido';
  var subject = req.body.subject || req.body.asunto || '(sin asunto)';
  var body = req.body.body || req.body.cuerpo || req.body.text || '';
  if (!body && !subject) return res.status(400).json({ error: 'Cuerpo o asunto requerido' });
  try {
    var fullText = 'Asunto: ' + subject + '\nDe: ' + from + '\n\n' + body;
    // SIN auto-análisis: solo guardar pendiente para que el usuario decida
    var id = db.prepare("INSERT INTO pending_messages (source, from_name, from_address, subject, body, proposed_response, status, category) VALUES (?,?,?,?,?,?,'pending','email')").run('email', from, from, subject, fullText, null);
    // Detectar si es una solicitud de alta
    var altaInfo = detectAltaIntent(body, from);
    if (altaInfo.isAlta) {
      db.prepare("UPDATE pending_messages SET category='altas', altas_score=? WHERE id=?").run(altaInfo.score, id.lastInsertRowid);
    }
    emailMessages.push({ id: id.lastInsertRowid, from, subject, body: fullText, response: null, status: 'pending' });
    console.log('[Email] Correo de', from, '→ pendiente #' + id.lastInsertRowid, '→ esperando análisis manual');
    res.json({ ok: true, pending_id: id.lastInsertRowid, message: 'Correo recibido. Ve a Pendientes para analizarlo manualmente.' });
  } catch(e) { console.error('[Email Webhook] Error:', e.message); res.status(500).json({ error: e.message }); }
});

// ---- IMAP POLLING ----
var imapInterval = null;
var imapRunning = false;
var processedUIDs = {};

function getIMAPLastDate() {
  try {
    var row = db.prepare("SELECT value FROM settings WHERE key='imap_last_date'").get();
    if (row && row.value) return row.value;
  } catch(e) {}
  return '';
}

function setIMAPLastDate(dateStr) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('imap_last_date', ?)").run(dateStr);
  } catch(e) {}
}

var gmailUser = process.env.GMAIL_USER || 'infomovilbro@gmail.com';
var gmailPass = process.env.GMAIL_PASS || '';
// Fallback to DB settings if env vars not set
try {
  var emailService = require('../services/email');
  var creds = emailService.getGmailCreds();
  if (!gmailPass && creds.pass) gmailPass = creds.pass;
  if (creds.user) gmailUser = creds.user;
} catch(e) {}
var ImapModule = null, simpleParserModule = null;
try { ImapModule = require('imap'); simpleParserModule = require('mailparser').simpleParser; } catch(e) { console.error('[IMAP] Error cargando módulos:', e.message); }

function startIMAPPolling() {
  if (!gmailUser || !gmailPass) {
    console.log('[IMAP] GMAIL_USER/GMAIL_PASS no configurados, polling desactivado');
    return;
  }
  if (imapRunning) return;
  imapRunning = true;
  console.log('[IMAP] Iniciando polling cada 120s para', gmailUser);

  // NO hay IMAP automático - solo se revisa cuando el usuario pulsa "Refrescar" en Pendientes
  // Esto ahorra ~50-100MB de RAM al no mantener conexión IMAP permanente
  console.log('[IMAP] Modo bajo demanda activado. Usa el boton Refrescar en Pendientes.');
}

function checkMail() {
  if (!ImapModule || !simpleParserModule) return;
  var Imap = ImapModule;
  var simpleParser = simpleParserModule;
  
  function processInbox(boxName, markSeen) {
    return new Promise(function(resolve) {
      try {
        var imap = new Imap({ user: gmailUser, password: gmailPass, host: 'imap.gmail.com', port: 993, tls: true, tlsOptions: { rejectUnauthorized: false } });
        imap.once('ready', function() {
          imap.openBox(boxName, true, function(err, box) {
            if (err) { console.error('[IMAP] Error abriendo', boxName, ':', err.message); imap.end(); resolve(); return; }

            var lastDate = getIMAPLastDate();
            var searchSince = lastDate;
            if (!searchSince) {
              var d = new Date(); d.setDate(d.getDate() - 3);
              searchSince = d.toISOString().split('T')[0];
            }

            // Para INBOX: buscar SOLO en categoría Principal (excluir Promociones y Social)
            // Usar X-GM-RAW que permite búsqueda estilo Gmail
            var searchCriteria;
            if (boxName === 'INBOX') {
              // Solo correos de la categoría Principal + Notificaciones (excluir Promociones y Social)
              searchCriteria = ['ALL', ['SINCE', searchSince], ['X-GM-RAW', 'category:primary OR category:updates OR category:forums']];
            } else {
              searchCriteria = ['ALL', ['SINCE', searchSince]];
            }
            console.log('[IMAP] Buscando en', boxName, 'desde', searchSince);

            imap.search(searchCriteria, function(err, results) {
              if (err) { console.error('[IMAP] Error search en', boxName, ':', err.message); imap.end(); resolve(); return; }
              if (!results || results.length === 0) { console.log('[IMAP] Sin resultados en', boxName); imap.end(); resolve(); return; }

              var newResults = results.filter(function(uid) { 
                var key = '' + boxName + '_' + uid;
                if (processedUIDs[key]) return false;
                // Also check persistent DB cache
                var cached = db.prepare("SELECT id FROM settings WHERE key='imap_uid_" + key.replace(/[^a-zA-Z0-9]/g, '_') + "'").get();
                if (cached) { processedUIDs[key] = true; return false; }
                return true;
              });
              if (newResults.length === 0) { imap.end(); resolve(); return; }
              console.log('[IMAP]', newResults.length, 'nuevos en', boxName);

              var toFetch = newResults.slice(0, 5);
              var fetch = imap.fetch(toFetch, { bodies: '', markSeen: markSeen });
              fetch.on('message', function(msg, seqno) {
                var chunks = [];
                msg.on('body', function(stream) { stream.on('data', function(chunk) { chunks.push(chunk.toString()); }); });
                msg.on('attributes', function(attrs) {
                  var uid = attrs.uid;
                  if (uid) {
                    processedUIDs['' + boxName + '_' + uid] = true;
                    try { 
                      var uidKey = 'imap_uid_' + String(boxName).replace(/[^a-zA-Z0-9]/g, '_') + '_' + String(uid);
                      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").run(uidKey); 
                    } catch(e) { console.error('[IMAP] UID save error:', e.message); }
                  }
                });
                msg.on('end', function() {
                  var raw = chunks.join('');
                  simpleParser(raw).then(function(parsed) {
                    var from = parsed.from ? parsed.from.text : 'desconocido';
                    var fromAddr = parsed.from ? parsed.from.value[0].address : '';
                    var subject = parsed.subject || '(sin asunto)';
                    var body = parsed.text || parsed.html || '';
                    var date = parsed.date || new Date();
                    if (body.length > 3000) body = body.substring(0, 3000) + '...';
                    var fullText = 'Asunto: ' + subject + '\nDe: ' + from + '\n\n' + body;

                    if (emailExists(fromAddr, subject)) {
                      console.log('[IMAP] Duplicado, saltando:', fromAddr, '-', subject);
                      return;
                    }

                    // Guardar sin auto-análisis (como WhatsApp)
                    db.prepare("INSERT INTO pending_messages (source, from_name, from_address, subject, body, proposed_response, status, category) VALUES (?,?,?,?,?,?,'pending','email')").run('email', from, from, subject, fullText, null);
                    console.log('[IMAP] Correo guardado de', from, '-', subject.substring(0, 50));

                    var dateStr = date.toISOString().split('T')[0];
                    setIMAPLastDate(dateStr);
                  }).catch(function(e) { console.error('[IMAP] Parse error:', e.message); });
                });
              });
              fetch.on('end', function() { imap.end(); resolve(); });
            });
          });
        });
        imap.once('error', function(err) { console.error('[IMAP] Error en', boxName, ':', err.message); resolve(); });
        imap.once('end', function() {});
        imap.connect();
      } catch(e) { console.error('[IMAP] Connection error', boxName, ':', e.message); resolve(); }
    });
  }

  // Procesar INBOX (solo Principal) y Spam
  Promise.all([
    processInbox('INBOX', true),
    processInbox('[Gmail]/Spam', false)
  ]).then(function() {
    console.log('[IMAP] Ciclo completado');
  });
}

startIMAPPolling();

// ---- ANÁLISIS MANUAL (solo cuando el usuario hace clic en "Analizar") ----
// ---- MENSAJES AGRUPADOS POR CONTACTO ----
router.get('/pending/grouped', (req, res) => {
  try {
    var rows = db.prepare("SELECT * FROM pending_messages WHERE status='pending' ORDER BY created_at ASC").all();
    var groups = {};
    var order = [];
    rows.forEach(function(r) {
      var key = r.category === 'email' ? 'email_' + (r.from_address || r.from_name) : (r.from_address || r.from_name || 'desconocido');
      if (!groups[key]) {
        groups[key] = { contact: r.from_name || key, address: r.from_address || '', category: r.category || 'whatsapp', altas_score: r.altas_score || 0, messages: [] };
        order.push(key);
      }
      groups[key].messages.push(r);
    });
    var result = order.map(function(k) { return groups[k]; });
    res.json({ groups: result, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- ANÁLISIS MANUAL (solo cuando el usuario hace clic en "Analizar") ----
router.post('/analyze/:id', async (req, res) => {
  try {
    var row = db.prepare("SELECT * FROM pending_messages WHERE id=?").get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    
    var modelId = req.body.model || getUserModel();
    console.log('[CodeOpen] Analizando mensaje #' + row.id, 'de', row.from_name, 'con modelo', modelId);
    var crmCtx = getCRMContext();
    var fullText = row.body || row.subject || '';
    var bodyPreview = (row.body || '').substring(0, 300);
    var ctx = 'Contexto CRM: ' + JSON.stringify(crmCtx) + '\n\nMensaje de ' + row.from_name + ': ' + bodyPreview;
    
    // Detectar si pide un documento (factura, contrato, etc.)
    var docInfo = await detectAndFetchDocument(row.body || '', row.from_name, row.from_address);
    var docReady = false;
    var docData = null;
    
    if (docInfo && docInfo.error) {
      // Cliente no identificado o documento no encontrado
      var finalResponse = 'Hola ' + row.from_name + ', ' + docInfo.error + ' ¿En qué más puedo ayudarte?';
      db.prepare("UPDATE pending_messages SET proposed_response=? WHERE id=?").run(finalResponse, row.id);
      res.json({ ok: true, response: finalResponse, docInfo: docInfo });
      return;
    }
    
    if (docInfo && docInfo.encontrado && docInfo.archivo) {
      // Documento encontrado en BD - recuperar el buffer
      try {
        var archivoRow = db.prepare("SELECT * FROM archivos WHERE id=?").get(docInfo.archivo.id);
        if (archivoRow && archivoRow.datos) {
          docData = { buffer: archivoRow.datos, fileName: archivoRow.nombre, mimeType: 'application/pdf' };
          docReady = true;
        }
      } catch(e) {}
    }
    
    // Si el mensaje actual ya tiene un error previo y esta llamada es un reintento, limpiar el error
    if (row.proposed_response && row.proposed_response.indexOf('Error:') === 0) {
      db.prepare("UPDATE pending_messages SET proposed_response=null WHERE id=?").run(row.id);
    }

    // Generar respuesta con IA - ultra rápido (timeout 5s)
    var ctxDoc = docInfo ? 'DOC: ' + (docInfo.resumen || '') : '';
    var fastPrompt = 'Mensaje de ' + row.from_name + ': ' + (row.body || '').substring(0, 200) + ' ' + ctxDoc + '\n\nRESPUESTA (max 200 chars, directo y profesional):';
    
    var finalResponse = await callLLM(fastPrompt, '', 0.7, modelId, 300);
    var cleanResponse = finalResponse || '';
    // Limpiar thinking de DeepSeek V4: quitar todo antes de "RESPUESTA:" si existe
    var respMatch = cleanResponse.match(/RESPUESTA:\s*([\s\S]*)/i);
    var sendResponse = respMatch ? respMatch[1].trim() : cleanResponse;
    // Si no hay match con RESPUESTA, intentar extraer respuesta final despues del thinking
    if (!respMatch) {
      // Quitar lineas que empiezan con numeros/puntos (thinking)
      var lines = sendResponse.split('\n').filter(function(l) { return !/^\d+\./.test(l.trim()); });
      sendResponse = lines.join(' ').trim();
      // Si el texto contiene "**RESPUESTA**" o similar
      var boldMatch = sendResponse.match(/\*\*RESPUESTA\*\*:\s*([\s\S]*)/i);
      if (boldMatch) sendResponse = boldMatch[1].trim();
    }
    
    // Solo guardar si NO es error (si es error, no sobreescribir una respuesta previa válida)
    if (sendResponse && sendResponse.indexOf('Error:') !== 0) {
      if (docReady && docData) {
        db.prepare("UPDATE pending_messages SET proposed_response=?, document_ready=1, document_info=?, document_buffer=? WHERE id=?").run(
          sendResponse, JSON.stringify(docInfo), docData.buffer, row.id
        );
      } else {
        db.prepare("UPDATE pending_messages SET proposed_response=? WHERE id=?").run(sendResponse, row.id);
      }
      console.log('[CodeOpen] Mensaje #' + row.id + ' analizado con', modelId, docReady ? '(documento listo)' : '');
      res.json({ ok: true, response: sendResponse, docReady: docReady, docInfo: docInfo });
    } else {
      // Si hay error pero el mensaje ya tenía respuesta previa, devolver la previa
      if (row.proposed_response && row.proposed_response.indexOf('Error:') !== 0) {
        res.json({ ok: true, response: row.proposed_response, fromCache: true, docReady: docReady, docInfo: docInfo });
      } else {
        res.json({ ok: true, response: sendResponse || 'No se pudo analizar. Intenta de nuevo.', docReady: docReady, docInfo: docInfo });
      }
    }
  } catch(e) {
    console.error('[CodeOpen] Error analizando #' + req.params.id + ':', e.message);
    // Devolver respuesta previa si existe (aunque sea de un análisis anterior exitoso)
    var prevRow = db.prepare("SELECT proposed_response FROM pending_messages WHERE id=?").get(req.params.id);
    if (prevRow && prevRow.proposed_response && prevRow.proposed_response.indexOf('Error:') !== 0) {
      res.json({ ok: true, response: prevRow.proposed_response, fromCache: true });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// ---- PENDING APPROVALS ----
router.get('/pending', (req, res) => {
  try {
    var rows = db.prepare("SELECT * FROM pending_messages WHERE status='pending' ORDER BY created_at DESC LIMIT 50").all();
    res.json({ pending: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/pending/count', (req, res) => {
  try {
    var count = (db.prepare("SELECT COUNT(*) as c FROM pending_messages WHERE status='pending'").get() || {}).c || 0;
    res.json({ count });
  } catch(e) { res.json({ count: 0 }); }
});

router.post('/approve/:id', async (req, res) => {
  try {
    var row = db.prepare("SELECT * FROM pending_messages WHERE id=? AND status='pending'").get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado o ya procesado' });

    var mode = req.body.mode || 'without_forward';
    var asAudio = req.body.asAudio || false;
    var customText = (req.body.customText || '').trim();
    var responseText = customText || row.proposed_response || '';
    var sent = false;
    var sendInfo = '';

    // Enviar respuesta por WhatsApp vía Baileys
    if (row.source === 'whatsapp' || row.category === 'whatsapp') {
      try {
        var wa = require('../wa-baileys');
        var opts = {};

        // Configurar quote si es con reenvío
        if (mode === 'with_forward' && row.quoted_data) {
          opts.quotedData = row.quoted_data;
        }
        if (mode === 'with_forward' && !row.quoted_data) {
          var textWithQuote = '📩 Mensaje original:\n"' + (row.body || '') + '"\n\n---\n\n' + responseText;
          var result = await wa.sendMessage(row.from_address, textWithQuote, opts);
          if (result.ok) { sent = true; sendInfo = ' (con texto original)'; }
          else { console.log('[CodeOpen] Error WhatsApp:', result.error); }
        }

        // Enviar como documento PDF si está listo
        if (!sent && row.document_ready && row.document_buffer) {
          try {
            var docInfo = row.document_info ? JSON.parse(row.document_info) : null;
            opts.asDocument = true;
            var result = await wa.sendMessage(row.from_address, { 
              documentBuffer: row.document_buffer, 
              mimeType: 'application/pdf', 
              fileName: (docInfo && docInfo.archivo ? docInfo.archivo.nombre : 'documento.pdf'),
              text: responseText
            }, opts);
            if (result.ok) { sent = true; sendInfo = ' (📄 ' + (docInfo && docInfo.archivo ? docInfo.archivo.nombre : 'PDF') + ')'; }
            else { console.log('[CodeOpen] Error al enviar documento:', result.error); }
          } catch(docErr) { console.error('[CodeOpen] Error doc:', docErr.message); }
        }

        // Enviar como audio si se solicita (TTS directo con Google, más fiable)
        if (asAudio && responseText) {
          try {
            var audioBuf = null;
            var httpLib = require('https');
            var googleUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=' + encodeURIComponent(responseText.substring(0, 200));
            audioBuf = await new Promise(function(resolve) {
              httpLib.get(googleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function(resp) {
                var chunks = [];
                resp.on('data', function(c) { chunks.push(c); });
                resp.on('end', function() {
                  var buf = Buffer.concat(chunks);
                  resolve(buf.length > 1000 ? buf : null);
                });
              }).on('error', function() { resolve(null); });
            });
            if (audioBuf) {
              opts.asAudio = true;
              var result = await wa.sendMessage(row.from_address, { audioBuffer: audioBuf, mimeType: 'audio/mp3', text: responseText }, opts);
              if (result.ok) { sent = true; sendInfo = ' (audio)'; }
              else { sendInfo = ' (error audio: ' + result.error + ')'; console.error('[CodeOpen] Audio send fail:', result.error); }
            } else {
              sendInfo = ' (TTS no disponible)';
              console.error('[CodeOpen] Google TTS no generó audio');
            }
          } catch(ttsErr) { 
            console.error('[CodeOpen] Error TTS:', ttsErr.message);
            sendInfo = ' (error TTS: ' + ttsErr.message + ')';
          }
          if (!sent) {
            var textResult = await wa.sendMessage(row.from_address, responseText, opts);
            if (textResult && textResult.ok) { sent = true; sendInfo += ' (enviado como texto)'; }
          }
        }

        // Enviar como texto (default solo si NO es audio)
        if (!sent && !asAudio) {
          var result = await wa.sendMessage(row.from_address, responseText, opts);
          if (result.ok) { sent = true; }
          else { console.log('[CodeOpen] Error WhatsApp:', result.error); }
        }
        if (sent) console.log('[CodeOpen] WhatsApp respondido a', row.from_address, sendInfo);
      } catch(waErr) { console.error('[CodeOpen] Error WhatsApp:', waErr.message); }
    }

    // Send Email
    if (row.source === 'email' || row.category === 'email') {
      try {
        var emailService = require('../services/email');
        var sentOk = await emailService.sendEmail(row.from_address, row.from_name, 'Re: ' + (row.subject || ''), row.proposed_response);
        if (sentOk) { sent = true; console.log('[CodeOpen] Email enviado a', row.from_address); }
        else { console.log('[CodeOpen] No se pudo enviar email a', row.from_address); }
      } catch(emailErr) { console.error('[CodeOpen] Error Email:', emailErr.message); }
    }

    db.prepare("UPDATE pending_messages SET status='approved', responded_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
    res.json({ ok: true, message: sent ? ('Respuesta enviada' + sendInfo) : 'Aprobado (no se pudo enviar automáticamente)' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/reject/:id', (req, res) => {
  try {
    var row = db.prepare("SELECT * FROM pending_messages WHERE id=? AND status='pending'").get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado o ya procesado' });
    db.prepare("UPDATE pending_messages SET status='rejected', responded_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
    console.log('[Rechazado] Mensaje #' + req.params.id, row.source, '→', row.from_name);
    res.json({ ok: true, message: 'Respuesta descartada' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/delete/:id', (req, res) => {
  try {
    var info = db.prepare("DELETE FROM pending_messages WHERE id=?").run(req.params.id);
    res.json({ ok: true, deleted: info.changes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/send-document', require('multer')({ dest: '/tmp/codeopen-docs' }).single('document'), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: 'No se recibió archivo' });
    var messageId = req.body.message_id;
    if (!messageId) return res.json({ ok: false, error: 'message_id requerido' });
    var row = db.prepare("SELECT * FROM pending_messages WHERE id=? AND status='pending'").get(messageId);
    if (!row) return res.json({ ok: false, error: 'Mensaje no encontrado' });
    var wa = require('../wa-baileys');
    var fs = require('fs');
    var fileBuf = fs.readFileSync(req.file.path);
    var result = await wa.sendMessage(row.from_address, {
      documentBuffer: fileBuf,
      mimeType: req.file.mimetype || 'application/pdf',
      fileName: req.file.originalname || 'documento.pdf',
      text: '📄 Documento adjunto'
    }, { asDocument: true });
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    res.json(result);
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/delete-contact/:address', (req, res) => {
  try {
    var address = req.params.address;
    var info = db.prepare("DELETE FROM pending_messages WHERE from_address=? AND status='pending'").run(address);
    res.json({ ok: true, deleted: info.changes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/history', (req, res) => {
  try {
    var rows = db.prepare("SELECT * FROM pending_messages ORDER BY created_at DESC LIMIT 100").all();
    res.json({ history: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/pending/clear', (req, res) => {
  try {
    var info = db.prepare("DELETE FROM pending_messages").run();
    res.json({ ok: true, deleted: info.changes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/refresh-imap', (req, res) => {
  try {
    if (!gmailUser || !gmailPass) return res.json({ ok: false, error: 'GMAIL_USER/GMAIL_PASS no configurados' });
    checkMail();
    res.json({ ok: true, message: 'IMAP check triggered' });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/pending/approve-all', (req, res) => {
  try {
    var info = db.prepare("UPDATE pending_messages SET status='read', responded_at=CURRENT_TIMESTAMP WHERE status='pending'").run();
    res.json({ ok: true, updated: info.changes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function emailExists(fromAddress, subject) {
  try {
    var existing = db.prepare("SELECT id, subject FROM pending_messages WHERE from_address=? AND subject=? AND created_at > datetime('now', '-2 hours') LIMIT 1").get(fromAddress, subject);
    if (existing) return true;
    // También detectar si hay un email muy similar en la última hora (mismo remitente, mismo asunto corto)
    var subjectShort = (subject || '').substring(0, 30);
    var similar = db.prepare("SELECT id FROM pending_messages WHERE from_address=? AND substr(subject,1,30)=? AND created_at > datetime('now', '-1 hours') LIMIT 1").get(fromAddress, subjectShort);
    return !!similar;
  } catch(e) { return false; }
}

// ---- BUSCAR CLIENTE POR TELÉFONO (para botón de acceso rápido en pendientes) ----
router.get('/lookup-client/:phone', async (req, res) => {
  try {
    var rawPhone = req.params.phone;
    var phone = rawPhone.replace(/[^0-9]/g, '');
    var client = null;

    // 1) Buscar por número de teléfono (si tiene suficientes dígitos)
    if (phone && phone.length >= 6) {
      // Para JIDs de WhatsApp: @lid o @s.whatsapp.net, extraer la parte numérica
      var searchPhone = phone;
      // Si es un LID muy largo (>12 dígitos), intentar buscar por los últimos 9 dígitos
      if (phone.length > 12) searchPhone = phone.slice(-9);
      client = db.prepare("SELECT id, nombre, apellidos, dni_nif, telefono, email FROM clients WHERE telefono LIKE ? OR telefono2 LIKE ? LIMIT 1").get('%' + searchPhone + '%', '%' + searchPhone + '%');
      if (!client && phone.length > 12) {
        // Intentar también los últimos 12 dígitos
        searchPhone = phone.slice(-12);
        client = db.prepare("SELECT id, nombre, apellidos, dni_nif, telefono, email FROM clients WHERE telefono LIKE ? OR telefono2 LIKE ? LIMIT 1").get('%' + searchPhone + '%', '%' + searchPhone + '%');
      }
      // Buscar como DNI
      if (!client) client = db.prepare("SELECT id, nombre, apellidos, dni_nif, telefono, email FROM clients WHERE dni_nif=? LIMIT 1").get(phone);
    }

    // 2) Buscar por nombre de contacto en from_name (para JIDs @lid que no tienen teléfono)
    if (!client) {
      var nameMatch = decodeURIComponent(rawPhone).replace(/[@\s]/g, ' ').trim();
      if (nameMatch && nameMatch.length > 2) {
        client = db.prepare("SELECT id, nombre, apellidos, dni_nif, telefono, email FROM clients WHERE nombre LIKE ? OR apellidos LIKE ? LIMIT 1").get('%' + nameMatch.substring(0, 20) + '%', '%' + nameMatch.substring(0, 20) + '%');
      }
    }

    // 3) Buscar en API Likes Telecom por nombre si no se encontró localmente
    if (!client) {
      try {
        var nameSearch = decodeURIComponent(rawPhone).replace(/[@\s]+/g, ' ').trim();
        if (nameSearch && nameSearch.length > 2) {
          var api = LikesAPI.getApiInstance();
          if (api) {
            var likesCustomers = await api.getCustomers();
            if (likesCustomers && Array.isArray(likesCustomers)) {
              var found = likesCustomers.find(function(c) {
                var cName = (c.name || c.nombre || c.razon_social || '').toLowerCase();
                return cName.includes(nameSearch.toLowerCase());
              });
              if (found) {
                client = { id: found.id || found.customer_id, nombre: found.name || found.nombre || found.razon_social, apellidos: '', dni_nif: found.fiscal_id || found.dni || '', telefono: found.phone || found.telefono || found.mobile || '', email: found.email || '' };
              }
            }
          }
        }
      } catch(e) { console.log('[Lookup] Likes API error:', e.message); }
    }

    if (client) {
      res.json({ found: true, client: { id: client.id, name: client.nombre + ' ' + (client.apellidos || ''), dni: client.dni_nif, telefono: client.telefono, email: client.email, url: '/clientes/' + client.id, fiscalUrl: client.dni_nif ? '/clientes/fiscal/' + encodeURIComponent(client.dni_nif) : '/clientes/' + client.id } });
    } else {
      res.json({ found: false });
    }
  } catch(e) { res.json({ found: false, error: e.message }); }
});

// Diagnostic: test IMAP polling status
router.get('/imap-status', (req, res) => {
  var lastDate = getIMAPLastDate();
  res.json({
    pollingActive: imapRunning,
    lastDate: lastDate || 'none',
    processedUIDs: Object.keys(processedUIDs).length,
    pendingCount: (db.prepare("SELECT COUNT(*) as c FROM pending_messages WHERE status='pending'").get() || {}).c || 0,
    allPending: db.prepare("SELECT id, from_address, subject, status, created_at FROM pending_messages ORDER BY created_at DESC LIMIT 20").all()
  });
});

// Manual scan: check for specific email or list recent inbox
router.post('/scan-inbox', (req, res) => {
  if (!ImapModule || !simpleParserModule) return res.json({ ok: false, error: 'IMAP modules not loaded' });
  var Imap = ImapModule;
  var simpleParser = simpleParserModule;
  var results_list = [];
  try {
    var imap = new Imap({ user: gmailUser, password: gmailPass, host: 'imap.gmail.com', port: 993, tls: true, tlsOptions: { rejectUnauthorized: false } });
    imap.once('ready', function() {
      imap.openBox('INBOX', false, function(err, box) {
        if (err) { imap.end(); return res.json({ ok: false, error: err.message }); }
        imap.search(['ALL', ['SINCE', getIMAPLastDate() || '03-Jun-2026']], function(err, results) {
          if (err) { imap.end(); return res.json({ ok: false, error: err.message }); }
          if (!results || results.length === 0) { imap.end(); return res.json({ ok: true, found: 0, emails: [] }); }
          // Fetch last 5
          var uids = results.slice(-5);
          var fetch = imap.fetch(uids, { bodies: '', markSeen: false });
          var emails = [];
          fetch.on('message', function(msg, seqno) {
            var chunks = [];
            msg.on('body', function(stream) { stream.on('data', function(chunk) { chunks.push(chunk.toString()); }); });
            msg.on('end', function() {
              var raw = chunks.join('');
              simpleParser(raw).then(function(parsed) {
                emails.push({
                  from: parsed.from ? parsed.from.text : '?',
                  fromAddr: parsed.from ? parsed.from.value[0].address : '?',
                  subject: parsed.subject || '(sin asunto)',
                  date: parsed.date || '?',
                  inDB: emailExists(parsed.from ? parsed.from.value[0].address : '', parsed.subject || '')
                });
              }).catch(function() {});
            });
          });
          fetch.on('end', function() {
            imap.end();
            setTimeout(function() { res.json({ ok: true, found: uids.length, emails: emails }); }, 1000);
          });
        });
      });
    });
    imap.once('error', function(err) { res.json({ ok: false, error: err.message }); });
    imap.connect();
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Test email sending
router.post('/test-email', async (req, res) => {
  try {
    var emailService = require('../services/email');
    var to = req.body.to || 'infomovilbro@gmail.com';
    var result = await emailService.sendEmail(to, 'Test', 'Prueba CRM Movilbro', '<h2>Email de prueba</h2><p>Si recibes esto, el email funciona correctamente.</p>');
    res.json({ ok: result, message: result ? 'Email enviado a ' + to : 'Falló el envío' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Email connection test
router.get('/email-status', async (req, res) => {
  var emailService = require('../services/email');
  var status = await emailService.testConnection();
  res.json(status);
});

// ---- WHATSAPP SESSION MANAGEMENT ----
router.post('/whatsapp/logout', async (req, res) => {
  try {
    db.prepare("DELETE FROM settings WHERE key='baileys_session'").run();
    // Limpiar mensajes pendientes de WhatsApp para que no aparezcan antiguos
    db.prepare("DELETE FROM pending_messages WHERE source='baileys' OR source='whatsapp' OR category='whatsapp'").run();
    try {
      var fs = require('fs');
      var authDir = '/tmp/baileys-auth';
      if (fs.existsSync(authDir)) {
        fs.readdirSync(authDir).forEach(function(f) {
          var fp = require('path').join(authDir, f);
          if (fs.lstatSync(fp).isDirectory()) {
            fs.readdirSync(fp).forEach(function(sf) { try { fs.unlinkSync(require('path').join(fp, sf)); } catch(e) {} });
          }
          try { fs.unlinkSync(fp); } catch(e) {}
        });
      }
    } catch(e) {}
    try {
      var wa = require('../wa-baileys');
      if (wa.end) wa.end();
    } catch(e) {}
    res.json({ ok: true, message: 'Sesion de WhatsApp eliminada.', forceReload: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/whatsapp/reconnect', async (req, res) => {
  try {
    db.prepare("DELETE FROM settings WHERE key='baileys_session'").run();
    var wa = require('../wa-baileys');
    try { wa.end(); } catch(e) {}
    setTimeout(function() {
      wa.initBaileys().catch(function(e) { console.error('[WA] Reinit:', e.message); });
    }, 2000);
    res.json({ ok: true, message: 'Sesion borrada. Nuevo QR disponible en breve.' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/whatsapp/login-phone', async (req, res) => {
  try {
    var phoneNumber = (req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phoneNumber || phoneNumber.length < 10) return res.json({ ok: false, error: 'Numero invalido. Debe tener al menos 10 digitos.' });
    
    var wa = require('../wa-baileys');
    
    // Forzar reinicio de Baileys para asegurar pairing limpio
    try { wa.end(); } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 3000); });
    
    // Inicializar con el numero para pairing
    await wa.initBaileys(phoneNumber);
    
    // Esperar que el socket conecte y genere el pairing code
    await new Promise(function(r) { setTimeout(r, 8000); });
    
    var code = null;
    try {
      code = await wa.requestPairingCode(phoneNumber);
    } catch(e) {
      console.error('[Phone] Pairing error:', e.message);
    }
    
    if (code) {
      res.json({ ok: true, message: 'Codigo enviado a tu WhatsApp. Revisa la notificacion.', pairingCode: code });
    } else {
      res.json({ ok: true, message: 'No se pudo generar codigo de emparejamiento. Escanea el QR manualmente.', pairingCode: null });
    }
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ---- EMAIL CONFIG ----
router.post('/email/config', (req, res) => {
  try {
    var user = req.body.user;
    var pass = req.body.pass;
    if (user) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_user', ?)").run(user);
    if (pass !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_pass', ?)").run(pass);
    // Actualizar variables globales para IMAP
    if (user) gmailUser = user;
    if (pass !== undefined) gmailPass = pass;
    res.json({ ok: true, message: 'Configuracion de correo guardada' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/email/logout', (req, res) => {
  try {
    db.prepare("DELETE FROM settings WHERE key IN ('gmail_user', 'gmail_pass')").run();
    gmailUser = '';
    gmailPass = '';
    console.log('[Email] Sesion de Gmail eliminada');
    res.json({ ok: true, message: 'Sesion de correo eliminada' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.get('/email/config', (req, res) => {
  try {
    var user = db.prepare("SELECT value FROM settings WHERE key='gmail_user'").get()?.value || '';
    var pass = db.prepare("SELECT value FROM settings WHERE key='gmail_pass'").get()?.value ? '********' : '';
    res.json({ user, passConfigured: !!pass });
  } catch(e) { res.json({ user: '', passConfigured: false }); }
});

// ---- BAILEYS WHATSAPP INTEGRATION ----
router.get('/baileys-qr', async (req, res) => {
  try {
    var wa = require('../wa-baileys');
    var status = wa.getStatus();
    var qrDataUrl = await wa.getQRDataURL();
    res.json({ status: status, qr: qrDataUrl, error: status.error });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// Endpoint to serve the QR image directly
router.get('/baileys-qr-image', async (req, res) => {
  try {
    var wa = require('../wa-baileys');
    var qrDataUrl = await wa.getQRDataURL();
    if (qrDataUrl) {
      var base64 = qrDataUrl.split(',')[1];
      var img = Buffer.from(base64, 'base64');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
      res.end(img);
    } else {
      res.status(404).send('QR not available');
    }
  } catch(e) {
    res.status(500).send(e.message);
  }
});

// ---- EMAIL HISTORY ----
router.get('/email/history', (req, res) => {
  try {
    var limit = parseInt(req.query.limit) || 50;
    var rows = db.prepare("SELECT * FROM pending_messages WHERE category='email' ORDER BY created_at DESC LIMIT ?").all(limit);
    res.json({ emails: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- WHATSAPP CHAT HISTORY ----
router.get('/whatsapp/profile-pic/:jid', async (req, res) => {
  try {
    var wa = require('../wa-baileys');
    var url = await wa.getProfilePicture(decodeURIComponent(req.params.jid));
    res.json({ url: url });
  } catch(e) { res.json({ url: null }); }
});

router.get('/whatsapp/chats', async (req, res) => {
  try {
    var wa = require('../wa-baileys');
    var result = await wa.getChats();
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/whatsapp/chat/:jid/messages', async (req, res) => {
  try {
    var wa = require('../wa-baileys');
    var count = parseInt(req.query.count) || 30;
    var result = await wa.getChatMessages(decodeURIComponent(req.params.jid), count);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp/send', async (req, res) => {
  try {
    var jid = req.body.jid;
    var text = req.body.text;
    var asAudio = req.body.asAudio || false;
    if (!jid || !text) return res.status(400).json({ error: 'jid y text requeridos' });
    
    var wa = require('../wa-baileys');
    var opts = {};
    
    if (asAudio) {
      try {
        var audioBuf = await new Promise(function(resolve) {
          var httpLib = require('https');
          var googleUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=' + encodeURIComponent(text.substring(0, 200));
          httpLib.get(googleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function(resp) {
            var chunks = [];
            resp.on('data', function(c) { chunks.push(c); });
            resp.on('end', function() {
              var buf = Buffer.concat(chunks);
              resolve(buf.length > 1000 ? buf : null);
            });
          }).on('error', function() { resolve(null); });
        });
        if (audioBuf) {
          opts.asAudio = true;
          var result = await wa.sendMessage(jid, { audioBuffer: audioBuf, mimeType: 'audio/mp3', text: text }, opts);
          return res.json(result);
        }
      } catch(e) { console.error('[Audio] TTS error:', e.message); }
    }
    
    if (!asAudio) {
      var result = await wa.sendMessage(jid, text, opts);
      return res.json(result);
    }
    res.json({ ok: false, error: 'No se pudo generar audio' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- CÓDIGO: EJECUTAR ACCIONES EN EL CRM ----
var codeExecHistory = [];

async function executeCodeTask(task, modelId) {
  var systemPrompt = 'Eres un agente de código que ejecuta cambios en un CRM Node.js/Express/SQLite en /opt/render/project/src. ' +
    'Genera una lista de ACCIONES en JSON:\n' +
    '{"actions":[\n' +
    '  {"type":"sql","query":"SQL..."},\n' +
    '  {"type":"read","path":"ruta"},\n' +
    '  {"type":"write","path":"ruta","content":"..."},\n' +
    '  {"type":"exec_node","code":"Node.js..."},\n' +
    '  {"type":"deploy"}\n' +
    ']}\nResponde SOLO con el JSON, sin explicaciones.';
  
  var llmResponse = await callLLM(systemPrompt, 'PETICIÓN:\n' + task, 0.3, modelId);
  var jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, error: 'No se pudo generar plan', raw: llmResponse };
  
  var plan = JSON.parse(jsonMatch[0]);
  if (!plan.actions || !Array.isArray(plan.actions)) return { ok: false, error: 'Plan sin acciones', raw: llmResponse };
  
  var results = [];
  var hasError = false;
  var projectRoot = process.env.RENDER_PROJECT_ROOT || '/opt/render/project/src';
  try { if (!process.env.RENDER) projectRoot = require('path').join(__dirname, '..'); } catch(e) {}
  
  for (var i = 0; i < plan.actions.length; i++) {
    var action = plan.actions[i];
    if (hasError && action.type !== 'deploy') { results.push({ action: i, type: action.type, status: 'skipped' }); continue; }
    try {
      if (action.type === 'sql') {
        var d = require('../database').db.prepare(action.query);
        var data = d.all ? d.all() : { changes: d.run().changes };
        results.push({ action: i, type: 'sql', status: 'ok', data: data && data.length > 5 ? data.slice(0, 5) : data });
      } else if (action.type === 'read') {
        var fs = require('fs');
        var fp = require('path').join(projectRoot, action.path);
        if (!fs.existsSync(fp)) throw new Error('No encontrado: ' + action.path);
        results.push({ action: i, type: 'read', status: 'ok', path: action.path, content: fs.readFileSync(fp, 'utf8').substring(0, 3000) });
      } else if (action.type === 'write') {
        var fs = require('fs');
        var fp = require('path').join(projectRoot, action.path);
        if (fp.indexOf(projectRoot) !== 0) throw new Error('Ruta no permitida');
        if (fs.existsSync(fp)) fs.copyFileSync(fp, fp + '.bak');
        fs.writeFileSync(fp, action.content, 'utf8');
        results.push({ action: i, type: 'write', status: 'ok', path: action.path });
      } else if (action.type === 'exec_node') {
        var vm = require('vm');
        var ctx = vm.createContext({ db: require('../database').db, require: require, console: console, __dirname: projectRoot, result: null, JSON: JSON, process: process });
        vm.runInContext('result = (function(){ ' + action.code + ' })()', ctx, { timeout: 10000 });
        results.push({ action: i, type: 'exec_node', status: 'ok', result: String(ctx.result || '') });
      } else if (action.type === 'deploy') {
        var https = require('https');
        await new Promise(function(ok) {
          var r = https.request('https://api.render.com/deploy/srv-d87dr3mq1p3s73b3a680?key=5k-d_2_3YAs', { method: 'POST' }, function(resp) { resp.on('data',function(){}); resp.on('end', ok); });
          r.on('error', ok); r.end();
        });
        results.push({ action: i, type: 'deploy', status: 'triggered' });
      } else results.push({ action: i, type: action.type, status: 'unknown' });
    } catch(e) { hasError = true; results.push({ action: i, type: action.type, status: 'error', error: e.message }); }
  }
  
  codeExecHistory.push({ task: task, plan: plan, results: results, time: new Date().toISOString() });
  if (codeExecHistory.length > 50) codeExecHistory.shift();
  return { ok: true, plan: plan, results: results };
}

router.post('/code/execute', async (req, res) => {
  var task = (req.body.task || '').trim();
  if (!task) return res.status(400).json({ error: 'Task requerida' });
  var modelId = req.body.model || getUserModel();
  try {
    var result = await executeCodeTask(task, modelId);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/code/history', (req, res) => {
  res.json({ history: codeExecHistory.slice(-20) });
});

// Debug: mostrar el JS del template
router.get('/debug-js', (req, res) => {
  if (!req.session.user) return res.status(401).send('No auth');
  var fs = require('fs');
  var html = fs.readFileSync(require('path').join(__dirname, '..', 'views', 'codeopen.ejs'), 'utf8');
  // Extraer solo el script
  var m = html.match(/<script>([\s\S]*?)<\/script>/);
  res.type('text/plain').send('window.onerror = function(m,f,l){alert("JS ERROR: "+m+" at "+f+":"+l);};\n' + (m ? m[1].trim() : 'NO SCRIPT'));
});

// Buscar cliente por telefono o nombre en API Likes
router.get('/client-info/:phone', async (req, res) => {
  try {
    var phone = req.params.phone.replace(/[^0-9]/g, '');
    var name = (req.query.name || '').trim();
    
    // Buscar en DB local primero
    if (phone.length >= 9) {
      var local = db.prepare("SELECT id, nombre, dni_nif, likes_customer_id FROM clients WHERE telefono LIKE ? OR telefono2 LIKE ?").all('%' + phone + '%', '%' + phone + '%');
      if (local.length > 0) {
        return res.json({ found: true, fiscalId: local[0].dni_nif || local[0].likes_customer_id, nombre: local[0].nombre, source: 'local' });
      }
    }
    
    // Buscar en DB local por nombre (para contactos LID sin telefono)
    if (name) {
      var localByName = db.prepare("SELECT id, nombre, dni_nif, likes_customer_id, telefono FROM clients WHERE nombre LIKE ? OR apellidos LIKE ?").all('%' + name + '%', '%' + name + '%');
      if (localByName.length > 0) {
        return res.json({ found: true, fiscalId: localByName[0].dni_nif || localByName[0].likes_customer_id, nombre: localByName[0].nombre, source: 'local_name' });
      }
    }
    
    // Buscar por ultimos 9 digitos del LID (pueden coincidir con telefono)
    if (phone.length > 11) {
      var lastDigits = phone.slice(-9);
      var localByLast = db.prepare("SELECT id, nombre, dni_nif, likes_customer_id, telefono FROM clients WHERE telefono LIKE ? OR telefono2 LIKE ?").all('%' + lastDigits + '%', '%' + lastDigits + '%');
      if (localByLast.length > 0) {
        return res.json({ found: true, fiscalId: localByLast[0].dni_nif || localByLast[0].likes_customer_id, nombre: localByLast[0].nombre, source: 'local_lid' });
      }
    }
    
    // Buscar en API Likes
    try {
      var LikesAPI = require('../likes-api');
      var api = LikesAPI.getApiInstance();
      var customers = await api.getCustomers();
      if (Array.isArray(customers)) {
        for (var c of customers) {
          if (phone.length >= 9) {
            var cPhone = (c.phone || c.mobile || c.telefono || '').replace(/[^0-9]/g, '');
            if (cPhone && (cPhone.includes(phone) || phone.includes(cPhone))) {
              return res.json({ found: true, fiscalId: c.fiscalId || c.dni || '', nombre: c.name || '', source: 'api' });
            }
          }
          // Buscar por nombre tambien
          if (name) {
            var cName = (c.name || '').toLowerCase();
            if (cName && (cName.includes(name.toLowerCase()) || name.toLowerCase().includes(cName))) {
              return res.json({ found: true, fiscalId: c.fiscalId || c.dni || '', nombre: c.name || '', source: 'api_name' });
            }
          }
        }
      }
    } catch(e) {}
    
    res.json({ found: false });
  } catch(e) { res.json({ found: false }); }
});

// ACCIONES AUTOMATICAS para CodeOpen
// Bloquear linea por perdida/robo
router.post('/accion/bloquear-linea', async (req, res) => {
  try {
    var { telefono, fiscalId } = req.body;
    if (!telefono && !fiscalId) return res.json({ ok: false, error: 'Se requiere teléfono o ID fiscal' });
    var LikesAPI = require('../likes-api');
    var api = LikesAPI.getApiInstance();
    // Buscar lineas del cliente
    var lineas = [];
    if (fiscalId) {
      var subs = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fiscalId) + '&brand_id=' + (api.brandId || '264'));
      var items = Array.isArray(subs) ? subs : (subs.data || subs.subscriptions || []);
      items.forEach(function(s) {
        var prods = s.products || (s.productName ? [s] : []);
        prods.forEach(function(p) { if (p.fixedNumber || p.lineNumber) lineas.push(p.fixedNumber || p.lineNumber); });
      });
    } else if (telefono) {
      lineas.push(telefono);
    }
    // Quitar duplicados
    lineas = lineas.filter(function(l, i) { return lineas.indexOf(l) === i; });
    if (lineas.length === 0) return res.json({ ok: false, error: 'No se encontraron líneas para bloquear' });
    // Bloquear todas las líneas
    var results = [];
    for (var i = 0; i < lineas.length; i++) {
      try {
        var r = await api.blockLine(lineas[i], true);
        results.push({ linea: lineas[i], ok: true });
      } catch(e) { results.push({ linea: lineas[i], ok: false, error: e.message }); }
    }
    var bloqueadas = results.filter(function(r) { return r.ok; }).length;
    res.json({ ok: true, mensaje: bloqueadas + '/' + lineas.length + ' líneas bloqueadas', results: results });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Consultar cobertura para una direccion
router.post('/accion/cobertura', async (req, res) => {
  try {
    var { direccion } = req.body;
    if (!direccion) return res.json({ ok: false, error: 'Se requiere dirección' });
    var LikesAPI = require('../likes-api');
    var api = LikesAPI.getApiInstance();
    var result = await api.checkCoverage(direccion);
    res.json({ ok: true, data: result });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Cambiar tarifa
router.post('/accion/cambiar-tarifa', async (req, res) => {
  try {
    var { linea, nuevoProducto } = req.body;
    if (!linea || !nuevoProducto) return res.json({ ok: false, error: 'Se requiere línea y nuevo producto' });
    var LikesAPI = require('../likes-api');
    var api = LikesAPI.getApiInstance();
    var result = await api.changeProduct({ lineNumber: linea, newProductId: nuevoProducto });
    res.json({ ok: true, data: result, mensaje: 'Cambio de tarifa solicitado para ' + linea });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Endpoint para guardar settings (drive key, etc)
router.post('/save-setting', (req, res) => {
  try {
    var { key, value } = req.body;
    if (!key) return res.json({ ok: false, error: 'Se requiere key' });
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

module.exports = router;
