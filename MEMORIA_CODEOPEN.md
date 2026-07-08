## Sesión 2026-06-22 — #codeopen1

### Estado funcional de CodeOpen al 22/6/2026:
- Transcripción de audio vía AssemblyAI (AssemblyAI_API_KEY)
- TTS 4 backends: SpeechT5 (local masc), AssemblyAI (fem/masc), Google TTS, OpenRouter TTS
- Análisis de mensajes vía opencode.ai/zen + OpenRouter con fallback secuencial
- Webhooks WhatsApp + Email + IMAP polling
- Panel de pendientes con badge, aprobar/rechazar, editar respuesta
- Detección de documentos (facturas, contratos) vía detectAndFetchDocument()
- Envío WhatsApp vía wa-baileys.js (texto + audio + documentos)
- Categorización automática: WhatsApp, Email, Altas (por keywords)
- Búsqueda de clientes por teléfono vía /codeopen/lookup-client/:phone
- Acceso rápido: Ficha, Facturación, Contratos, Tarifas, CDRs, PIN/PUK, Instalación, KYC, Consumo, Cambiar Tarifa, Incidencias
- Modelo cacheado (_lastSuccessfulModel) para acelerar análisis
- Timeout de análisis: 8s global, 6s por request, max_tokens: 200
- Keep-alive: ping cada 30s a localhost + URL externa detectada

### Archivos clave:
- routes/codeopen.js — endpoints análisis, webhooks, TTS
- views/codeopen.ejs — UI completa con tabs, badges, editor de respuesta
- services/transcription.js — transcripción audio + TTS
- wa-baileys.js — envío WhatsApp (texto, audio, docs)
