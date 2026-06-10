const WebSocket = require('ws');
const http = require('http');

http.get('http://localhost:9222/json', function(r) {
  var d = '';
  r.on('data', function(c) { d += c; });
  r.on('end', function() {
    var tabs = JSON.parse(d);
    var target = tabs.find(function(t) { return t.url && t.url.indexOf('codeopen') > -1; });
    if (!target) { console.log('No tab'); process.exit(1); return; }
    
    var ws = new WebSocket(target.webSocketDebuggerUrl);
    var id = 1;
    
    ws.on('open', function() {
      // Try to get script 12 source
      send({ method: 'Debugger.enable' });
      
      setTimeout(function() {
        send({ method: 'Debugger.getScriptSource', params: { scriptId: '12' } });
      }, 500);
      
      setTimeout(function() {
        // Also get script 13 and 14 for comparison  
        send({ method: 'Debugger.getScriptSource', params: { scriptId: '13' } });
      }, 1000);
      
      setTimeout(function() {
        send({ method: 'Debugger.getScriptSource', params: { scriptId: '14' } });
      }, 1500);
      
      setTimeout(function() { ws.close(); process.exit(0); }, 3000);
    });
    
    function send(msg) {
      msg.id = id++;
      ws.send(JSON.stringify(msg));
    }
    
    ws.on('message', function(data) {
      try {
        var msg = JSON.parse(data);
        if (msg.id === 2) {
          if (msg.result && msg.result.scriptSource) {
            var src = msg.result.scriptSource;
            var lines = src.split('\n');
            console.log('=== SCRIPT 12 ===');
            console.log('Lines:', lines.length);
            // Show lines around 1343 (0-indexed: 1342)
            for (var i = Math.max(0, 1338); i < Math.min(lines.length, 1346); i++) {
              console.log((i+1) + ': ' + JSON.stringify(lines[i] || ''));
            }
            // Save to file
            require('fs').writeFileSync('C:\\Users\\xtptx\\Desktop\\whatsapp0906292026\\_script12.js', src);
          } else if (msg.error) {
            console.log('Script 12 error:', JSON.stringify(msg.error));
          }
        }
        if (msg.id === 3) {
          if (msg.result && msg.result.scriptSource) {
            var src = msg.result.scriptSource;
            console.log('\nScript 13 length:', src.length, 'lines:', src.split('\n').length);
          }
        }
        if (msg.id === 4) {
          if (msg.result && msg.result.scriptSource) {
            var src = msg.result.scriptSource;
            console.log('Script 14 length:', src.length, 'lines:', src.split('\n').length);
          }
        }
      } catch(e) {}
    });
  });
});
