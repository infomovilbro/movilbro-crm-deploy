document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.table').forEach(t => {
    const rows = t.querySelectorAll('tbody tr');
    rows.forEach(row => {
      row.addEventListener('click', function(e) {
        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.closest('a') || e.target.closest('button') || e.target.closest('form')) return;
        const link = this.querySelector('a[href*="/clientes/"]');
        if (link) window.location = link.href;
      });
    });
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Ctrl+K: focus global search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var searchInput = document.getElementById('globalSearchInput');
    if (searchInput) { searchInput.focus(); searchInput.select(); return; }
    // Fallback: buscar cualquier input con placeholder "buscar" o "search"
    var inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
    for (var i = 0; i < inputs.length; i++) {
      var ph = (inputs[i].placeholder || '').toLowerCase();
      if (ph.indexOf('buscar') >= 0 || ph.indexOf('search') >= 0) {
        inputs[i].focus(); inputs[i].select(); return;
      }
    }
  }
  // Escape: close any open modal/panel
  if (e.key === 'Escape') {
    // Close WhatsApp overlay
    if (typeof toggleWAOverlay === 'function' && document.getElementById('waOverlay') && document.getElementById('waOverlay').style.display === 'flex') {
      toggleWAOverlay();
    }
  }
  // ? : Show shortcuts help
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.target.closest('input') && !e.target.closest('textarea')) {
    e.preventDefault();
    var help = document.getElementById('shortcutsHelp');
    if (help) { help.remove(); return; }
    help = document.createElement('div');
    help.id = 'shortcutsHelp';
    help.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;padding:24px;z-index:99999;box-shadow:0 8px 40px rgba(0,0,0,0.2);max-width:360px;width:90%;';
    help.innerHTML = '<h5 style="margin:0 0 12px;font-weight:600;">⌨️ Atajos de teclado</h5>' +
      '<table style="width:100%;font-size:13px;"><tr><td><kbd>Ctrl+K</kbd></td><td>Buscar global</td></tr><tr><td><kbd>Escape</kbd></td><td>Cerrar panel/overlay</td></tr><tr><td><kbd>?</kbd></td><td>Mostrar esta ayuda</td></tr></table>' +
      '<button onclick="this.parentElement.remove()" style="margin-top:12px;width:100%;padding:8px;border:0;border-radius:6px;background:#0050A1;color:#fff;cursor:pointer;font-weight:600;">Cerrar</button>';
    document.body.appendChild(help);
    // Close on click outside
    setTimeout(function() {
      document.addEventListener('click', function closeHelp(ev) {
        if (!help.contains(ev.target)) { help.remove(); document.removeEventListener('click', closeHelp); }
      });
    }, 100);
  }
});

console.log('⌨️ Atajos: Ctrl+K buscar, ? ayuda, Escape cerrar');
