const WebSocket = require('ws');
const http = require('http');

http.get('http://localhost:9222/json', function(r) {
  var d = '';
  r.on('data', function(c) { d += c; });
  r.on('end', function() {
    var tabs = JSON.parse(d);
    var target = tabs.find(function(t) { return t.url && t.url.indexOf('codeopen') > -1; });
    if (!target) { console.log('No CodeOpen tab found'); return; }
    
    console.log('Title:', target.title);
    var ws = new WebSocket(target.webSocketDebuggerUrl);
    var msgId = 1;
    
    ws.on('open', function() {
      console.log('Connected!');
      
      // Enable Console and Runtime
      send({ method: 'Console.enable' });
      send({ method: 'Runtime.enable' });
      
      // Wait for initial events, then evaluate
      setTimeout(function() {
        // Check the main script
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { try { eval(document.querySelector("script:last-of-type").textContent); return "OK"; } catch(e) { return e.message; } })()',
          returnByValue: true
        }});
      }, 1000);
      
      setTimeout(function() {
        // Check page state
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { return { buttons: document.querySelectorAll("button").length, cerebroBtn: !!document.getElementById("cerebroBtn"), scriptLen: (document.querySelector("script:last-of-type")||{}).textContent?.length } })()',
          returnByValue: true
        }});
      }, 2000);
      
      setTimeout(function() {
        // Get the exact error
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { return window.__lastError ? window.__lastError : "no error stored"; })()',
          returnByValue: true
        }});
      }, 3000);
      
      setTimeout(function() {
        // Check last script content (first 2000 chars)
        send({ method: 'Runtime.evaluate', params: {
          expression: '(function() { var s = document.querySelector("script:last-of-type"); return s ? s.textContent.substring(0,2000) : "noscrip"; })()',
          returnByValue: true
        }});
      }, 4000);
      
      setTimeout(function() { ws.close(); process.exit(0); }, 5000);
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
          console.log('[' + c.level + '] ' + c.text.substring(0, 300));
          if (c.stackTrace) {
            var frames = c.stackTrace.callFrames || [];
            console.log('  at', frames.slice(0,2).map(function(f) { return f.functionName + ' (' + f.url + ':' + f.lineNumber + ')'; }).join('\n  at '));
          }
        }
        
        if (msg.method === 'Runtime.exceptionThrown') {
          console.log('EXCEPTION:', JSON.stringify(msg.params.exceptionDetails));
        }
        
        if (msg.id) {
          if (msg.id === 3) console.log('Eval result:', msg.result && (msg.result.value || msg.result.description));
          if (msg.id === 4) console.log('Page state:', JSON.stringify(msg.result && msg.result.value));
          if (msg.id === 5) console.log('Last error:', msg.result && msg.result.value);
          if (msg.id === 6) console.log('Script start:', (msg.result && msg.result.value || '').substring(0, 500));
        }
      } catch(e) {}
    });
    
    ws.on('error', function(e) { console.log('WS Error:', e.message); });
  });
}).on('error', function(e) { console.log('HTTP Error:', e.message); });
