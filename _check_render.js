const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  
  console.log("NAVEGANDO A SERVICIO...");
  await page.goto("https://dashboard.render.com/web/srv-", { timeout: 15000, waitUntil: "domcontentloaded" }).catch(e => console.log("URL directa no funciona:", e.message.substring(0, 60)));
  await page.waitForTimeout(2000);
  
  // Volver al dashboard
  await page.goto("https://dashboard.render.com/", { timeout: 15000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  
  // Buscar todos los enlaces de servicio
  var serviceLinks = await page.evaluate(() => {
    var links = Array.from(document.querySelectorAll("a"));
    return links.filter(l => l.href && l.href.includes("srv-")).map(l => ({ text: l.textContent.trim().substring(0, 60), href: l.href }));
  });
  console.log("SERVICE LINKS:", JSON.stringify(serviceLinks, null, 2));
  
  if (serviceLinks.length > 0) {
    console.log("\nNAVEGANDO A:", serviceLinks[0].href);
    await page.goto(serviceLinks[0].href, { timeout: 20000, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    
    var svcText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
    console.log("\nSERVICIO CONTENIDO:", svcText.replace(/\s+/g, " ").substring(0, 2000));
  }
  
  await browser.close();
}

main().catch(e => console.error("Error:", e.message));
