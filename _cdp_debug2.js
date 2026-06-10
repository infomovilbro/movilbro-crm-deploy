const WebSocket = require('ws');
const http = require('http');

http.get('http://localhost:9222/json', function(r) {
  var d = '';
  r.on('data', function(c) { d += c; });
  r.on('end', function() {
    var tabs = JSON.parse(d);
    var target = tabs.find(function(t) { return t.url && t.url.indexOf('codeopen') > -1; });
    if (!target) return console.log('No tab');
    
    var ws = new WebSocket(target.webSocketDebuggerUrl);
    var msgId = 1;
    
    ws.on('open', function() {
      console.log('Connected to:', target.title);
      
      // Get the ENTIRE script content
      send({
        method: 'Runtime.evaluate',
        params: {
          expression: '(function() { var scripts = document.querySelectorAll("script"); var results = []; for(var i=0;i<scripts.length;i++) { results.push({idx:i, len: scripts[i].textContent.length, first: scripts[i].textContent.substring(0,50)}); } return JSON.stringify(results); })()',
          returnByValue: true
        }
      });
      
      setTimeout(function() {
        // Get script at line 1343
        send({
          method: 'Runtime.evaluate',
          params: {
            expression: '(function() { var s = document.querySelectorAll("script"); for(var i=0;i<s.length;i++) { var lines = s[i].textContent.split("\\n"); if(lines.length > 1340) { return "Script " + i + " has " + lines.length + " lines. Line 1343: " + (lines[1342] || "empty").substring(0,100); } } return "No script long enough"; })()',
            returnByValue: true
          }
        });
      }, 1000);
      
      setTimeout(function() {
        // Check AND FIX the issue: find scripts with line 1343
        send({
          method: 'Runtime.evaluate',
          params: {
            expression: '(function() { var s = document.querySelectorAll("script"); for(var i=0;i<s.length;i++) { var lines = s[i].textContent.split("\\n"); console.log("Script " + i + ": " + lines.length + " lines"); if(lines.length >= 1343) { console.log("Script " + i + " LINE 1343: " + JSON.stringify(lines[1342])); console.log("Before: " + JSON.stringify(lines[1341])); console.log("After: " + JSON.stringify(lines[1343])); } } return "done"; })()',
            returnByValue: true
          }
        });
      }, 2000);
      
      setTimeout(function() { ws.close(); process.exit(0); }, 4000);
    });
    
    function send(msg) {
      msg.id = msgId++;
      ws.send(JSON.stringify(msg));
    }
    
    ws.on('message', function(data) {
      try {
        var msg = JSON.parse(data);
        if (msg.method === 'Console.messageAdded') {
          console.log('[' + msg.params.message.level + ']', msg.params.message.text.substring(0, 300));
        }
        if (msg.id && msg.result) {
          console.log('Result:', JSON.stringify(msg.result.value || msg.result.description).substring(0, 500));
        }
      } catch(e) {}
    });
  });
});
