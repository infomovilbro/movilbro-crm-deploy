const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  await page.goto("https://movilbro-crm.onrender.com/auth/login", { timeout: 20000, waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Rellenar formulario usando JavaScript directo
  await page.evaluate(() => {
    var inputs = document.querySelectorAll("input");
    inputs.forEach(i => {
      if (i.type === "text" || i.type === "email") i.value = "aaa";
      if (i.type === "password") i.value = "aaa";
    });
  });
  
  // Hacer clic en botón submit
  await page.evaluate(() => {
    var btns = document.querySelectorAll("button");
    btns.forEach(b => {
      if (b.textContent.trim().toLowerCase().includes("entrar")) b.click();
    });
  });
  
  await page.waitForTimeout(3000);
  console.log("URL después login:", page.url());
  
  if (!page.url().includes("login")) {
    console.log("LOGIN EXITOSO!");
    var text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log("CONTENIDO:", text.replace(/\s+/g, " ").substring(0, 300));
  } else {
    console.log("LOGIN FALLÓ - intentando otras contraseñas...");
  }

  await browser.close();
}
main().catch(e => console.error("Error:", e.message));
