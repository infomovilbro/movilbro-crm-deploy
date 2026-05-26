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
require('dotenv').config();
process.env.TZ = 'Europe/Madrid';

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
global.getToday = () => fmtDate(new Date());
global.getYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmtDate(d); };
global.getTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fmtDate(d); };

const { initDatabase, db } = require('./database');
const { loadSettings } = require('./middleware/settings-loader');
const { loadUserPermissions } = require('./middleware/auth');
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
const usersRoutes = require('./routes/users');
const paymentsRoutes = require('./routes/payments');
const remittancesRoutes = require('./routes/remittances');
const resourcesRoutes = require('./routes/resources');
const massiveRoutes = require('./routes/massive-processes');
const tiendaRoutes = require('./routes/tienda');
const apiProxyRoutes = require('./routes/api-proxy');
const externalApiRoutes = require('./routes/external-api');
const { router: backupRouter, sendBackup } = require('./routes/backup');
const { router: telegramBotRouter, notifyServerStart, sendDailySummary, registerBotCommands } = require('./routes/telegram-bot');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

initDatabase();

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
      scriptSrc: ["'self'", "cdn.jsdelivr.net", "code.jquery.com", "'unsafe-inline'"],
      styleSrc: ["'self'", "cdn.jsdelivr.net", "fonts.googleapis.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "cdn.jsdelivr.net", "fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'same-origin' }
}));

// 2. CORS - Restringir orígenes permitidos (evita robo de datos cross-origin)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://movilbro-crm.onrender.com,https://movilbro-pro-web-2026.web.app').split(',').map(s => s.trim());
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

// 5. Sesión segura
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

// ---- LIKES TELECOM ROUTES ----
app.use('/altas', altasRoutes);
app.use('/kpis', kpiRoutes);
app.use('/customers', clientRoutes);
app.use('/clientes', clientRoutes);
app.use('/products', productRoutes);
app.use('/productos', productRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/suscripciones', subscriptionRoutes);
app.use('/tickets', ticketRoutes);
app.use('/invoices', billingRoutes);
app.use('/facturacion', billingRoutes);
app.use('/payments', paymentsRoutes);
app.use('/remittances', remittancesRoutes);
app.use('/orders', orderRoutes);
app.use('/ordenes', orderRoutes);
app.use('/coverage', coverageRoutes);
app.use('/cobertura', coverageRoutes);
app.use('/settings', settingsRoutes);
app.use('/configuracion', settingsRoutes);
app.use('/whatsapp', whatsappRoutes);
app.use('/email', emailRoutes);
app.use('/correo', emailRoutes);
app.use('/stripe', stripeRoutes);
app.use('/backup', backupRouter);
app.use('/telegram', telegramBotRouter);
app.use('/proxy', proxyRoutes);
app.use('/api', apiRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/analitica', analyticsRoutes);
app.use('/history', historyRoutes);
app.use('/historial', historyRoutes);

// ---- TIENDA ----
app.use('/tienda', tiendaRoutes);
app.use('/store', tiendaRoutes);

// ---- AI CHAT ----
const chatRoutes = require('./routes/chat')(db);
app.use('/api/chat', chatRoutes);

// ---- NEW LIKES TELECOM PAGES ----
app.use('/aftersales', aftersalesRoutes);
app.use('/massive-processes', massiveRoutes);
app.use('/surveys', surveysRoutes);
app.use('/leads', leadsRoutes);
app.use('/channel', channelRoutes);
app.use('/users', usersRoutes);
app.use('/resources', resourcesRoutes);

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
  } catch (e) {}
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

const server = app.listen(PORT, () => {
  console.log(`CRM Movilbro iniciado en puerto ${PORT} (${isProd ? 'produccion' : 'desarrollo'})`);
  setTimeout(() => notifyServerStart(), 3000);
  setTimeout(() => registerBotCommands(), 5000);
});

// ---- BACKUP + RESUMEN DIARIO a Telegram a las 22:00 (cierre de tienda) ----
cron.schedule('0 22 * * *', () => {
  console.log('[Backup] Ejecutando backup diario a Telegram...');
  sendBackup().then(r => {
    console.log('[Backup] Resultado:', r.success ? 'OK' : 'ERROR: ' + (r.error || 'desconocido'));
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

// ---- AUTO KEEP-AWAKE - Evita que Render duerma el servidor ----
// Ping a localhost (interno) + a la URL externa de Render si está disponible
const SELF_PING_URL = `http://localhost:${PORT}/health`;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || process.env.EXTERNAL_URL || null;
const KEEP_AWAKE_INTERVAL = 4 * 60 * 1000; // cada 4 minutos (Render requiere actividad cada 15)

function selfPing() {
  const now = new Date().toISOString().slice(11, 19);
  // Ping local
  http.get(SELF_PING_URL, (res) => {
    res.resume();
  }).on('error', () => {});
  // Ping externo (Render no duerme si ve tráfico externo)
  if (EXTERNAL_URL) {
    const url = EXTERNAL_URL + '/health';
    var lib = url.indexOf('https:') === 0 ? https : http;
    lib.get(url, (res) => {
      res.resume();
    }).on('error', () => {});
  }
}

setTimeout(selfPing, 5000);
setInterval(selfPing, KEEP_AWAKE_INTERVAL);
console.log(`[KeepAwake] Ping cada ${KEEP_AWAKE_INTERVAL/60000} min (localhost${EXTERNAL_URL ? ' + ' + EXTERNAL_URL : ''})`);

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
