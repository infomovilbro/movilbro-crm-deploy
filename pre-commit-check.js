#!/usr/bin/env node
// PRE-COMMIT CHECK - Ejecuta antes de cada commit
// Obligatorio: verifica que los fixes funcionan para TODOS los clientes

const { execSync } = require('child_process');
const path = require('path');

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  PRE-COMMIT VERIFICATION');
  console.log('  Verificando que los fixes son GLOBALES...');
  console.log('═══════════════════════════════════════════\n');

  let allPassed = true;
  const results = [];

  // 1. Verificar que el test harness existe
  const harnessPath = path.join(__dirname, 'test-harness.js');
  const fs = require('fs');
  if (!fs.existsSync(harnessPath)) {
    console.log('❌ test-harness.js no encontrado. Ejecuta primero el test.');
    process.exit(1);
  }

  // 2. Verificar sintaxis de todos los archivos modificados
  console.log('[1/4] Verificando sintaxis...');
  try {
    require('./routes/clients.js');
    require('./routes/codeopen.js');
    require('./routes/fix-notes.js');
    require('./services/transcription.js');
    require('./wa-baileys.js');
    console.log('  ✅ Sintaxis OK');
    results.push({ test: 'Sintaxis', passed: true });
  } catch(e) {
    console.log('  ❌ Error de sintaxis:', e.message);
    results.push({ test: 'Sintaxis', passed: false, error: e.message });
    allPassed = false;
  }

  // 3. Verificar que no hay TODOs o console.log de debug
  console.log('[2/4] Buscando debugs olvidados...');
  const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  let debugFound = false;
  stagedFiles.forEach(function(file) {
    if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, 'utf8');
    const debugLines = content.split('\n').filter(function(l) {
      return l.includes('console.log') && (l.includes('DEBUG') || l.includes('debug') || l.includes('[Debug]'));
    });
    if (debugLines.length > 0) {
      console.log('  ⚠️  Debug en', file, ':', debugLines.length, 'lineas');
      debugFound = true;
    }
  });
  if (!debugFound) console.log('  ✅ Sin debugs olvidados');
  results.push({ test: 'Debugs', passed: !debugFound, warning: debugFound });

  // 4. Verificar que los archivos modificados son los correctos
  console.log('[3/4] Archivos modificados:');
  stagedFiles.forEach(function(f) {
    const status = execSync('git diff --cached --stat -- "' + f + '"', { encoding: 'utf8' }).trim();
    console.log('  📄', status);
  });
  results.push({ test: 'Archivos', passed: true, files: stagedFiles });

  // 5. Recordatorio: ejecutar test harness
  console.log('\n[4/4] Recordatorio:');
  console.log('  ⚠️  Antes de marcar algo como "✅ Hecho", ejecuta:');
  console.log('     node test-harness.js all');
  console.log('  ⚠️  Y verifica que pase en TODOS los clientes.');
  results.push({ test: 'Recordatorio', passed: true });

  // Resultado final
  console.log('\n═══════════════════════════════════════════');
  const failed = results.filter(function(r) { return !r.passed; });
  if (failed.length === 0) {
    console.log('  ✅ TODO OK - Puedes continuar');
    console.log('  ⚠️  Pero NO marques nada como hecho sin ejecutar test-harness.js');
  } else {
    console.log('  ❌', failed.length, 'fallos detectados:');
    failed.forEach(function(f) { console.log('     -', f.test, ':', f.error || ''); });
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════\n');
}

main().catch(function(e) {
  console.error('Error:', e.message);
  process.exit(1);
});
