const say = require('say');
// Test native TTS
say.export('Hola, esto es una prueba de voz.', 'es-ES', 1.0, 'test_say.wav', function(err) {
  if (err) console.log('Error:', err.message);
  else console.log('Say TTS OK');
});
