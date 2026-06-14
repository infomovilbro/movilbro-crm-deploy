# Movilbro CRM — Conocimiento Completo del Proyecto

## Reglas ABSOLUTAS del Usuario (obligatorias siempre)

1. **Control remoto con CDP** — Cuando diga "control remoto", abro Microsoft Edge con `--remote-debugging-port=9222`, conecto via CDP, y uso su navegador real con sus pestañas logueadas. Veo lo que él ve, uso su mouse/teclado para previsualizar, detectar errores visuales, y corregir en tiempo real. No asumo nada por código.

2. **NUNCA hacer deploy sin orden explícita** — Solo cuando él diga exactamente "haz deploy ahora". Jamás antes.

3. **No preguntar "continuo?"** — Ejecuto TODO lo que pide hasta el final sin pausas ni confirmaciones intermedias.

4. **Ciclo completo antes del deploy**: construir → revisar → detectar errores → corregir errores → volver a comprobar → construir de nuevo → verificar que funciona. Antes del deploy, revisar push y código por errores. Un deploy solo se hace si va a funcionar.

5. **No dar la razón por defecto** — Si pide algo mejorable, decírselo directamente. No asentir sin mejorar.

6. **Analizar el fondo** — Si pide "crea un alta", entender que necesita crear cliente con sus datos, no solo una pantalla. Interpretar la intención real.

7. **Rapidez + enfoque** — No revisar mensajes antiguos ni cosas ya arregladas. Solo lo que pide en el momento.

8. **Ser proactivo** — Ayudarlo a hacer cosas que él no sabe o no puede hacer solo para mejorar el CRM.

9. **Mejoras automáticas sin preguntar** — Cuando pida una mejora, la implemento directamente en el código. Si veo mejoras relacionadas obvias que deberían acompañar a lo que pide, las hago también sin consultar. No documentar para después — ejecutar ahora. Así cada sesión deja el CRM mejor que antes, sin tener que repetir carencias.

## Reglas de Oro
- Responder en español siempre
- Mostrar progreso con [1/N] en cada paso
- No preguntar, actuar (push, deploy, decisiones sin consultar)
- Probar con `node -e` o archivo .js antes de integrar
- Verificar en navegador real después del deploy
- Leer documentación oficial antes de integrar APIs/libs
- Nada de `target="_blank"` ni `window.open`
- No instalar librerías pesadas para cosas simples
- NO usar PC local — todo en servidor Render
- NUNCA usar `node -e "..."` con `\"` en PowerShell; siempre archivos .js

## Stack
- **Backend**: Node.js + Express + EJS (layouts: express-ejs-layouts)
- **BD**: SQLite via better-sqlite3 (WAL mode, foreign_keys ON)
- **Auth**: express-session + connect-sqlite3 + bcryptjs
- **API externa**: Likes Telecom API (REST + Bearer token)
- **Hosting**: Render (Node.js)
- **IA interna**: Chat rule-based + DeepSeek vía OpenCode Zen API
- **Webhooks**: WhatsApp + Email con aprobación manual en CodeOpen
- **WhatsApp**: Proxy WebSocket a web.whatsapp.com + iframe overlay
- **Pagos**: Stripe
- **Bot**: Telegram (backups diarios, resúmenes)
- **Email**: IMAP (polling bajo demanda) + Nodemailer + SendGrid

## Estructura del Proyecto
```
servidor10062026/
├── server.js              # Entry point (Express setup, WS, cron)
├── database.js            # SQLite init + schema
├── likes-api.js           # Cliente API Likes Telecom
├── auto-sync.js           # Sync con API Likes
├── routes/                # 42 rutas Express
│   ├── auth.js            # Login/logout
│   ├── dashboard.js       # Dashboard principal
│   ├── clients.js         # CRUD clientes
│   ├── orders.js          # Órdenes
│   ├── subscriptions.js   # Suscripciones
│   ├── billing.js         # Facturación
│   ├── tickets.js         # Tickets de soporte
│   ├── products.js        # Productos
│   ├── altas.js           # Flujo de altas multi-paso
│   ├── tienda.js          # Panel Tienda (caja, agenda, inventario, etc)
│   ├── chat.js            # IA rule-based interna
│   ├── codeopen.js        # CodeOpen AI (webhooks, multi-agente, modelos)
│   ├── isp-core.js        # Módulo ISP (contratos, incidencias, etc)
│   ├── whatsapp.js        # WhatsApp overlay
│   ├── email.js           # Correo
│   ├── stripe.js          # Stripe
│   ├── telegram-bot.js    # Bot Telegram
│   ├── camera.js          # Cámara relay
│   ├── kpis.js            # KPIs y gráficos
│   ├── analytics.js       # Analítica
│   ├── backup.js          # Backups
│   ├── api.js             # API REST
│   └── ...                # +20 rutas más
├── views/                 # Plantillas EJS
│   ├── layout.ejs         # Layout principal (incluye WhatsApp overlay)
│   ├── dashboard.ejs
│   ├── login.ejs
│   ├── codeopen.ejs       # CodeOpen AI interfaz
│   └── ...                # ~37 carpetas/archivos de vistas
├── helpers/
│   ├── drive.js           # Google Drive integration
│   └── nube.js            # CDR/factura PDF generation
├── services/
│   ├── email.js           # Gmail creds
│   ├── whatsapp.js        # WhatsApp service
│   ├── transcription.js   # AssemblyAI TTS
│   └── wa-listener.js     # WhatsApp listener
├── middleware/
│   ├── auth.js            # Auth middleware (requireAuth, loadUserPermissions)
│   └── settings-loader.js # Carga settings globales
├── deploy/                # Archivos de deploy
├── public/                # Archivos estáticos
├── nube/                  # CDR/nube PDFs
├── guia/                  # Guías
└── uploads/               # Uploads
```

## Mapa de Rutas Completo

| Ruta | Archivo | Función |
|------|---------|---------|
| `/` | dashboard.js | Dashboard |
| `/auth/*` | auth.js | Login/logout |
| `/clientes` | clients.js | CRUD clientes |
| `/products` | products.js | Catálogo productos |
| `/orders` | orders.js | Órdenes |
| `/subscriptions` | subscriptions.js | Suscripciones |
| `/invoices` | billing.js | Facturación |
| `/tickets` | tickets.js | Tickets |
| `/altas` | altas.js | Flujo altas (multi-step) |
| `/tienda/*` | tienda.js | Panel Tienda |
| `/isp/*` | isp-core.js | Módulo ISP |
| `/kpis` | kpis.js | KPIs gráficos |
| `/whatsapp` | whatsapp.js | WhatsApp overlay |
| `/email` | email.js | Correo |
| `/stripe` | stripe.js | Stripe pagos |
| `/telegram` | telegram-bot.js | Bot Telegram |
| `/codeopen` | codeopen.js | CodeOpen AI |
| `/camera` | camera.js | Cámara relay |
| `/settings` | settings.js | Configuración |
| `/users` | users.js | Usuarios |
| `/backup` | backup.js | Backups |
| `/api/*` | api.js | API REST |
| `/api-proxy` | api-proxy.js | Proxy API |
| `/external-api` | external-api.js | API externa |
| `/analytics` | analytics.js | Analítica |
| `/history` | history.js | Historial |
| `/payments` | payments.js | Pagos |
| `/remittances` | remittances.js | Remesas |
| `/leads` | leads.js | Leads/oportunidades |
| `/surveys` | surveys.js | Encuestas |
| `/channel` | channel.js | Canales/distribuidores |
| `/aftersales` | aftersales.js | Postventa |
| `/massive-processes` | massive-processes.js | Procesos masivos |
| `/resources` | resources.js | Recursos |
| `/coverage` | coverage.js | Cobertura |
| `/google-connections` | google-connections.js | Google Connections |
| `/neon` | neon.js | Dispositivos Neon |
| `/chat` | chat.js | AI chat rule-based |
| `/kyc` | kyc.js | KYC docs |

## Esquema de Base de Datos (SQLite)

### Tablas Core
- **users**: id, username, password(bcrypt), nombre, email, rol(admin/user), permissions(JSON), created_at
- **clients**: id, likes_customer_id, nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad(Def:Antequera), provincia(Def:Málaga), codigo_postal(Def:29200), notas, tipo_cliente(particular), metodo_pago, iban, stripe_payment_method
- **products**: id, likes_product_id, nombre, tipo, descripcion, precio
- **orders**: id, client_id(FK), likes_order_id, estado(pendiente), tipo, producto, detalles, fecha_orden
- **subscriptions**: id, client_id(FK), likes_subscription_id, linea, producto, estado(activa), fecha_alta, fecha_baja
- **invoices**: id, client_id(FK), concepto, importe, fecha_emision, fecha_vencimiento, estado(pendiente), stripe_payment_id, stripe_payment_link
- **tickets**: id, client_id(FK), likes_ticket_id, asunto, descripcion, estado(abierto), prioridad(normal), departamento, user_id
- **activity_log**: id, tipo, descripcion, client_id, user_id
- **settings**: key(PK), value — Configuración clave-valor

### Tablas Tienda
- **tienda_agenda**: id, client_id, cliente_nombre, telefono, fecha, hora, tipo, motivo, estado(pendiente), notas, user_id
- **tienda_caja**: id, fecha, tipo(ingreso/gasto), concepto, importe, metodo_pago(efectivo), categoria, descripcion, user_id
- **tienda_presupuestos**: id, client_id, cliente_nombre, telefono, email, lineas, total, descuento, estado(pendiente), notas, valido_hasta, mano_obra, pieza_costo, tipo
- **tienda_inventario**: id, nombre, tipo, cantidad, precio_compra, precio_venta, proveedor, ubicacion, stock_minimo, notas
- **tienda_prepago**: id, nombre, apellidos, dni_nif, telefono, email, pin, puk, operador(Movilbro), linea, iccid, estado(pendiente_activar)
- **tienda_historial_dia**: id, fecha, total_ingresos, total_gastos, saldo_final, num_ventas, num_presupuestos, cerrado, user_id
- **tienda_plantilla**: id, nombre, apellidos, dni_nif, telefono, email, puesto, salario, fecha_contratacion, horario, activo, user_id
- **tienda_cierres**: id, fecha, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia, total_ingresos, gastos, saldo, num_operaciones, observaciones, cerrado_por
- **tienda_notas_diarias**: id, fecha, nota, importe, tipo
- **tienda_devoluciones**: id, producto_id, producto_nombre, cantidad, estado, motivo, fecha_devolucion, resolucion

### Tablas ISP
- **isp_contratos**: id, client_id(FK), tipo, estado(borrador), producto, tarifa, precio, descuento, permanencia_meses, fecha_alta, fecha_baja, motivo_baja, linea, iccid, pin, puk, notas
- **isp_facturas**: id, cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, fecha_vencimiento, importe_base, importe_cdrs, importe_total, metodo_pago(stripe), estado(pendiente), stripe_invoice_id, stripe_payment_intent, pagada, cliente_direccion, cliente_poblacion, cliente_provincia, codigo_postal
- **isp_facturas_lineas**: id, factura_id(FK), concepto, tipo(cuota), importe, linea
- **isp_cdrs**: id, fiscal_id, linea, concepto, tipo(exceso), importe, unidades, periodo, factura_id
- **isp_llamadas**: id, fiscal_id, linea, fecha, hora, destino, grupo, duracion, importe, periodo, factura_id
- **isp_incidencias**: id, categoria, tipo, client_id, asunto, descripcion, estado(abierta), prioridad(normal), user_id, solucion, fecha_resolucion
- **isp_portabilidades**: id, contrato_id, client_id, linea, operador_origen, operador_destino(Movilbro), estado(pendiente), fecha_solicitud, fecha_portabilidad
- **isp_tarifas**: id, nombre, tipo, descripcion, precio, precio_instalacion, permanencia_meses, velocidad, datos_gb, minutos, activo
- **isp_descuentos, isp_permanencias, isp_workflow_tipos, isp_workflows, isp_workflow_tareas**: Gestión de descuentos y workflows
- **isp_documentos**: id, nombre, tipo, categoria, archivo, ruta, client_id
- **isp_plantillas**: id, nombre, tipo, contenido, descripcion
- **isp_campanas**: id, nombre, descripcion, tipo(email), fechas, estado(borrador), presupuesto
- **isp_noticias, isp_eventos, isp_nodos, isp_equipos**: Noticias, eventos, nodos red, equipos
- **isp_articulos**: id, codigo, nombre, fabricante, categoria, modelo, precio_compra, precio_venta, stock, stock_minimo
- **isp_caja, isp_arqueos, isp_listados, isp_tareas, isp_pagos**: Caja ISP, arqueos, listados SQL, tareas, pagos

### Tablas AI/Chat
- **chat_history**: id, session_id, role(user/assistant/system), content, created_at
- **shared_context**: id, topic(UNIQUE), content, updated_at — Hechos que la IA conoce
- **pending_messages**: id, source(whatsapp/email), from_name, from_address, subject, body, proposed_response, status(pending), category(whatsapp/email), quoted_data, document_ready, document_info, document_buffer
- **model_usage**: id, model_id, date, calls — Tracking de uso de modelos

### Tablas Varias
- **altas_ordenes**: id, token(UNIQUE), client_id, likes_customer_id, estado(borrador), paso, datos_cliente, datos_pago, datos_producto, datos_cobertura, datos_donante, orden_data, likes_order_id, email_enviado, kyc_completado
- **altas_kyc_docs**: id, orden_id(FK), tipo, archivo, upload_url, download_url, estado(pendiente), drive_file_id, drive_folder_id
- **altas_envios**: id, orden_id, metodo, destinatario, direccion, contacto, estado
- **archivos**: id, nombre, tipo(pdf), ruta, datos(BLOB), tamaño, periodo, drive_id
- **distributors, distributor_sales**: Distribuidores y comisiones
- **surveys**: id, cliente_nombre, puntuacion, comentario
- **instalaciones**: id, client_id, cliente_nombre, direccion, fecha_instalacion, estado
- **bot_propuestas**: id, chat_id, texto, leido — Propuestas del bot Telegram

## API Likes Telecom

**Base**: `https://api.likestelecom.com`
**Auth**: POST `/token` con email+password+opcional brandId → Bearer token

### Endpoints principales (en `likes-api.js`):
- `GET /customers` → Clientes (paginated)
- `GET /products/brand` → Productos por marca
- `GET /portabilities` → Portabilidades
- `GET /tickets` o `/ticket` → Tickets
- `GET /line` → Líneas
- `GET /subscriptions?fiscalId=X` → Suscripciones por fiscalId
- `GET /installations` → Instalaciones
- `GET /orders` → Órdenes
- `GET /payments` → Pagos
- `GET /remittances` → Remesas
- `GET /line/cdrs?lineNumber=X` → CDRs de línea
- `GET /coverage/address?q=X` → Cobertura por dirección
- `POST /customer` → Crear cliente
- `POST /signupv2` → Crear orden
- `POST /draft-order-v2` → Draft order multi-step
- `POST /ticket` → Crear ticket
- `PUT /line` → Bloquear/desbloquear línea
- `POST /changeProduct` → Cambio de producto
- `POST /line/changeSim` → Cambio de SIM

### LikesAPI.fetchCDRsForFiscalId(api, fiscalId, periodo)
Obtiene todas las suscripciones del fiscalId, extrae líneas, llama getLineCDRs por cada línea, filtra por periodo.

## CodeOpen AI (routes/codeopen.js)

Sistema multi-agente con categorías:
- **whatsapp**: lector → analizador → redactor → validador → sintetizador
- **email**: clasificador → extractor → redactor → revisor → sintetizador
- **altas**: validador → buscador → generador → verificador → sintetizador
- **code**: orion → nova → kronos → atlas → ether
- **general**: orion → nova → kronos → atlas → ether

Modelos disponibles: deepseek-v4-flash-free, nemotron-3-ultra-free, gemini-2.0-flash-openrouter, etc.

Flujo de mensajes: webhook WhatsApp/Email → pending_messages → usuario analiza manualmente → IA propone respuesta → usuario aprueba/rechaza → se envía.

## Variables de Entorno (Render)
ADMIN_PASSWORD, LIKES_CLIENT_ID, LIKES_CLIENT_SECRET, LIKES_BRAND_ID, GMAIL_USER, GMAIL_PASS, LIKES_COGNITO_CLIENT_ID, LIKES_COGNITO_USERNAME, LIKES_COGNITO_PASSWORD, DRIVE_OAUTH_JSON, OPENCODE_API_KEY, SESSION_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, STRIPE_SECRET_KEY, STRIPE_PUBLIC_KEY

## Patrón para Añadir Nuevas Rutas
1. Crear archivo `routes/nueva-ruta.js`
2. Exportar `router = express.Router()`
3. En `server.js`: `const nuevaRuta = require('./routes/nueva-ruta'); app.use('/ruta', nuevaRuta);`
4. Vista EJS en `views/` con layout.ejs
5. Añadir navegación en layout.ejs

## Patrón para Migraciones BD
```js
try { db.prepare("ALTER TABLE tabla ADD COLUMN nueva_columna TEXT DEFAULT ''").run(); } catch(e) {}
```
Siempre con try/catch porque SQLite lanza error si la columna ya existe.

## Patrón Likes API
```js
const LikesAPI = require('./likes-api');
const api = LikesAPI.getApiInstance();
const data = await api.getCustomers(); // getProducts, getTickets, etc
```

## Deploy Render
1. `git add . && git commit -m "mensaje" && git push`
2. Dashboard Render → Manual Deploy (o esperar auto-deploy)
3. Esperar build (ver logs "deploy complete")
4. Verificar en https://movilbro-crm.onrender.com

## Errores Repetidos Corregidos
- [x] PowerShell escapado con -e → usar archivos .js
- [x] Asumir deploy terminado → verificar dashboard
- [x] Postinstall que esconde errores
- [x] Formularios sin name+onchange → autofill no dispara validación
- [x] No tener acceso Render dashboard al inicio
- [x] baileys messaging-history.set solo se dispara UNA vez
- [x] shouldSyncHistoryMessage: () => TRUE necesario para FULL sync
- [x] Drive ZIP bug: zipId guardado como drive_id del PDF individual
- [x] IMAP: Gmail no entrega correos de sí mismo
