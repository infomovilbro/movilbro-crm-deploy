const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  var streamUrl = db.prepare("SELECT value FROM settings WHERE key = 'camera_stream_url'").get();
  var camIp = db.prepare("SELECT value FROM settings WHERE key = 'camera_ip'").get();
  var camUid = db.prepare("SELECT value FROM settings WHERE key = 'camera_uid'").get();
  var relayUrl = db.prepare("SELECT value FROM settings WHERE key = 'camera_relay_url'").get();
  res.render('camera', {
    title: 'Cámara - iCam365',
    streamUrl: streamUrl ? streamUrl.value : '',
    camIp: camIp ? camIp.value : '192.168.1.130',
    camUid: camUid ? camUid.value : '633H78YXCP5G',
    relayUrl: relayUrl ? relayUrl.value : 'ws://localhost:3456'
  });
});

router.post('/settings', requireAuth, (req, res) => {
  var { stream_url, cam_ip, cam_uid } = req.body;
  if (stream_url) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('camera_stream_url', ?)").run(stream_url);
  if (cam_ip) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('camera_ip', ?)").run(cam_ip);
  if (cam_uid) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('camera_uid', ?)").run(cam_uid);
  res.json({ ok: true });
});

router.get('/snapshot', requireAuth, (req, res) => {
  var streamUrl = db.prepare("SELECT value FROM settings WHERE key = 'camera_stream_url'").get();
  var url = streamUrl ? streamUrl.value : 'http://192.168.1.130:8080/cgi-bin/snapshot.cgi';

  var http = require('http');
  var urlObj = require('url').parse(url);
  var opts = {
    hostname: urlObj.hostname,
    port: urlObj.port || 80,
    path: urlObj.path,
    timeout: 5000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  };
  var reqOut = http.get(opts, function(r) {
    var ct = r.headers['content-type'] || '';
    if (ct.includes('image')) {
      res.setHeader('Content-Type', ct);
      r.pipe(res);
    } else {
      res.json({ error: 'No es una imagen', status: r.statusCode, type: ct });
    }
  });
  reqOut.on('error', function(e) {
    res.json({ error: e.message });
  });
  reqOut.setTimeout(5000, function() {
    reqOut.destroy();
    res.json({ error: 'Timeout conectando a la cámara' });
  });
});

module.exports = router;
