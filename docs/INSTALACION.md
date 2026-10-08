# Guía de instalación — Sistema de Búsqueda en el Diario Oficial (DGA)

Esta guía explica, paso a paso, cómo instalar el sistema desde cero, ya sea en **Vercel** (recomendado) o en un **servidor propio / computador local**. Está pensada para que la pueda seguir alguien sin conocimiento previo del proyecto.

---

## Índice

1. [Qué hace el sistema](#1-qué-hace-el-sistema)
2. [Arquitectura y componentes](#2-arquitectura-y-componentes)
3. [Requisitos previos](#3-requisitos-previos)
4. [Opción A — Instalación en Vercel (recomendada)](#4-opción-a--instalación-en-vercel-recomendada)
5. [Opción B — Instalación local o en servidor propio](#5-opción-b--instalación-local-o-en-servidor-propio)
6. [Base de datos: scripts y tablas](#6-base-de-datos-scripts-y-tablas)
7. [Variables de entorno](#7-variables-de-entorno)
8. [Verificación posterior a la instalación](#8-verificación-posterior-a-la-instalación)
9. [Primer uso: carga inicial de datos](#9-primer-uso-carga-inicial-de-datos)
10. [Formato de los archivos Excel](#10-formato-de-los-archivos-excel)
11. [Límites de duración y recomendaciones de operación](#11-límites-de-duración-y-recomendaciones-de-operación)
12. [Actualización, respaldo y mantenimiento](#12-actualización-respaldo-y-mantenimiento)
13. [Solución de problemas](#13-solución-de-problemas)

---

## 1. Qué hace el sistema

El sistema tiene dos módulos:

| Módulo | Ruta | Función |
|---|---|---|
| **Expedientes** | `/` | Importa un Excel con expedientes (N° de expediente, solicitante, RUT, fechas, región, comuna…), recorre el Diario Oficial por un rango de fechas y detecta publicaciones que coinciden con cada expediente (por N° de expediente, RUT, nombre y N° de resolución). Las coincidencias se confirman o rechazan manualmente y se pueden exportar a Excel. |
| **Publicaciones DGA** | `/publicaciones` | Importa los Excel de publicaciones (ID_DOE, CVE, FECPUB…), clasifica cada registro como competencia DGA o no mediante reglas editables, y descarga y guarda el PDF de cada CVE una sola vez. Incluye filtros, auditoría y reglas en `/publicaciones/reglas`. |

---

## 2. Arquitectura y componentes

```
Navegador ──► Aplicación Next.js 16 (React 19)
                 │
                 ├── PostgreSQL (Neon)        → expedientes, publicaciones, coincidencias, reglas, auditoría
                 ├── Vercel Blob (público)    → PDFs descargados del Diario Oficial
                 └── Chromium headless        → lee www.diariooficial.interior.gob.cl
                     (Playwright + @sparticuz/chromium)
```

- **Next.js 16** con App Router, Server Actions y rutas API.
- **PostgreSQL** accedido con `pg` + Drizzle ORM (`lib/db`).
- **Vercel Blob** para almacenar los PDFs (`lib/dga/descarga.ts`).
- **Chromium headless**: el sitio del Diario Oficial tiene un desafío anti-bot que una petición HTTP normal no resuelve; por eso se usa un navegador real (`lib/diario-oficial/browser.ts`).
- Las búsquedas y descargas largas corren **en segundo plano** (`after()` de Next.js) y la interfaz consulta su avance cada pocos segundos mediante `/api/busquedas/[id]` y `/api/dga/descargas/[id]`.

---

## 3. Requisitos previos

| Requisito | Versión / detalle |
|---|---|
| Node.js | **20.9 o superior** (recomendado **24 LTS**, que es la versión con que se desarrolló) |
| pnpm | Se activa con Corepack (incluido en Node). El proyecto declara el gestor en `package.json` → `packageManager`. |
| Git | Cualquier versión reciente |
| PostgreSQL | **15 o superior**. Recomendado: [Neon](https://neon.tech) (integración nativa con Vercel) |
| Almacenamiento de archivos | Un store de **Vercel Blob** con acceso **público** |
| Navegador Chromium | Solo para instalación local en Windows/macOS: Google Chrome o Chromium instalado (ver §5.4) |
| Acceso a internet saliente | Hacia `www.diariooficial.interior.gob.cl` y hacia Neon / Vercel Blob |

Cuentas necesarias para la opción A: **GitHub**, **Vercel** (el plan Pro es recomendable por los límites de duración, ver §11).

---

## 4. Opción A — Instalación en Vercel (recomendada)

### 4.1 Obtener el código

1. Ingresa a GitHub y haz un *fork* (o clona y sube a un repositorio propio) del repositorio `busqueda-diario-oficial`.
2. Verifica que el repositorio contenga las carpetas `app/`, `lib/`, `components/`, `scripts/` y el archivo `package.json`.

### 4.2 Crear el proyecto en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new).
2. Elige **Import Git Repository** y selecciona el repositorio.
3. *Framework Preset*: **Next.js** (se detecta solo).
4. *Build Command* y *Install Command*: dejar los valores por defecto (`pnpm install` / `next build`).
5. **No despliegues todavía**: primero conecta la base de datos y el almacenamiento (pasos 4.3 y 4.4). Si ya lo desplegaste, no importa: volverás a desplegar al final.

### 4.3 Conectar la base de datos (Neon)

1. En el proyecto de Vercel ve a **Storage → Create Database → Neon (Postgres)**.
2. Elige la región más cercana a tus usuarios (por ejemplo `São Paulo` o `Washington D.C.`).
3. Conecta la base al proyecto para los entornos **Production**, **Preview** y **Development**.
4. Vercel crea automáticamente las variables `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y otras `PG*`/`POSTGRES_*`. La aplicación solo usa **`DATABASE_URL`**.

### 4.4 Conectar el almacenamiento de PDFs (Vercel Blob)

1. En **Storage → Create → Blob**.
2. Selecciona acceso **Public**. El código sube los PDFs con `access: "public"`; si el store es privado, la subida falla. (Los PDFs son publicaciones oficiales públicas y la aplicación siempre los entrega a través de `/api/dga/pdf/[cve]`.)
3. Conecta el store al proyecto. Vercel crea la variable **`BLOB_READ_WRITE_TOKEN`**.

### 4.5 Crear las tablas

1. Abre la consola de Neon (en Vercel: **Storage → tu base → Open in Neon**) y entra al **SQL Editor**.
2. Copia y ejecuta el contenido completo de **`scripts/001-schema-completo.sql`**. Crea las 11 tablas e índices; es idempotente (se puede ejecutar más de una vez sin perder datos).
3. Copia y ejecuta **`scripts/002-reglas-dga-iniciales.sql`**. Carga las 14 reglas de clasificación DGA por defecto. **Ejecútalo una sola vez**: si lo repites, duplica las reglas.
4. `scripts/003-publicaciones-dga.sql` ya está incluido dentro del 001; no es necesario ejecutarlo en una instalación nueva (se conserva como historial de la migración).
5. Comprueba con:

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name;
   ```

   Deben aparecer: `auditoria`, `auditoria_documentos`, `coincidencias`, `documentos_cve`, `ejecuciones_descarga`, `ejecuciones_scraping`, `expedientes`, `importaciones_dga`, `publicaciones`, `publicaciones_dga`, `reglas_dga`.

### 4.6 Desplegar

1. En Vercel ve a **Deployments → Redeploy** (o haz un *push* a la rama `main`).
2. Espera a que el estado sea **Ready** y abre la URL del proyecto.
3. Continúa con la [verificación](#8-verificación-posterior-a-la-instalación).

> Desde aquí, cada *push* a `main` vuelve a desplegar automáticamente.

---

## 5. Opción B — Instalación local o en servidor propio

### 5.1 Clonar e instalar dependencias

```bash
git clone https://github.com/<tu-organizacion>/busqueda-diario-oficial.git
cd busqueda-diario-oficial

corepack enable          # activa pnpm con la versión declarada en package.json
pnpm install             # instala dependencias según pnpm-lock.yaml
```

> La librería de Excel (`xlsx`) se instala desde el CDN oficial de SheetJS (`cdn.sheetjs.com`), no desde npm, porque la versión de npm tiene vulnerabilidades conocidas. El servidor debe poder acceder a ese dominio durante `pnpm install`.

### 5.2 Base de datos

Puedes usar una base Neon (recomendado, aunque el sistema corra fuera de Vercel) o un PostgreSQL 15+ propio.

Con PostgreSQL propio:

```bash
createdb diario_oficial
psql "postgresql://usuario:clave@localhost:5432/diario_oficial" -f scripts/001-schema-completo.sql
psql "postgresql://usuario:clave@localhost:5432/diario_oficial" -f scripts/002-reglas-dga-iniciales.sql
```

Con Neon: ejecuta los mismos dos scripts en el SQL Editor (ver §4.5).

### 5.3 Almacenamiento de PDFs

El módulo de descarga usa Vercel Blob también en una instalación local. Crea un store **público** en Vercel (§4.4) y copia su token desde **Storage → tu store → .env.local**. Sin este token todo funciona salvo la descarga de PDFs.

### 5.4 Navegador Chromium

- **Linux x64** (incluye servidores y contenedores): no hay que hacer nada; `@sparticuz/chromium` trae su propio binario.
- **Windows o macOS**: ese binario no sirve. Instala Google Chrome o Chromium e indica su ruta en `CHROMIUM_EXECUTABLE_PATH`:

  | Sistema | Ruta habitual |
  |---|---|
  | Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
  | macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
  | Linux (opcional) | `/usr/bin/chromium` o `/usr/bin/google-chrome` |

  En Linux ARM (por ejemplo Raspberry Pi o servidores Graviton) también debes usar esta variable con un Chromium instalado con el gestor de paquetes.

### 5.5 Variables de entorno

Copia la plantilla y complétala:

```bash
cp .env.example .env.local
```

```dotenv
DATABASE_URL=postgresql://usuario:clave@host:5432/basedatos?sslmode=require
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxx
# Solo Windows/macOS/Linux ARM:
CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

`.env.local` está en `.gitignore`: **nunca lo subas al repositorio**.

### 5.6 Ejecutar

Modo desarrollo (recarga automática):

```bash
pnpm dev
# abre http://localhost:3000
```

Modo producción:

```bash
pnpm build
pnpm start            # escucha en el puerto 3000 (cambiar con: pnpm start -p 8080)
```

### 5.7 Dejarlo como servicio (servidor Linux)

Ejemplo con **systemd** (`/etc/systemd/system/diario-oficial.service`):

```ini
[Unit]
Description=Sistema de busqueda Diario Oficial
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/busqueda-diario-oficial
EnvironmentFile=/opt/busqueda-diario-oficial/.env.local
Environment=NODE_ENV=production
ExecStart=/usr/bin/env pnpm start -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now diario-oficial
sudo journalctl -u diario-oficial -f     # ver logs
```

Si se publica en internet, ponlo detrás de un proxy inverso (Nginx, Caddy) con HTTPS. Con Nginx, aumenta el tiempo de espera para la importación de Excel grandes:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    client_max_body_size 50m;
}
```

> En un servidor propio no existen los límites de duración de Vercel (§11): las búsquedas de meses completos terminan sin cortes, siempre que el proceso no se reinicie a mitad de camino.

---

## 6. Base de datos: scripts y tablas

| Script | Cuándo ejecutarlo |
|---|---|
| `scripts/001-schema-completo.sql` | Siempre en una instalación nueva. Idempotente (`CREATE ... IF NOT EXISTS`). |
| `scripts/002-reglas-dga-iniciales.sql` | Una sola vez, en una instalación nueva. |
| `scripts/003-publicaciones-dga.sql` | Solo para actualizar una instalación antigua que todavía no tenga el módulo DGA. |

| Tabla | Contenido |
|---|---|
| `expedientes` | Expedientes importados desde Excel (N°, solicitante, RUT, fechas, región, comuna, estado). |
| `publicaciones` | Publicaciones leídas del Diario Oficial durante las búsquedas. |
| `coincidencias` | Cruce expediente ↔ publicación con puntaje, motivos y estado de revisión. |
| `ejecuciones_scraping` | Historial y avance de cada búsqueda (incluye fechas con error). |
| `auditoria` | Acciones sobre expedientes y coincidencias. |
| `importaciones_dga` | Historial de cada Excel de publicaciones DGA importado. |
| `publicaciones_dga` | Cada registro (ID_DOE) importado, con su clasificación y los datos originales del Excel. |
| `documentos_cve` | Un registro por CVE con el estado del PDF (pendiente, descargado, no disponible, error). |
| `reglas_dga` | Reglas de clasificación (campo, patrón, incluir/excluir, prioridad). |
| `ejecuciones_descarga` | Historial y avance de cada descarga de PDFs. |
| `auditoria_documentos` | Acciones del módulo DGA (importaciones, descargas, cambios de reglas). |

---

## 7. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL. En Vercel la crea la integración de Neon. |
| `BLOB_READ_WRITE_TOKEN` | Sí, para descargar PDFs | Token del store de Vercel Blob (público). En Vercel la crea la integración de Blob. |
| `CHROMIUM_EXECUTABLE_PATH` | Solo Windows / macOS / Linux ARM | Ruta al ejecutable de Chrome/Chromium. Si no se define, se usa el binario de `@sparticuz/chromium` (Linux x64). |

Las demás variables que crea Neon (`PGHOST`, `POSTGRES_URL`, etc.) no son usadas por la aplicación, pero no molestan.

---

## 8. Verificación posterior a la instalación

Marca cada punto:

- [ ] La página `/` carga y muestra el panel de expedientes (con 0 expedientes en una instalación nueva).
- [ ] La página `/publicaciones` carga con los contadores en 0.
- [ ] `/publicaciones/reglas` muestra las **14 reglas** iniciales.
- [ ] Importar un Excel de expedientes funciona y los expedientes aparecen en la tabla.
- [ ] **Ejecutar búsqueda** con un rango de **1 día hábil** termina y muestra "publicaciones revisadas" mayor que 0. Si muestra 0 y la fecha aparece "con error", revisa §13 (Chromium).
- [ ] Importar un Excel DGA muestra el resumen (registros, DGA, nuevos, actualizados).
- [ ] **Descargar PDF pendientes** descarga al menos un PDF y el enlace del CVE lo abre.

---

## 9. Primer uso: carga inicial de datos

1. **Expedientes** (`/`): botón **Importar Excel** → seleccionar el archivo de expedientes. Si un N° de expediente ya existe, se actualiza en vez de duplicarse.
2. **Búsqueda** (`/`): botón **Ejecutar búsqueda** → elegir un rango de fechas. Puedes cerrar el diálogo: la búsqueda sigue en segundo plano y, al volver a abrirlo, retoma el avance.
3. **Revisión**: entrar a cada expediente con coincidencias y **confirmar** o **rechazar**. Exportar con **Exportar Excel**.
4. **Publicaciones DGA** (`/publicaciones`): **Importar Excel** (admite varios archivos a la vez). Los registros se identifican por `ID_DOE`: volver a importar el mismo archivo actualiza, no duplica. Se guardan todos los registros, sean DGA o no; el filtro "Competencia DGA" permite ver solo los relevantes.
5. **PDFs**: botón **Descargar PDF pendientes**. Procesa todos los CVE en estado pendiente o con error, fecha por fecha. Un CVE ya descargado nunca se vuelve a descargar. Los que fallan se pueden reintentar individualmente desde la tabla.
6. **Reglas** (`/publicaciones/reglas`): ajustar o agregar reglas y pulsar **Reclasificar** para aplicarlas a todo lo ya importado.

---

## 10. Formato de los archivos Excel

Solo se admite **.xlsx** (no `.xls` antiguo; si tienes uno, ábrelo en Excel y guárdalo como `.xlsx`).

### 10.1 Excel de expedientes

Se lee la hoja cuyo nombre contenga "resumen", "expediente" o "coincidencia" (o la primera hoja). Los encabezados se reconocen sin importar mayúsculas, tildes ni espacios:

| Dato | Encabezados aceptados |
|---|---|
| N° de expediente (**obligatorio**) | `Expediente`, `N° Expediente`, `Número Expediente`, `Código Expediente` |
| Solicitante | `Nombre del Solicitante`, `Solicitante`, `Interesado` |
| RUT | `RUT`, `RUT Solicitante` |
| Fecha de solicitud | `Fecha Solicitud`, `Fecha de Solicitud`, `Fecha` |
| Fecha de asignación | `Fecha Asignación` |
| Comentarios | `Comentarios`, `Observaciones`, `Notas` |
| Región / Provincia / Comuna | `Región`, `Provincia`, `Comuna` |
| Tipo de solicitud | `Tipo Solicitud`, `Tipo de Derecho` |
| Fuente de agua | `Fuente de Agua`, `Acuífero`, `Fuente` |
| Caudal | `Caudal`, `Caudal Solicitado` |

Fechas: celdas de fecha de Excel o texto `dd-mm-aaaa` / `dd/mm/aaaa`.

### 10.2 Excel de publicaciones DGA

Se leen **todas las hojas**. Columnas (nombres exactos, en mayúsculas):

`ID_DOE` (**obligatorio**; filas sin él se ignoran), `CVE`, `FECPUB`, `CUERPO`, `TITULO`, `TIPOSOL`, `SOLICITANTE`, `RUT`, `REGION`, `PROVINCIA`, `COMUNA`, `TEXTO`.

Cualquier otra columna se guarda igualmente en `datos_originales`. `FECPUB` acepta fecha de Excel, `dd-mm-aaaa` o `aaaa-mm-dd`.

---

## 11. Límites de duración y recomendaciones de operación

En Vercel, cada función tiene un tiempo máximo de ejecución que depende del plan (con Fluid Compute, por defecto 300 s; en Pro se puede ampliar). Las búsquedas y descargas corren en segundo plano dentro de ese límite. Como referencia, una búsqueda de un mes completo tomó unos 15 minutos.

Recomendaciones:

- En Vercel, buscar en **rangos de pocos días** (por ejemplo una semana) en lugar de meses completos.
- Si una descarga de PDFs se corta, queda marcada como **interrumpida** tras 10 minutos sin avance; basta con pulsar de nuevo **Descargar PDF pendientes**: continúa con lo que faltaba.
- Si una búsqueda deja **fechas con error**, vuelve a ejecutarla solo para esas fechas.
- El sitio del Diario Oficial puede bloquear temporalmente si recibe demasiadas consultas seguidas; el sistema ya espera entre fechas, pero evita lanzar varias búsquedas grandes en paralelo.
- Para procesar meses completos sin cortes, usa la instalación en servidor propio (§5).

---

## 12. Actualización, respaldo y mantenimiento

**Actualizar el código**

- Vercel: hacer *merge* a `main`; se despliega solo.
- Servidor propio:

  ```bash
  git pull
  pnpm install
  pnpm build
  sudo systemctl restart diario-oficial
  ```

  Si la actualización incluye un nuevo script en `scripts/`, ejecútalo antes de reiniciar.

**Respaldos**

- Neon guarda historial (*point-in-time restore*) según el plan; puedes crear *branches* de respaldo desde su consola.
- PostgreSQL propio: `pg_dump "$DATABASE_URL" > respaldo-$(date +%F).sql` (programarlo con cron).
- Los PDFs quedan en Vercel Blob; su ubicación está en `documentos_cve.blob_pathname`.

**Limpieza**

- No hay tareas periódicas obligatorias. Las tablas de auditoría crecen con el uso; se pueden archivar registros antiguos si fuera necesario.

---

## 13. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Error al cargar cualquier página: `connection refused` / `password authentication failed` | `DATABASE_URL` mal configurada | Revisa la variable; en Neon debe terminar en `?sslmode=require`. |
| `relation "..." does not exist` | No se ejecutaron los scripts | Ejecuta `scripts/001-schema-completo.sql`. |
| La búsqueda termina con 0 publicaciones y todas las fechas "con error" | Chromium no pudo iniciarse | En Windows/macOS define `CHROMIUM_EXECUTABLE_PATH` (§5.4). En Linux revisa los logs del servidor. |
| `Failed to launch the browser process` / `libnss3.so` no encontrado (Linux propio) | Faltan librerías del sistema | `sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0` o instala `chromium` y usa `CHROMIUM_EXECUTABLE_PATH`. |
| Algunas fechas quedan "con error" de forma aleatoria | Bloqueo temporal del sitio o un fallo puntual del navegador | Espera unos minutos y reintenta solo esas fechas. |
| La descarga de PDFs falla con error de acceso al Blob | Store privado o token ausente | Usa un store **público** y verifica `BLOB_READ_WRITE_TOKEN`. |
| La descarga queda "en progreso" para siempre | El servidor se reinició a mitad del proceso | Tras 10 min sin avance se marca como interrumpida; vuelve a pulsar **Descargar PDF pendientes**. |
| CVE en estado **no disponible** | El sumario de esa fecha no tiene enlace PDF para ese CVE (o la fecha del Excel no coincide) | Revisa la `FECPUB` del registro y reintenta. |
| "An unexpected response was received from the server" tras un despliegue | La pestaña tenía abierta la versión anterior | Recarga la página. |
| `pnpm install` falla en `xlsx` | Sin acceso a `cdn.sheetjs.com` | Permite ese dominio en el firewall/proxy. |
| El Excel no importa ninguna fila | Encabezados distintos o archivo `.xls` | Revisa §10 y guarda como `.xlsx`. |

Para ver errores detallados:

- **Vercel**: proyecto → **Logs** (filtrar por la ruta o por "error").
- **Servidor propio**: `journalctl -u diario-oficial -f` o la consola donde corre `pnpm start`.
