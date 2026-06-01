const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  // Login
  await page.goto("https://movilbro-crm.onrender.com/auth/login", { timeout: 20000, waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    var inputs = document.querySelectorAll("input");
    inputs.forEach(i => {
      if (i.type === "text" || i.type === "email") i.value = "aaa";
      if (i.type === "password") i.value = "aaa";
    });
    var btns = document.querySelectorAll("button");
    btns.forEach(b => { if (b.textContent.trim().toLowerCase().includes("entrar")) b.click(); });
  });
  await page.waitForTimeout(2000);

  // TEST PDF
  console.log("=== TEST PDF DOWNLOAD ===");
  var response = await page.goto("https://movilbro-crm.onrender.com/isp/nube/pdf/1236", { timeout: 15000, waitUntil: "domcontentloaded" });
  console.log("PDF STATUS:", response.status());
  var contentType = response.headers()["content-type"] || "";
  console.log("CONTENT TYPE:", contentType);
  var text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log("RESPONSE:", text.replace(/\s+/g, " ").substring(0, 500));

  // TEST Contrato link
  console.log("\n=== TEST CONTRATO LINK ===");
  await page.goto("https://movilbro-crm.onrender.com/isp/contratos?fiscal_id=0V8V24788", { timeout: 20000, waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  var contratoText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log("CONTRATOS:", contratoText.replace(/\s+/g, " ").substring(0, 1000));

  await browser.close();
}
main().catch(e => console.error("Error:", e.message));
