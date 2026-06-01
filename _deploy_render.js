const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  
  console.log("NAVEGANDO AL SERVICIO...");
  await page.goto("https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680", { timeout: 20000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  
  // Abrir el menú Manual Deploy
  await page.evaluate(() => {
    var btns = document.querySelectorAll("button");
    for (var b of btns) {
      if (b.textContent.trim() === "Manual Deploy") {
        b.click();
        return;
      }
    }
  });
  await page.waitForTimeout(1000);
  
  // Hacer clic en "Deploy latest commit"
  var clicked = await page.evaluate(() => {
    var btns = document.querySelectorAll("button");
    for (var b of btns) {
      if (b.textContent.trim() === "Deploy latest commit") {
        b.click();
        return true;
      }
    }
    return false;
  });
  console.log("DEPLOY CLICKED:", clicked);
  await page.waitForTimeout(3000);
  
  var text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log("ESTADO:", text.replace(/\s+/g, " ").substring(0, 1500));
  
  await browser.close();
}

main().catch(e => console.error("Error:", e.message));
