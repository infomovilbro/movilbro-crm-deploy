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
      console.log('Connected');
      
      // Use Debugger to get the script content
      send({ method: 'Debugger.enable' });
      
      setTimeout(function() {
        // Get the HTML source via DOM.getDocument
        send({ method: 'DOM.getDocument' });
      }, 500);
      
      setTimeout(function() {
        // Actually let's just get the page source via Runtime
        send({ method: 'Runtime.evaluate', params: {
          expression: 'document.documentElement.outerHTML',
          returnByValue: false,
          generatePreview: false
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
        if (msg.id === 3 && msg.result) {
          var obj = msg.result.result;
          // The HTML is too large for returnByValue, get via objectId
          if (obj && obj.objectId) {
            send({ method: 'Runtime.getProperties', params: { objectId: obj.objectId } });
          }
        }
        if (msg.id === 4 && msg.result) {
          var props = msg.result.result || [];
          props.forEach(function(p) {
            if (p.name === '0' && p.value && p.value.value) {
              var html = p.value.value;
              // Write to file
              require('fs').writeFileSync('C:\\Users\\xtptx\\Desktop\\whatsapp0906292026\\_page_source.html', html);
              console.log('Saved page HTML, length:', html.length);
              // Find the script tags
              var scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
              if (scripts) {
                console.log('Total scripts:', scripts.length);
                scripts.forEach(function(s, i) {
                  var lines = s.replace('<script>', '').replace('</script>', '').split('\n').length;
                  console.log('  Script ' + i + ': ' + lines + ' lines');
                });
              }
            }
          });
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          console.log('Exception at line', msg.params.exceptionDetails.lineNumber, 'col', msg.params.exceptionDetails.columnNumber);
        }
      } catch(e) {}
    });
  });
});
