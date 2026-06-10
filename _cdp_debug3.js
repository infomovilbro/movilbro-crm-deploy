const WebSocket = require('ws');
const http = require('http');

http.get('http://localhost:9222/json', function(r) {
  var d = '';
  r.on('data', function(c) { d += c; });
  r.on('end', function() {
    var tabs = JSON.parse(d);
    var target = tabs.find(function(t) { return t.url && t.url.indexOf('codeopen') > -1; });
    if (!target) { console.log('No CodeOpen tab'); process.exit(1); return; }
    console.log('Target:', target.title);
    
    var ws = new WebSocket(target.webSocketDebuggerUrl);
    var msgId = 1;
    var pending = [];
    
    ws.on('open', function() {
      console.log('WS connected');
      
      // Send Console.enable first
      send({ method: 'Console.enable' });
      
      // Wait a bit then check scripts
      setTimeout(function() {
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { var s = document.querySelectorAll("script"); var r = []; for(var i=0;i<s.length;i++) { r.push({i:i, l:s[i].textContent.split("\\n").length}); } return r; })()',
          returnByValue: true
        }});
      }, 500);
      
      setTimeout(function() {
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { var s = document.querySelectorAll("script"); for(var i=0;i<s.length;i++) { var lines = s[i].textContent.split("\\n"); if(lines.length > 1300) { console.log("SCRIPT " + i + " LINES=" + lines.length); for(var j=1335;j<1350;j++) { if(j < lines.length) { var line = lines[j]; var marker = line.length > 100 ? line.substring(0,100) : line; console.log("L" + (j+1) + ": " + JSON.stringify(marker)); } } } } return "ok"; })()',
          returnByValue: true
        }});
      }, 1500);
      
      setTimeout(function() {
        // Check layout.ejs scripts for the error
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { var s = document.querySelectorAll("script"); var content = ""; for(var i=0;i<s.length;i++) { content += "\\n---SCRIPT " + i + " (" + s[i].textContent.split("\\n").length + " lines)---\\n"; } return content; })()',
          returnByValue: true
        }});
      }, 2500);
      
      setTimeout(function() {
        console.log('Done');
        ws.close();
        process.exit(0);
      }, 4000);
    });
    
    function send(msg) {
      msg.id = msgId++;
      ws.send(JSON.stringify(msg));
    }
    
    ws.on('message', function(data) {
      try {
        var msg = JSON.parse(data);
        
        if (msg.method === 'Console.messageAdded') {
          var c = msg.params.message;
          var text = (c.text || '').substring(0, 200);
          if (text.indexOf('SCRIPT') >= 0 || text.indexOf('L') === 0) {
            console.log('[' + c.level + ']', text);
          }
        }
        
        if (msg.id) {
          var val = msg.result && (msg.result.value || msg.result.description);
          if (val) {
            if (typeof val === 'object') val = JSON.stringify(val);
            console.log('R' + msg.id + ':', String(val).substring(0, 800));
          }
        }
        
        if (msg.method === 'Runtime.exceptionThrown') {
          console.log('EXCEPTION at line', msg.params.exceptionDetails.lineNumber);
        }
      } catch(e) {}
    });
    
    ws.on('error', function(e) { console.log('WS Error:', e.message); process.exit(1); });
  });
}).on('error', function(e) { console.log('HTTP Error:', e.message); process.exit(1); });
