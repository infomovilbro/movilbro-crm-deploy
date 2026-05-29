const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

var SNAP_FILE = path.join(__dirname, 'cam_snap.jpg');
var capTimer = null;
var wsRelay = null;

function captureLocal(cb) {
  var ps = spawn('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.Drawing;' +
    '$p = Get-Process -Name "iCam365" -ErrorAction SilentlyContinue;' +
    'if (!$p) { exit 1 };' +
    '$h = $p.MainWindowHandle;' +
    'Add-Type @"' +
    '  using System; using System.Runtime.InteropServices;' +
    '  public class W {' +
    '    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);' +
    '    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);' +
    '    public struct RECT { public int L; public int T; public int R; public int B; }' +
    '  }' +
    '"@;' +
    '[W]::ShowWindow($h, 9); Start-Sleep -Milliseconds 500;' +
    '$r = New-Object W+RECT; [W]::GetWindowRect($h, [ref]$r);' +
    '$w = $r.R - $r.L; $hh = $r.B - $r.T;' +
    'if ($w -le 0 -or $hh -le 0) { $w = 640; $hh = 480 };' +
    'using ($bmp = New-Object Drawing.Bitmap $w $hh) {' +
    '  using ($g = [Drawing.Graphics]::FromImage($bmp)) {' +
    '    $g.CopyFromScreen($r.L, $r.T, 0, 0, [Drawing.Size]::new($w, $hh));' +
    '  };' +
    '  $bmp.Save('"'" + SNAP_FILE.replace(/\\/g, '\\\\') + "'"', [Drawing.Imaging.ImageFormat]::Jpeg);' +
    '};' +
    '[W]::ShowWindow($h, 6); exit 0'
  ]);
  var err = '';
  ps.stderr.on('data', function(d) { err += d; });
  ps.on('close', function(code) {
    if (code === 0 && fs.existsSync(SNAP_FILE)) {
      cb(null, fs.readFileSync(SNAP_FILE));
    } else {
      cb(new Error('Capture failed: ' + err.trim() || 'code ' + code));
    }
  });
}

function startCapture(cb) {
  if (capTimer) return cb && cb();
  capTimer = setInterval(function() {
    captureLocal(function(err, buf) {
      if (!err && wsRelay && wsRelay.readyState === 1) {
        try { wsRelay.send(buf); } catch(e) {}
      }
    });
  }, 3000);
  // Immediate first capture
  captureLocal(function(err, buf) {
    if (!err && wsRelay && wsRelay.readyState === 1) {
      try { wsRelay.send(buf); } catch(e) {}
    }
    if (cb) cb();
  });
}

function stopCapture() {
  if (capTimer) { clearInterval(capTimer); capTimer = null; }
}

function setRelay(ws) {
  wsRelay = ws;
}

module.exports = { captureLocal, startCapture, stopCapture, setRelay, SNAP_FILE };
