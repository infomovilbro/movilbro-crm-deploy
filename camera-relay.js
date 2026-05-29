const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

var RELAY_URL = process.env.CAM_RELAY_URL || 'wss://movilbro-crm.onrender.com/camera-ws';
var SNAP_FILE = path.join(__dirname, 'cam_snap.jpg');
var INTERVAL = 2000;
var ws = null;
var reconnectTimer = null;

function captureSnapshot(cb) {
  var ps = spawn('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.Drawing;' +
    '$p = Get-Process -Name "iCam365" -ErrorAction SilentlyContinue;' +
    'if (!$p) { exit 1; }' +
    '$h = $p.MainWindowHandle;' +
    'Add-Type @"' +
    '  using System;' +
    '  using System.Drawing;' +
    '  using System.Runtime.InteropServices;' +
    '  public class Cap {' +
    '    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, int nFlags);' +
    '    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);' +
    '    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int n);' +
    '    public struct RECT { public int L; public int T; public int R; public int B; }' +
    '    public static bool Run(string f) {' +
    '      var p = System.Diagnostics.Process.GetProcessesByName("iCam365");' +
    '      if (p.Length == 0) return false;' +
    '      var h = p[0].MainWindowHandle;' +
    '      ShowWindow(h, 9); System.Threading.Thread.Sleep(300);' +
    '      RECT r; GetClientRect(h, out r);' +
    '      int w = r.R - r.L; int hh = r.B - r.T;' +
    '      if (w <= 0 || hh <= 0) { w = 640; hh = 480; }' +
    '      using (var bmp = new Bitmap(w, hh)) {' +
    '        using (var g = Graphics.FromImage(bmp)) {' +
    '          IntPtr hdc = g.GetHdc(); PrintWindow(h, hdc, 0); g.ReleaseHdc(hdc);' +
    '        }' +
    '        bmp.Save(f, ImageFormat.Jpeg);' +
    '      }' +
    '      ShowWindow(h, 6);' +
    '      return true;' +
    '    }' +
    '  }' +
    '"@;' +
    'if ([Cap]::Run(\'' + SNAP_FILE.replace(/\\/g, '\\\\') + '\')) { exit 0; } else { exit 2; }'
  ]);

  var err = '';
  ps.stderr.on('data', function(d) { err += d; });
  ps.on('close', function(code) {
    if (code === 0 && fs.existsSync(SNAP_FILE)) {
      cb(null, fs.readFileSync(SNAP_FILE));
    } else {
      cb(new Error(code === 1 ? 'iCam365 not running' : 'Capture failed: ' + err.trim()));
    }
  });
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(RELAY_URL);
  } catch(e) {
    console.log('Connection error:', e.message);
    scheduleReconnect();
    return;
  }

  ws.on('open', function() {
    console.log('Connected to camera relay at', RELAY_URL);
    ws.send('relay');
    sendFrames();
  });

  ws.on('close', function() {
    console.log('Disconnected');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    scheduleReconnect();
  });

  ws.on('error', function(e) {
    console.log('WebSocket error:', e.message);
  });
}

function sendFrames() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  captureSnapshot(function(err, buf) {
    if (!err && buf && ws.readyState === WebSocket.OPEN) {
      ws.send(buf);
      console.log('Frame sent:', buf.length, 'bytes');
    } else if (err) {
      console.log('Capture error:', err.message);
    }
    setTimeout(sendFrames, INTERVAL);
  });
}

function scheduleReconnect() {
  reconnectTimer = setTimeout(connect, 5000);
  console.log('Reconnecting in 5s...');
}

console.log('Camera Relay Agent');
console.log('Relay URL:', RELAY_URL);
console.log('Interval:', INTERVAL + 'ms');
console.log('');
console.log('Make sure iCam365 Player is running');
console.log('');

connect();
