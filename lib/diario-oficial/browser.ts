import type { Browser } from "playwright-core"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

let browserPromise: Promise<Browser> | null = null

/**
 * El sitio del Diario Oficial protege el sumario con un desafío anti-bot (cookies "TS")
 * que un fetch de servidor normal no puede resolver: recibe la página de desafío en vez
 * del contenido real. Un navegador headless real (Chromium vía Playwright) sí ejecuta el
 * JavaScript del desafío y llega al HTML con las publicaciones.
 *
 * @sparticuz/chromium provee un binario de Chromium comprimido compatible con el runtime
 * de funciones de Vercel (basado en Amazon Linux), que es donde corre esta app en producción.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium: playwrightChromium } = await import("playwright-core")
      const chromium = (await import("@sparticuz/chromium")).default
      const executablePath = await chromium.executablePath()
      return playwrightChromium.launch({
        args: chromium.args,
        executablePath,
        headless: true,
      })
    })()
  }
  return browserPromise
}

/**
 * Navega a `url` con un navegador real y devuelve el HTML ya renderizado, una vez
 * resuelto el desafío anti-bot del sitio.
 */
export async function fetchRenderedHtml(url: string): Promise<string> {
  const browser = await getBrowser()
  const context = await browser.newContext({ userAgent: USER_AGENT })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })

    // Espera a que aparezca contenido real del sumario (enlaces "Ver PDF"). Si la fecha
    // no tiene edición (fin de semana/feriado) este selector nunca aparece; el timeout
    // de respaldo evita colgar la ejecución indefinidamente en ese caso.
    await page
      .waitForSelector('a:has-text("Ver PDF")', { timeout: 15000 })
      .catch(() => page.waitForTimeout(2000))

    return await page.content()
  } finally {
    await context.close()
  }
}

/** Cierra el navegador compartido. Útil al finalizar una ejecución masiva de búsqueda. */
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise
    await browser.close()
    browserPromise = null
  }
}
