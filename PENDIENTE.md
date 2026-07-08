# PENDIENTE PARA PRÓXIMA SESIÓN

## Preguntas del usuario a responder:
1. **Navegación**: No ve /isp/ porque falta en el menú. Añadir grupo "ISP" en el layout junto a Panel Tienda, Clientes, etc.
2. **Marketing/Campañas**: Explicar para qué sirve (promos tipo "1 mes gratis fibra"). Si no lo usa, borrar.
3. **Contrato #573**: Captura en contrato_573.png. Rogelio F. Astrie, Fibra 600MB+Fijo, 24,95€, ACTIVO.
4. **Incidencias**: En /isp/incidencias
5. **Noticias**: En /isp/noticias
6. **Listados**: En /isp/listados (10 tipos)
7. **Tarifas**: Enlazar con API Likes Telecom

## Reorganizar (punto 3):
- routes/isp-core.js monolítico → dividir en módulos separados
- Cada módulo su propio archivo como el CRM original
- Añadir navegación en layout

## Skills:
- opencode-skills-collection instalado en ~/.config/opencode/opencode.json
- Se activa al reiniciar OpenCode
- Usarlos para analizar módulo por módulo

## Puerto:
- iniciar-isp.bat → 3005
- URL: http://localhost:3005/isp/
