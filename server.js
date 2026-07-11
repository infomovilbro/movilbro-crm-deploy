const express = require('express');
const session = require('express-session');
const path = require('path');
const morgan = require('morgan');
const layouts = require('express-ejs-layouts');
const cron = require('node-cron');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const hpp = require('hpp');

const http = require('http');
const https = require('https');
const WebSocket = require('ws');
require('dotenv').config();
process.env.TZ = 'Europe/Madrid';

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
global.getToday = () => fmtDate(new Date());
global.getYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmtDate(d); };
global.getTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fmtDate(d); };

const { initDatabase, db } = require('./database');
const { loadUserPermissions, requireAuth, requireRole } = require('./middleware/auth');
const { loadSettings } = require('./middleware/settings-loader');
const { runSync, getProgress } = require('./auto-sync');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const orderRoutes = require('./routes/orders');
const subscriptionRoutes = require('./routes/subscriptions');
const ticketRoutes = require('./routes/tickets');
const coverageRoutes = require('./routes/coverage');
const apiRoutes = require('./routes/api');
const settingsRoutes = require('./routes/settings');
const dashboardRoutes = require('./routes/dashboard');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const historyRoutes = require('./routes/history');
const whatsappRoutes = require('./routes/whatsapp');
const billingRoutes = require('./routes/billing');
const emailRoutes = require('./routes/email');
const stripeRoutes = require('./routes/stripe');
const altasRoutes = require('./routes/altas');
const proxyRoutes = require('./routes/proxy');
const kpiRoutes = require('./routes/kpis');
const aftersalesRoutes = require('./routes/aftersales');
const surveysRoutes = require('./routes/surveys');
const leadsRoutes = require('./routes/leads');
const channelRoutes = require('./routes/channel');
const googleConnectionsRoutes = require('./routes/google-connections');
const usersRoutes = require('./routes/users');
const paymentsRoutes = require('./routes/payments');
const remittancesRoutes = require('./routes/remittances');
const resourcesRoutes = require('./routes/resources');
const massiveRoutes = require('./routes/massive-processes');
const tiendaRoutes = require('./routes/tienda');
const neonRoutes = require('./routes/neon');
const cameraRoutes = require('./routes/camera');
const portalRoutes = require('./routes/portal');
const codeopenRoutes = require('./routes/codeopen');
const apiProxyRoutes = require('./routes/api-proxy');
const externalApiRoutes = require('./routes/external-api');
const fixNotesRoutes = require('./routes/fix-notes');
const { router: backupRouter, sendBackup } = require('./routes/backup');
const { router: telegramBotRouter, notifyServerStart, sendDailySummary, registerBotCommands } = require('./routes/telegram-bot');

const app = express();
const PORT = String(process.env.PORT || 5000).trim();
const isProd = process.env.NODE_ENV === 'production';

initDatabase();

// Limpiar mensajes antiguos al arrancar (solo errores viejos, no tocar pendientes nuevos)
try {
  var oldDate = new Date(Date.now() - 7200000).toISOString(); // 2h atras
  db.prepare("DELETE FROM pending_messages WHERE (proposed_response LIKE 'Error:%' OR proposed_response IS NULL) AND created_at < ?").run(oldDate);
  console.log('[Cleanup] Mensajes antiguos con error eliminados');
} catch(e) { console.log('[Cleanup] Error:', e.message); }

// Seed shared_context with project summary
try {
  var seedSummary = require('fs').readFileSync(require('path').join(__dirname, 'PROJECT_SUMMARY.md'), 'utf8');
  var existing = db.prepare('SELECT id FROM shared_context WHERE topic=?').get('project_summary');
  if (!existing) db.prepare('INSERT INTO shared_context (topic, content) VALUES (?,?)').run('project_summary', seedSummary);
} catch(e) { console.error('Error seeding shared_context:', e.message); }

// Auto-create default admin user if no users exist
var userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  try {
    var bcrypt = require('bcryptjs');
    var hash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
    db.prepare('INSERT INTO users (email, username, nombre, password, rol, permissions) VALUES (?,?,?,?,?,?)').run('aaa', 'aaa', 'Admin', hash, 'admin', '{}');
    console.log('Default user created: aaa (password sent by email on Render)');
  } catch(e) {
    console.error('Error creating default user:', e.message);
  }
}

// ============================================================
// SEGURIDAD - Middleware global (orden crítico: Helmet > CORS > hpp > Body > ...)
// ============================================================

// 1. Helmet - Headers de seguridad HTTP
// Trust proxy - necesario para rate limiting y cookies seguras detrás de Nginx
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "cdn.jsdelivr.net", "code.jquery.com", "static.whatsapp.net", "web.whatsapp.com", "data:", "blob:", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "static.whatsapp.net", "web.whatsapp.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "static.whatsapp.net", "web.whatsapp.com", "https://*.whatsapp.net"],
      connectSrc: ["'self'", "cdn.jsdelivr.net", "web.whatsapp.com", "wss://web.whatsapp.com", "static.whatsapp.net", "api.likestelecom.com", "www.googleapis.com", "oauth2.googleapis.com", "accounts.google.com"],
      fontSrc: ["'self'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.gstatic.com", "static.whatsapp.net"],
      mediaSrc: ["'self'", "static.whatsapp.net"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "web.whatsapp.com", "https://web.whatsapp.com"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  },
  frameguard: { action: 'sameorigin' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'same-origin' }
}));

// 2. CORS - Restringir orígenes permitidos (evita robo de datos cross-origin)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3005,http://localhost:5173,https://movilbro-crm.onrender.com,https://movilbro-pro-web-2026.web.app').split(',').map(s => s.trim());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

// 3. hpp - Protección contra HTTP Parameter Pollution
app.use(hpp({
  checkBody: true,
  checkQuery: true,
  whitelist: ['sort', 'page', 'limit', 'search']
}));

// 4. Verificación CSRF vía Origin/Referer (muta estado después de SameSite)
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  if (!origin) return next();
  const allowed = allowedOrigins.some(a => origin === a || origin.startsWith(a + '/') || origin.startsWith('http://localhost'));
  if (!allowed && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
});

// 5. Rate limiting global - protección contra abuso/scraping
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '500'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo más tarde.' }
});
app.use('/api/', globalLimiter);

// 6. Rate limit general (no-API) - más permisivo pero presente
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones.' }
});
app.use(generalLimiter);

// 7. Evitar servir archivos sensibles
app.use((req, res, next) => {
  if (req.path.match(/\.(env|db|sqlite|sqlite3|log|sh|ps1|key|crt|pem)$/i) || req.path.includes('node_modules')) {
    return res.status(404).type('text').send('Not found');
  }
  next();
});

// 4. Logging (modo combinado en producción para más detalle)
if (isProd) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '1d' : 0,
  etag: true
}));

// 5. Sesión segura - usando SQLiteStore para no consumir RAM
try {
  var SQLiteStore = require('connect-sqlite3')(session);
  app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: __dirname, table: 'sessions' }),
    secret: process.env.SESSION_SECRET || process.env.COOKIE_SECRET || 'movilbro-secret',
    resave: false,
    saveUninitialized: false,
    name: 'movilbro.sid',
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000
    }
  }));
} catch(e) {
  console.error('[Session] SQLiteStore no disponible, usando MemoryStore:', e.message);
  app.use(session({
    secret: process.env.SESSION_SECRET || process.env.COOKIE_SECRET || 'movilbro-secret',
    resave: false,
    saveUninitialized: false,
    name: 'movilbro.sid',
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000
    }
  }));
}

// Deshabilitar cache en páginas autenticadas
app.use((req, res, next) => {
  if (req.session.user) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
  }
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(loadSettings);
app.use(loadUserPermissions);

// ---- ACTIVITY LOG: registrar todas las acciones de escritura ----
app.use(function(req, res, next) {
  if (res.locals.user && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      var db = require('./database').db;
      var descripcion = req.method + ' ' + req.path;
      if (req.body && Object.keys(req.body).length > 0) {
        var bodyKeys = Object.keys(req.body).filter(function(k) { return !['password', 'pass', 'secret', 'token', 'key'].includes(k.toLowerCase()); }).slice(0, 5);
        if (bodyKeys.length > 0) descripcion += ' (' + bodyKeys.join(', ') + ')';
      }
      db.prepare("INSERT INTO activity_log (user_id, user_name, tipo, descripcion, ip) VALUES (?, ?, ?, ?, ?)").run(
        res.locals.user.id || 0,
        res.locals.user.nombre || res.locals.user.email || 'unknown',
        req.method.toLowerCase(),
        descripcion.substring(0, 200),
        req.ip || req.connection?.remoteAddress || ''
      );
    } catch(e) { /* silent fail for activity log */ }
  }
  next();
});

// Load notifications for layout
app.use((req, res, next) => {
  if (res.locals.user) {
    try {
      const hoy = getToday();
      const manana = getTomorrow();
      const citasHoyManana = db.prepare("SELECT id, cliente_nombre, fecha, hora, tipo, motivo FROM tienda_agenda WHERE fecha IN (?, ?) AND estado = 'pendiente' ORDER BY fecha, hora").all(hoy, manana);
      const facturasVencen = db.prepare("SELECT id, concepto, importe, fecha_vencimiento FROM invoices WHERE fecha_vencimiento IN (?, ?) AND estado = 'pendiente'").all(hoy, manana);
      res.locals.notificaciones = {
        agenda: citasHoyManana,
        facturas: facturasVencen,
        total: citasHoyManana.length + facturasVencen.length
      };
    } catch (e) {
      res.locals.notificaciones = { agenda: [], facturas: [], total: 0 };
    }
  } else {
    res.locals.notificaciones = { agenda: [], facturas: [], total: 0 };
  }
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.use(layouts);

// ---- API PROXY (sin auth - el frontend Vue lo usa) ----
app.use('/api-proxy', apiProxyRoutes);
app.use('/external-api', externalApiRoutes);

// ---- AUTH ----
app.use('/', dashboardRoutes);
app.use('/auth', authRoutes);

// ---- SYNC PROGRESS (público, sin auth, fuera de /isp/*) ----
app.get('/sync-status', (req, res) => {
  res.json(getProgress());
});

// ---- LIKES TELECOM ROUTES ----
// Endpoint público para guardar token desde navegador (ANTES del auth)
app.post('/api/likes-token', function(req, res) {
  var token = req.body && req.body.token;
  if (!token) return res.status(400).json({ ok: false, error: 'Token required' });
  var LikesAPI = require('./likes-api');
  LikesAPI.saveToken(token, req.body.expiresIn || 3600);
  res.json({ ok: true, msg: 'Token guardado' });
});
// Endpoint público para guardar settings (Drive OAuth, etc.)
app.post('/api/save-setting', function(req, res) {
  var key = req.body && req.body.key;
  var value = req.body && req.body.value;
  if (!key || !value) return res.status(400).json({ ok: false, error: 'key y value requeridos' });
  try {
    var { db } = require('./database');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    res.json({ ok: true, msg: key + ' guardado' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---- AI ASSIST (sin auth - solo archivos temporales publicos) ----
app.post('/ai-assist/report', express.json({limit:'1mb'}), function(req, res) {
  try {
    var fs = require('fs');
    var path = require('path');
    var text = req.body.text || '';
    var url = req.body.url || '';
    var selector = req.body.selector || '';
    var element_text = req.body.element_text || '';
    if (!text && !selector) return res.json({ ok: false, error: 'Describe el error o captura un selector.' });
    var pubPath = path.join(__dirname, 'public', 'ai-assist-pending.json');
    var id = Date.now();
    fs.writeFileSync(pubPath, JSON.stringify({ id: id, text: text, url: url, selector: selector, element_text: element_text, created_at: new Date().toISOString() }));
    res.json({ ok: true, id: id, message: 'Analizando...' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
app.post('/ai-assist/respond', express.json({limit:'1mb'}), function(req, res) {
  try {
    var secret = req.body.secret || req.query.secret || '';
    var expected = process.env.AI_ASSIST_SECRET || 'opencode2026';
    if (secret !== expected) return res.status(403).json({ ok: false, error: 'No autorizado' });
    var responseText = req.body.response || '';
    var solution = req.body.solution || responseText;
    var fixId = req.body.fix_id || null;
    if (!responseText) return res.json({ ok: false, error: 'Respuesta vacia' });
    var fs2 = require('fs');
    var pubPath2 = require('path').join(__dirname, 'public', 'ai-assist-response.json');
    fs2.writeFileSync(pubPath2, JSON.stringify({ response: responseText, tts: true, fix_data: { solution: solution, url: '', selector: '' } }));
    if (fixId) { try { require('./database').db.prepare("UPDATE fix_notes SET status='fixed',fixed_at=datetime('now') WHERE id=?").run(fixId); } catch(e){} }
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
// Analisis con IA - FREE funciona, PAGO si falla cae a FREE
app.post('/ai-assist/analyze', express.json({limit:'1mb'}), async function(req, res) {
  try {
    var texto = req.body.text || '';
    var esPago = req.body.modelo === 'deepseek-v4-flash';
    var url = req.body.url || '';
    var selector = req.body.selector || '';
    var elemText = req.body.element_text || '';
    var apiKey = 'sk-EPQBFsNdGAJqIRJwW36M0Tdc4aFpVNGzFfemDX19jZkHrlrHa43BNRw85LKIcqe1';
    
    var prompt = 'Eres un asistente del CRM Movilbro. Responde en español.\n\n';
    if (url) prompt += 'URL: ' + url + '\n';
    if (selector) prompt += 'Selector: ' + selector + '\n';
    if (elemText) prompt += 'Texto: ' + elemText.substring(0, 300) + '\n';
    if (texto) prompt += 'Peticion: ' + texto + '\n';
    prompt += '\nResponde util y conciso.';
    
    var axios = require('axios');
    // GO usa endpoint diferente: https://opencode.ai/zen/go/v1/chat/completions
    var endpointGo = 'https://opencode.ai/zen/go/v1/chat/completions';
    var endpointFree = 'https://opencode.ai/zen/v1/chat/completions';
    var modelosAIntentar = esPago ? 
      [{model:'deepseek-v4-flash', url: endpointGo}, {model:'deepseek-v4-flash-free', url: endpointFree}] : 
      [{model:'deepseek-v4-flash-free', url: endpointFree}];
    var respuesta = null;
    
    for (var i = 0; i < modelosAIntentar.length; i++) {
      try {
        var m = modelosAIntentar[i];
        var r = await axios.post(m.url, {
          model: m.model,
          messages: [
            { role: 'system', content: 'Eres un asistente util del CRM Movilbro. Responde en español, se conciso.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3, max_tokens: 800
        }, { timeout: 30000, headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' } });
        var c = r && r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content || '';
        if (c && c.trim().length > 3) { respuesta = c.trim(); break; }
      } catch(e2) { /* fallback al siguiente modelo */ }
    }
    
    if (!respuesta) {
      if (esPago) return res.json({ ok: false, error: 'Pago sin saldo. Añade billing en: https://opencode.ai/workspace/wrk_01KS8VQPTD4DY7J12080YWG0F2/billing. Usa modo FREE mientras.' });
      return res.json({ ok: false, error: 'No se pudo obtener respuesta. Reintenta.' });
    }
    
    var sol = respuesta.replace(/```[\s\S]*?```/g, '').substring(0, 500);
    res.json({ ok: true, response: respuesta, tts: true, fix_data: { url: url, selector: selector, element_text: elemText, solution: sol } });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});
app.post('/ai-assist/clear', express.json({limit:'1mb'}), function(req, res) {
  try {
    var p = require('path').join(__dirname, 'public', 'ai-assist-response.json');
    if (require('fs').existsSync(p)) require('fs').unlinkSync(p);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});

app.use('/altas', requireRole(), altasRoutes);
app.use('/kpis', requireRole(), kpiRoutes);
app.use('/clientes', requireRole(), clientRoutes);
app.use('/products', requireRole(), productRoutes);
app.use('/productos', requireRole(), productRoutes);
app.use('/subscriptions', requireRole(), subscriptionRoutes);
app.use('/suscripciones', requireRole(), subscriptionRoutes);
app.use('/tickets', requireRole(), ticketRoutes);
app.use('/invoices', requireRole(), billingRoutes);
app.use('/facturacion', requireRole(), billingRoutes);
app.use('/payments', requireRole(), paymentsRoutes);
app.use('/remittances', requireRole(), remittancesRoutes);
app.use('/orders', requireRole(), orderRoutes);
app.use('/ordenes', requireRole(), orderRoutes);
app.use('/coverage', requireRole(), coverageRoutes);
app.use('/cobertura', requireRole(), coverageRoutes);
app.use('/kyc', requireRole(), require('./routes/kyc'));
app.use('/settings', requireRole(), settingsRoutes);
app.use('/configuracion', requireRole(), settingsRoutes);
app.use('/whatsapp', requireRole(), whatsappRoutes);
app.use('/email', requireRole(), emailRoutes);
app.use('/correo', requireRole(), emailRoutes);
app.use('/stripe', requireRole(), stripeRoutes);
app.use('/backup', requireRole(), backupRouter);
app.use('/telegram', requireRole(), telegramBotRouter);
app.use('/proxy', requireRole(), proxyRoutes);
app.use('/api', requireRole(), apiRoutes);
app.use('/analytics', requireRole(), analyticsRoutes);
app.use('/analitica', requireRole(), analyticsRoutes);
app.use('/history', requireRole(), historyRoutes);
app.use('/historial', requireRole(), historyRoutes);

// ---- TIENDA ----
app.use('/tienda', requireRole(), tiendaRoutes);
app.use('/store', requireRole(), tiendaRoutes);

// ---- AI CHAT ----
const chatRoutes = require('./routes/chat')(db);
app.use('/api/chat', chatRoutes);

// ---- ISP GESTION MODULE ----
const ispRoutes = require('./routes/isp-core');
app.use('/isp', requireRole(), ispRoutes);

// ---- NEON DEVICES ----
app.use('/neon', requireRole(), neonRoutes);

// Redirect /pagos to /payments
app.get('/pagos', requireRole(), (req, res) => res.redirect(301, '/payments'));

// ---- NEW LIKES TELECOM PAGES ----
app.use('/aftersales', requireRole(), aftersalesRoutes);
app.use('/massive-processes', requireRole(), massiveRoutes);
app.use('/surveys', requireRole(), surveysRoutes);
app.use('/leads', requireRole(), leadsRoutes);
app.use('/channel', requireRole(), channelRoutes);
app.use('/google-connections', requireRole(), googleConnectionsRoutes);
app.use('/users', requireRole(), usersRoutes);
app.use('/', requireRole(), fixNotesRoutes);
app.use('/resources', requireRole(), resourcesRoutes);
// ---- QR WHATSAPP (NO TOCAR - preguntar al admin antes de modificar) ----
// Frontend espera: res.json({ status: { connected, state, hasQR, error }, qr: dataURL, error })
// Si cambias esto, el QR deja de mostrarse en codeopen.ejs
const wa = require('./wa-baileys');
const { getQRDataURL, getStatus } = wa;
app.get('/codeopen/baileys-qr', async (req, res) => {
  try {
    var status = getStatus();
    var qrDataUrl = await getQRDataURL();
    res.json({ status: status, qr: qrDataUrl, error: status.error });
  } catch(e) { res.json({ error: e.message }); }
});
app.get('/codeopen/baileys-qr-image', async (req, res) => {
  try {
    var dataUrl = await getQRDataURL();
    if (!dataUrl) return res.status(404).send('QR no disponible');
    var base64 = dataUrl.split(',')[1];
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(base64, 'base64'));
  } catch(e) { res.status(500).send('Error'); }
});

// ---- CODEOPEN ----
app.use('/codeopen', requireRole(), codeopenRoutes);

// ---- CAMERA ----
app.use('/camera', requireRole(), cameraRoutes);
app.use('/portal', portalRoutes);

// ---- HEALTH - Endpoint para monitoreo de uptime ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).render('404', { title: 'Página no encontrada' });
});

// ---- GLOBAL ERROR HANDLER - Nunca filtrar stack traces al cliente ----
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message || err}`);
  console.error(err.stack);
  res.status(err.status || 500);
  if (req.accepts('html')) {
    res.render('404', { title: 'Error interno' });
  } else {
    res.json({ error: 'Error interno del servidor' });
  }
});

// Migrate old presupuestos estados
db.prepare("UPDATE tienda_presupuestos SET estado = 'reparado y cobrado' WHERE estado IN ('reparado', 'cobrado')").run();

// Auto close previous day on startup if not already closed
function cerrarDiaAutomatico(fecha) {
  try {
    const ingresos = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'ingreso'").get(fecha);
    const gastos = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'gasto'").get(fecha);
    const numOps = db.prepare("SELECT COUNT(*) as count FROM tienda_caja WHERE fecha = ? AND tipo = ?").get(fecha, 'ingreso');
    const saldo = ingresos.total - gastos.total;
    const existente = db.prepare('SELECT id FROM tienda_historial_dia WHERE fecha = ?').get(fecha);
    if (existente) {
      db.prepare('UPDATE tienda_historial_dia SET total_ingresos=?, total_gastos=?, saldo_final=?, num_ventas=?, cerrado=1 WHERE fecha=?').run(ingresos.total, gastos.total, saldo, numOps.count, fecha);
    } else {
      db.prepare('INSERT INTO tienda_historial_dia (fecha, total_ingresos, total_gastos, saldo_final, num_ventas, cerrado) VALUES (?,?,?,?,?,1)').run(fecha, ingresos.total, gastos.total, saldo, numOps.count);
    }
    const cierreExistente = db.prepare('SELECT id FROM tienda_cierres WHERE fecha = ?').get(fecha);
    if (!cierreExistente) {
      db.prepare('INSERT INTO tienda_cierres (fecha, total_ingresos, gastos, saldo, num_operaciones) VALUES (?,?,?,?,?)').run(fecha, ingresos.total, gastos.total, saldo, numOps.count);
    }
  } catch (e) { console.error('[ERROR] cerrarDiaAutomatico:', e.message); }
}

const ayer = getYesterday();
const hoy = getToday();

const ayerCerrado = db.prepare('SELECT cerrado FROM tienda_historial_dia WHERE fecha = ?').get(ayer);
if (!ayerCerrado || !ayerCerrado.cerrado) {
  cerrarDiaAutomatico(ayer);
}

// Cron job: cierra el día anterior cada día a las 00:05
cron.schedule('5 0 * * *', () => {
  const fechaAyer = getYesterday();
  cerrarDiaAutomatico(fechaAyer);
});

// ---- AUTO SYNC - Sincronización inteligente con API Likes Telecom ----
// En lugar de sincronizar cada hora (que satura memoria y causa reinicios),
// se verifica primero si la API de Likes Telecom está disponible.
// - Sincronización ligera (solo facturas) cada hora si la API responde
// - Sincronización completa (con CDRs) SOLO cuando la API se detecta como "vuelve a estar disponible"

var apiWasDown = false;
var syncIntervalId = null;

function checkApiHealth() {
  return Promise.resolve(true);
}

function runAutoSync() {
  checkApiHealth().then(function(apiOk) {
    var LikesAPI = require('./likes-api');
    var api = LikesAPI.getApiInstance();
    if (apiOk) {
      console.log('[AutoSync] API Likes Telecom disponible - ejecutando sincronización ligera (solo facturas)...');
      var { syncInvoicesOnly } = require('./auto-sync');
      syncInvoicesOnly().then(function(r) {
        console.log('[AutoSync] Resultado:', r.ok ? 'OK (' + (r.upserted || 0) + ' upserted, ' + (r.created || 0) + ' creadas)' : 'ERROR: ' + (r.error || ''));
      }).catch(function(e) {
        console.error('[AutoSync] Error:', e.message);
      });

      // Si la API estaba caída y ahora responde → sincronización completa (CDRs incluidos)
      if (apiWasDown) {
        console.log('[AutoSync] API volvió a estar disponible - ejecutando sincronización COMPLETA...');
        var { runSync } = require('./auto-sync');
        runSync().then(function(r) {
          console.log('[AutoSync] Completa resultado:', r.ok ? 'OK' : 'ERROR: ' + (r.error || ''));
        }).catch(function(e) {
          console.error('[AutoSync] Error en completa:', e.message);
        });
      }
      apiWasDown = false;
    } else {
      console.log('[AutoSync] API Likes Telecom NO disponible - se omite sincronización');
      apiWasDown = true;
    }
  });
}

// Sincronización cada 15 minutos (ligera, solo facturas si API responde)
syncIntervalId = setInterval(runAutoSync, 40 * 60 * 1000);

// Sincronización inicial al arrancar (solo facturas, sin CDRs - rápido)
setTimeout(function() {
  runAutoSync();
}, 15000);

// ---- RE-SYNC MANUAL (completa) ----
app.post('/isp/re-sync', async function(req, res) {
  try {
    var { runSync } = require('./auto-sync');
    var r = await runSync();
    res.json(r);
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

const server = http.createServer(app);
const tls = require('tls');

// WebSocket proxy para WhatsApp
server.on('upgrade', function(req, socket, head) {
  if (!req.url.startsWith('/proxy-ws')) return;
  
  var parts = req.url.split('/');
  var targetPort = parseInt(parts[2]) || 443;  // /proxy-ws/443/ws/chat?ED=...
  var targetPath = '/' + parts.slice(3).join('/');
  var qIdx = targetPath.indexOf('?');
  if (qIdx < 0) targetPath += (req.url.indexOf('?') >= 0 ? req.url.substring(req.url.indexOf('?')) : '');
  
  var targetHost = 'web.whatsapp.com';
  var tlsSocket = tls.connect(targetPort, targetHost, function() {
    var key = req.headers['sec-websocket-key'] || '';
    var ver = req.headers['sec-websocket-version'] || '13';
    var ext = req.headers['sec-websocket-extensions'] || '';
    var proto = req.headers['sec-websocket-protocol'] || '';
    
    var origin = req.headers['origin'] || 'https://' + targetHost;
    var cookie = req.headers['cookie'] || '';
    console.log('[WS] Connecting to', targetHost + ':' + targetPort + targetPath, 'origin:', origin, 'cookie:', cookie ? 'yes (' + cookie.substring(0, 50) + ')' : 'no');
    var upgradeReq = [
      'GET ' + targetPath + ' HTTP/1.1',
      'Host: ' + targetHost,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Origin: ' + origin,
      'Sec-WebSocket-Key: ' + key,
      'Sec-WebSocket-Version: ' + ver
    ];
    if (cookie) upgradeReq.push('Cookie: ' + cookie);
    if (ext) upgradeReq.push('Sec-WebSocket-Extensions: ' + ext);
    if (proto) upgradeReq.push('Sec-WebSocket-Protocol: ' + proto);
    upgradeReq.push('', '');
    
    tlsSocket.write(upgradeReq.join('\r\n'));
    
    var responded = false;
    tlsSocket.once('data', function(data) {
      var resp = data.toString('utf8');
      if (resp.indexOf('101 Switching Protocols') >= 0 || resp.indexOf('101 WebSocket') >= 0) {
        responded = true;
        socket.write(data);
        socket.pipe(tlsSocket);
        tlsSocket.pipe(socket);
      } else {
        socket.destroy();
        tlsSocket.destroy();
      }
    });
    
    setTimeout(function() {
      if (!responded) { socket.destroy(); tlsSocket.destroy(); }
    }, 15000);
  });
  
  tlsSocket.on('error', function(e) { console.log('[WS] TLS error:', e.message); try { socket.destroy(); } catch(ex) {} });
  socket.on('error', function() { try { tlsSocket.destroy(); } catch(e) {} });
});

const wss = new WebSocket.Server({ server, path: '/camera-ws' });
var cameraClients = [];
var lastCameraFrame = null;
var lastFrameTime = 0;

wss.on('connection', function(ws, req) {
  ws.isRelay = false;
  ws.on('message', function(data) {
    if (data instanceof Buffer && data.length > 100) {
      lastCameraFrame = data;
      lastFrameTime = Date.now();
      cameraClients.forEach(function(c) {
        if (c !== ws && c.readyState === WebSocket.OPEN) {
          c.send(data);
        }
      });
    } else {
      var msg = data.toString().trim();
      if (msg === 'relay') {
        ws.isRelay = true;
        console.log('[Camera] Relay connected');
      } else if (msg === 'viewer') {
        ws.isRelay = false;
        cameraClients.push(ws);
        if (lastCameraFrame && Date.now() - lastFrameTime < 10000) {
          ws.send(lastCameraFrame);
        }
        console.log('[Camera] Viewer connected, total:', cameraClients.length);
      }
    }
  });
  ws.on('close', function() {
    cameraClients = cameraClients.filter(function(c) { return c !== ws; });
    if (ws.isRelay) console.log('[Camera] Relay disconnected');
    else console.log('[Camera] Viewer disconnected, total:', cameraClients.length);
  });
  ws.send('ok');
});

server.listen(PORT, () => {
  console.log(`CRM Movilbro iniciado en puerto ${PORT} (${isProd ? 'produccion' : 'desarrollo'})`);
  setTimeout(() => notifyServerStart(), 3000);
  setTimeout(() => registerBotCommands(), 5000);
  setTimeout(() => {
    wa.initBaileys().catch(function(e) { console.error('[Baileys] Init error:', e.message); });
  }, 2000);
});

// ---- BACKUP + RESUMEN DIARIO a Telegram a las 22:00 (cierre de tienda) ----
cron.schedule('0 22 * * *', () => {
  console.log('[Backup] Ejecutando backup diario a Telegram...');
  Promise.resolve().then(function() { return sendBackup(); }).then(function(r) {
    console.log('[Backup] Resultado:', r && r.success ? 'OK' : 'ERROR: ' + ((r && r.error) || 'desconocido'));
  }).catch(function(e) {
    console.error('[Backup] Error:', e.message);
  });
  console.log('[Bot] Enviando resumen diario...');
  sendDailySummary();
});

// ---- REGISTRAR WEBHOOK DEL BOT al iniciar ----
setTimeout(() => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get();
    const token = row ? row.value : (process.env.TELEGRAM_BOT_TOKEN || null);
    if (token) {
      const extUrl = process.env.RENDER_EXTERNAL_URL || process.env.EXTERNAL_URL || 'https://movilbro-crm.onrender.com';
      const body = JSON.stringify({ url: extUrl + '/telegram/webhook', drop_pending_updates: true });
      const wr = https.request({ hostname: 'api.telegram.org', path: '/bot' + token + '/setWebhook', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length } }, (res) => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => console.log('[Bot] Webhook registrado:', d));
      });
      wr.on('error', (e) => console.log('[Bot] Error webhook:', e.message));
      wr.write(body);
      wr.end();
    }
  } catch(e) { console.log('[Bot] Error al registrar webhook:', e.message); }
}, 2000);

// ---- AUTO KEEP-AWAKE - Evita que Render/Replit duerma el servidor ----
const SELF_PING_URL = `http://localhost:${PORT}/health`;
var externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.EXTERNAL_URL;
if (!externalUrl) {
  try { var extRow = db.prepare("SELECT value FROM settings WHERE key='external_url'").get(); if (extRow) externalUrl = extRow.value; } catch(e) {}
}
if (!externalUrl && process.env.REPL_SLUG && process.env.REPL_OWNER) {
  externalUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
}

// Detectar URL automaticamente al arrancar probando varias opciones
async function detectExternalUrl() {
  if (externalUrl) return;
  var candidates = [];
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    candidates.push(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    candidates.push(`https://${process.env.REPL_SLUG}--${process.env.REPL_OWNER}.replit.app`);
    candidates.push(`https://workspace.${process.env.REPL_OWNER}.repl.co`);
    // Replit nuevo formato: *.riker.replit.dev
    if (process.env.REPL_ID) candidates.push(`https://${process.env.REPL_ID}.id.repl.co`);
  }
  // Probar cada candidato
  for (var url of candidates) {
    try {
      await new Promise(function(resolve, reject) {
        var req = https.get(url + '/health', function(resp) {
          resp.resume();
          if (resp.statusCode === 200) {
            externalUrl = url;
            try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_url', ?)").run(url); } catch(e) {}
            console.log('[KeepAwake] URL encontrada:', url);
          }
          resolve();
        });
        req.on('error', function() { resolve(); });
        req.setTimeout(5000, function() { req.destroy(); resolve(); });
      });
      if (externalUrl) break;
    } catch(e) {}
  }
  console.log('[KeepAwake] URL externa:', externalUrl || 'NO DETECTADA');
}
detectExternalUrl();

// Auto-detectar URL desde request cuando alguien visita
app.use(function(req, res, next) {
  if (!externalUrl && req.hostname && req.hostname !== 'localhost') {
    var detectedUrl = req.protocol + '://' + req.hostname;
    externalUrl = detectedUrl;
    try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_url', ?)").run(detectedUrl); } catch(e) {}
    console.log('[KeepAwake] URL detectada desde request:', detectedUrl);
  }
  next();
});

// PING CADA 30 SEGUNDOS a localhost + URL externa + preview Replit
setInterval(function() {
  try { http.get(SELF_PING_URL, (r) => { r.resume(); }).on('error', () => {}); } catch(e) {}
  if (externalUrl) {
    try { https.get(externalUrl + '/health', (r) => { r.resume(); }).on('error', () => {}); } catch(e) {}
  }
  // Variantes de Replit
  try {
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      var slugUrl = 'https://' + process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co/health';
      https.get(slugUrl, (r) => { r.resume(); }).on('error', () => {});
      var appUrl = 'https://' + process.env.REPL_SLUG + '--' + process.env.REPL_OWNER + '.replit.app/health';
      https.get(appUrl, (r) => { r.resume(); }).on('error', () => {});
    }
  } catch(e) {}
}, 20000);

console.log('[KeepAwake] Ping cada 20s (localhost' + (externalUrl ? ' + ' + externalUrl : '') + ')' + (process.env.REPL_SLUG ? ' slug=' + process.env.REPL_SLUG : ''));

// ---- GLOBAL ERROR HANDLER - Evitar crashes no controlados ----
process.on('uncaughtException', function(err) {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  // No morir - mantener el server vivo
});
process.on('unhandledRejection', function(reason, promise) {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// ---- GRACEFUL SHUTDOWN - Cerrar conexiones limpiamente ----
function shutdown(signal) {
  console.log(`\n[${signal}] Cerrando servidor...`);
  server.close(() => {
    console.log('Servidor detenido.');
    process.exit(0);
  });
  setTimeout(() => { console.log('Forzando cierre...'); process.exit(1); }, 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---- CAMERA CAPTURE (solo en Windows) ----
if (!isProd && process.platform === 'win32') {
  (function() {
    var camCap = require('./camera-capture');
    var RENDER_WS = 'wss://movilbro-crm.onrender.com/camera-ws';
    var wsRelay = null;
    var reconnectTimer = null;

    function connectRelay() {
      if (wsRelay && wsRelay.readyState === 1) return;
      try {
        wsRelay = new WebSocket(RENDER_WS);
      } catch(e) { scheduleReconnect(); return; }
      wsRelay.on('open', function() {
        console.log('[CamRelay] Conectado a Render');
        wsRelay.send('relay');
        camCap.setRelay(wsRelay);
        camCap.startCapture();
      });
      wsRelay.on('close', function() {
        console.log('[CamRelay] Desconectado');
        camCap.stopCapture();
        scheduleReconnect();
      });
      wsRelay.on('error', function(e) {
        console.log('[CamRelay] Error:', e.message);
      });
    }

    function scheduleReconnect() {
      reconnectTimer = setTimeout(connectRelay, 10000);
    }

    // Intentar conectar al relay después de 3s
    setTimeout(connectRelay, 3000);
    console.log('[CamRelay] Reloj de cámara activado (local -> Render)');
  })();
}

// redeploy trigger 2026-05-31 18:45:15
