const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  
  console.log("ESPERANDO BUILD...");
  for (var intento = 1; intento <= 20; intento++) {
    await page.goto("https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680", { timeout: 20000, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    
    var text = await page.evaluate(() => document.body.innerText);
    console.log("Intento " + intento + ": " + text.substring(0, 200).replace(/\s+/g, " "));
    
    if (text.includes("deploy") && (text.includes("Live") || text.includes("100%") || text.includes("complete"))) {
      console.log("DEPLOY COMPLETADO!");
      break;
    }
    if (text.includes("Building") && text.includes("a4f98e6")) {
      console.log("  -> Aun compilando...");
    }
    if (!text.includes("Building") && text.includes("deploy")) {
      var deploySection = text.substring(Math.max(0, text.indexOf("deploy") - 30), Math.min(text.length, text.indexOf("deploy") + 100));
      console.log("  -> Estado deploy: " + deploySection.replace(/\s+/g, " "));
    }
    
    await page.waitForTimeout(15000);
  }
  
  // Ver el contenido final de la página
  var finalText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
  console.log("\nESTADO FINAL:", finalText.replace(/\s+/g, " ").substring(0, 2000));
  
  await browser.close();
}

main().catch(e => console.error("Error:", e.message));
