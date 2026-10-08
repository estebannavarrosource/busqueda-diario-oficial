import type { Browser } from "playwright-core"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * El sitio del Diario Oficial protege el sumario con un desafío anti-bot (cookies "TS")
 * que un fetch de servidor normal no puede resolver: recibe la página de desafío en vez
 * del contenido real. Un navegador headless real (Chromium vía Playwright) sí ejecuta el
 * JavaScript del desafío y llega al HTML con las publicaciones.
 *
 * @sparticuz/chromium provee un binario de Chromium comprimido compatible con el runtime
 * de funciones de Vercel (basado en Amazon Linux), que es donde corre esta app en producción.
 *
 * Se lanza un navegador nuevo por cada sesión (en vez de reutilizar uno compartido entre
 * fechas): en este entorno el proceso de Chromium se vuelve inestable y se cierra solo
 * después de pocos usos, lo que hacía fallar en cadena todas las fechas siguientes de una
 * búsqueda larga. Lanzar uno nuevo por sesión es más lento pero no depende de que una
 * instancia compartida siga viva varios minutos.
 */
async function launchBrowser(): Promise<Browser> {
  const { chromium: playwrightChromium } = await import("playwright-core")
  const chromium = (await import("@sparticuz/chromium")).default
  const executablePath = await chromium.executablePath()
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  })
}

/**
 * Navega a `url` con un navegador real y devuelve el HTML ya renderizado, una vez
 * resuelto el desafío anti-bot del sitio.
 */
export async function fetchRenderedHtml(url: string): Promise<string> {
  return withBrowserSession((nav) => nav(url))
}

/**
 * Lanza un navegador dedicado, abre un contexto y entrega una función `nav(url)` para
 * navegar dentro de esa misma sesión (mismas cookies) tantas veces como se necesite,
 * cerrando el navegador completo al finalizar.
 *
 * El desafío anti-bot del sitio (cookies "TS") se resuelve al visitar la primera URL.
 * Algunas secciones del sumario (ej. normas_particulares.php, que además requiere el
 * número de edición obtenido de la primera página) solo devuelven contenido real si se
 * navegan en el mismo contexto después de esa primera visita.
 */
export interface BinaryResponse {
  status: number
  contentType: string
  body: Buffer
}

export async function withBrowserSession<T>(
  fn: (nav: (url: string) => Promise<string>, download: (url: string) => Promise<BinaryResponse>) => Promise<T>,
): Promise<T> {
  const browser = await launchBrowser()

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT })
    const page = await context.newPage()

    const nav = async (url: string): Promise<string> => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })

      // Espera a que aparezca contenido real del sumario (enlaces "Ver PDF"). Si la fecha
      // no tiene edición (fin de semana/feriado) o la sección viene vacía, este selector
      // nunca aparece; el timeout de respaldo evita colgar la ejecución indefinidamente.
      await page
        .waitForSelector('a:has-text("Ver PDF")', { timeout: 15000 })
        .catch(() => page.waitForTimeout(2000))

      return page.content()
    }

    // Los PDF se piden con el cliente HTTP del mismo contexto para reutilizar las cookies del
    // desafío anti-bot ya resuelto al navegar el sumario.
    const download = async (url: string): Promise<BinaryResponse> => {
      const response = await context.request.get(url, { timeout: 60000 })
      return {
        status: response.status(),
        contentType: response.headers()["content-type"] ?? "",
        body: await response.body(),
      }
    }

    return await fn(nav, download)
  } finally {
    await browser.close().catch(() => {})
  }
}
