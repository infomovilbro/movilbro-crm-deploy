// Token refresher - se ejecuta desde el PC local cada 30 min
// Obtiene token de Likes API y lo envía al Replit CRM
const axios = require('axios');

const CREDS = { email: 'eloyfuentesbermudez@gmail.com', password: 'Teresa88.', brand: '264' };
const REPLIT_URL = 'https://workspace.infomovilbro.repl.co/api/update-likes-token';

async function refresh() {
  try {
    const res = await axios.post('https://api.likestelecom.com/token', CREDS, { timeout: 15000 });
    const token = res.data.token || res.data.access_token;
    if (!token) throw new Error('No token in response');
    
    // Send token to Replit CRM
    await axios.post(REPLIT_URL, { token }, { timeout: 10000 });
    console.log(new Date().toISOString(), 'Token actualizado OK');
  } catch(e) {
    console.error(new Date().toISOString(), 'Error:', e.message);
  }
}

// Run immediately, then every 30 min
refresh();
setInterval(refresh, 30 * 60 * 1000);
