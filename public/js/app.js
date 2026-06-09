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
