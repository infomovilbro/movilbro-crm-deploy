const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  await page.goto("https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680/env", { timeout: 20000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Click Edit first
  await page.evaluate(() => {
    var btns = document.querySelectorAll("button");
    for (var b of btns) { if (b.textContent.trim() === "Edit") { b.click(); return; } }
  });
  await page.waitForTimeout(1500);

  // Try to log in to the CRM directly from a new page
  await page.goto("https://movilbro-crm.onrender.com/auth/login", { timeout: 20000, waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Fill login form - try common credentials
  var loginForm = await page.evaluate(() => {
    var inputs = document.querySelectorAll("input[type=text], input[type=email], input[type=password]");
    var btns = document.querySelectorAll("button[type=submit], button:has-text('Entrar')");
    return { inputs: inputs.length, btns: btns.length };
  });
  console.log("LOGIN FORM:", JSON.stringify(loginForm));

  // Try to find form fields
  var fields = await page.evaluate(() => {
    var inputs = document.querySelectorAll("input");
    return Array.from(inputs).map(i => ({ id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, class: (i.className || "").substring(0, 40) }));
  });
  console.log("FIELDS:", JSON.stringify(fields, null, 2));

  // Try the submit button
  var submitBtn = await page.evaluate(() => {
    var btns = document.querySelectorAll("button");
    for (var b of btns) {
      if (b.textContent.trim().toLowerCase().includes("entrar") || b.type === "submit") {
        return b.outerHTML.substring(0, 200);
      }
    }
    return "not found";
  });
  console.log("SUBMIT:", submitBtn);

  await browser.close();
}
main().catch(e => console.error("Error:", e.message));
