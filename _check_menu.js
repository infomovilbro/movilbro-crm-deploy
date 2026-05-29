const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();

  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });

  var consoleLogs = [];
  page.on('console', function(msg) { consoleLogs.push({ type: msg.type(), text: msg.text() }); });
  page.on('pageerror', function(err) { consoleLogs.push({ type: 'pageerror', text: err.message }); });

  // Login first
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { waitUntil: 'load', timeout: 25000 });
  await page.waitForTimeout(2000);
  console.log('1. URL:', page.url());

  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('2. After login:', page.url());

  await page.goto('https://movilbro-crm.onrender.com/settings', { waitUntil: 'load', timeout: 25000 });
  await page.waitForTimeout(3000);
  console.log('3. Settings URL:', page.url());

  // Check elements
  var info = await page.evaluate(function() {
    var btn = document.getElementById('sidebarToggle');
    return {
      hasToggle: !!btn,
      isVisible: btn ? (btn.offsetParent !== null) : false,
      navCount: document.querySelectorAll('.bottom-nav-item').length,
      hasFn: typeof window.openNavGroup,
      inlineOnclick: btn ? (btn.getAttribute('onclick') || 'none').substring(0, 100) : 'no element',
      sidebarShow: (function() { var s = document.getElementById('sidebar'); return s ? s.classList.contains('show') : 'null'; })(),
      title: document.title,
      hasBackdrop: !!document.getElementById('sidebarBackdrop'),
      bottomNavDisplay: (function() {
        var b = document.querySelector('.bottom-nav');
        return b ? window.getComputedStyle(b).display : 'null';
      })()
    };
  });
  console.log('4. Page info:', JSON.stringify(info, null, 2));

  // Try clicking hamburger
  if (info.hasToggle) {
    try {
      await page.click('#sidebarToggle', { timeout: 5000, force: true });
      console.log('5. Hamburger clicked (force)');
    } catch(e) {
      console.log('5. Hamburger error:', e.message.substring(0, 120));
      // Try dispatching click event directly
      await page.evaluate(function() {
        var btn = document.getElementById('sidebarToggle');
        if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        console.log('Dispatched click event');
      });
      console.log('5b. Dispatched click event');
    }
    await page.waitForTimeout(500);

    var afterHamburger = await page.evaluate(function() {
      var s = document.getElementById('sidebar');
      return { show: s ? s.classList.contains('show') : 'null' };
    });
    console.log('6. After hamburger, sidebar.show:', afterHamburger.show);
  }

  // Close sidebar if open
  var isOpen = await page.evaluate(function() { var s = document.getElementById('sidebar'); return s ? s.classList.contains('show') : false; });
  if (isOpen) {
    await page.evaluate(function() { 
      var s = document.getElementById('sidebar'); 
      var b = document.getElementById('sidebarBackdrop');
      if (s) s.classList.remove('show');
      if (b) b.classList.remove('show');
    });
    await page.waitForTimeout(300);
  }

  // Try bottom nav
  if (info.navCount > 0) {
    try {
      await page.click('.bottom-nav-item:first-child', { timeout: 3000, force: true });
      console.log('7. Bottom nav clicked (force)');
    } catch(e) {
      console.log('7. Bottom nav click error:', e.message.substring(0, 100));
      await page.evaluate(function() {
        var btn = document.querySelector('.bottom-nav-item');
        if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      console.log('7b. Dispatched bottom-nav click event');
    }
    await page.waitForTimeout(500);

    var afterNav = await page.evaluate(function() {
      var s = document.getElementById('sidebar');
      var g = document.querySelector('.nav-group.open');
      return {
        show: s ? s.classList.contains('show') : 'null',
        activeGroup: g ? g.getAttribute('data-group-key') : 'none'
      };
    });
    console.log('8. After bottom-nav, sidebar.show:', afterNav.show, 'group:', afterNav.activeGroup);
  }

  // Print errors
  console.log('\n=== CONSOLE LOGS (' + consoleLogs.length + ') ===');
  var errors = consoleLogs.filter(function(l) { return l.type === 'error' || l.type === 'pageerror'; });
  if (errors.length > 0) {
    console.log('--- ERRORS ---');
    errors.forEach(function(e) { console.log('  [' + e.type + ']', e.text); });
  } else {
    console.log('  No errors found.');
  }

  await browser.close();
})().catch(function(e) { console.error('FATAL:', e.message); });
