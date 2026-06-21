const { pipeline } = await import('@xenova/transformers');
const fs = await import('fs');

async function testTTS() {
  try {
    // Try a small TTS model
    const synthesizer = await pipeline('text-to-speech', 'Xenova/tts-1', { quantized: true });
    const result = await synthesizer('Hola, esto es una prueba de voz masculina.');
    fs.writeFileSync('test_audio.wav', result.audio);
    console.log('TTS OK, archivo test_audio.wav creado');
  } catch(e) {
    console.log('TTS error:', e.message);
  }
}
testTTS();
