const LikesAPI = require('./likes-api');
const { db } = require('./database');

(async () => {
  try {
    const api = LikesAPI.getApiInstance();
    // Try different fiscal IDs to find one with docs
    const testIds = ['24171297E', '74839281Y', '26421592H'];
    
    for (const fiscalId of testIds) {
      console.log('\n=== Testing fiscalId:', fiscalId, '===');
      try {
        const raw = await api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fiscalId) +
          '&includeCustomer=true');
        const data = raw && raw.data ? raw.data : raw;
        
        if (data.customer) {
          console.log('Customer keys:', Object.keys(data.customer).join(', '));
          if (data.customer.documentation) {
            console.log('documentation type:', typeof data.customer.documentation);
            console.log('documentation:', JSON.stringify(data.customer.documentation));
          } else {
            console.log('NO documentation field');
          }
          // Check any doc-related fields
          Object.keys(data.customer).filter(k => k.toLowerCase().includes('doc')).forEach(k => {
            console.log(k + ':', JSON.stringify(data.customer[k]));
          });
        } else {
          console.log('No customer in response');
          console.log('Response keys:', Object.keys(data).join(', '));
        }
      } catch(e) {
        console.error('Error:', e.message);
      }
    }
  } catch(e) {
    console.error('Fatal:', e.message);
  }
})();
