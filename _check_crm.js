const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  
  console.log("COMPROBANDO CRM...");
  await page.goto("https://movilbro-crm.onrender.com/altas", { timeout: 20000, waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  
  var text = await page.evaluate(() => document.body.innerText.substring(0, 5000));
  console.log("CONTENIDO ALTAS:", text.replace(/\s+/g, " ").substring(0, 2000));
  
  // También verificar que noticias ya no esté
  var hasNoticias = text.includes("Noticias");
  console.log("\n¿TIENE NOTICIAS?:", hasNoticias);
  
  // Verificar que el sidebar tiene los cambios
  var sidebarItems = ["Tarifas", "Noticias", "Caja", "Nodos", "Flujos", "Incidencias"];
  sidebarItems.forEach(function(item) {
    console.log("  ¿Tiene '" + item + "'?: " + text.includes(item));
  });
  
  await browser.close();
}

main().catch(e => console.error("Error:", e.message));
