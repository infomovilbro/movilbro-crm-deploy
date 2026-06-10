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
      console.log('Connected to', target.url);
      
      // Get all script sources via Debugger
      send({ method: 'Debugger.enable' });
      
      // List all script sources
      send({ method: 'Debugger.getScriptSource', params: { scriptId: '12' } });
      
      setTimeout(function() {
        // Try to get script with error
        send({ method: 'Runtime.evaluate', params: {
          expression: 'window.location.href',
          returnByValue: true
        }});
      }, 1000);
      
      setTimeout(function() {
        ws.close();
        process.exit(0);
      }, 3000);
    });
    
    function send(msg) {
      msg.id = id++;
      ws.send(JSON.stringify(msg));
    }
    
    ws.on('message', function(data) {
      try {
        var msg = JSON.parse(data);
        console.log('MSG:', JSON.stringify(msg).substring(0, 1000));
      } catch(e) {}
    });
  });
});
