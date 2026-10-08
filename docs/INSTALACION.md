# Guía de instalación en servidor propio — Sistema de Búsqueda en el Diario Oficial (DGA)

Esta guía explica cómo instalar el sistema **en infraestructura propia** (servidor físico, máquina virtual o equipo de la institución), **sin depender de Vercel ni de servicios en la nube**. Todo queda en el servidor: la aplicación, la base de datos PostgreSQL y los PDFs descargados.

Está escrita para que la siga un administrador de sistemas sin conocimiento previo del proyecto. Los comandos están probados para **Ubuntu Server 24.04 LTS** (sirven igual en Ubuntu 22.04 y Debian 12). Al final hay notas para Windows Server.

---

## Índice

1. [Qué hace el sistema](#1-qué-hace-el-sistema)
2. [Arquitectura](#2-arquitectura)
3. [Requisitos del servidor](#3-requisitos-del-servidor)
4. [Paso 1 — Preparar el sistema operativo](#4-paso-1--preparar-el-sistema-operativo)
5. [Paso 2 — Instalar Node.js y pnpm](#5-paso-2--instalar-nodejs-y-pnpm)
6. [Paso 3 — Instalar y configurar PostgreSQL](#6-paso-3--instalar-y-configurar-postgresql)
7. [Paso 4 — Instalar Chromium y sus librerías](#7-paso-4--instalar-chromium-y-sus-librerías)
8. [Paso 5 — Obtener el código e instalar dependencias](#8-paso-5--obtener-el-código-e-instalar-dependencias)
9. [Paso 6 — Crear las tablas](#9-paso-6--crear-las-tablas)
10. [Paso 7 — Configurar variables de entorno](#10-paso-7--configurar-variables-de-entorno)
11. [Paso 8 — Compilar y probar](#11-paso-8--compilar-y-probar)
12. [Paso 9 — Dejarlo como servicio (systemd)](#12-paso-9--dejarlo-como-servicio-systemd)
13. [Paso 10 — Proxy inverso con HTTPS (Nginx)](#13-paso-10--proxy-inverso-con-https-nginx)
14. [Paso 11 — Firewall](#14-paso-11--firewall)
15. [Verificación final](#15-verificación-final)
16. [Primer uso: carga inicial de datos](#16-primer-uso-carga-inicial-de-datos)
17. [Formato de los archivos Excel](#17-formato-de-los-archivos-excel)
18. [Respaldos](#18-respaldos)
19. [Actualizar el sistema](#19-actualizar-el-sistema)
20. [Instalación en Windows Server](#20-instalación-en-windows-server)
21. [Solución de problemas](#21-solución-de-problemas)
22. [Referencia rápida](#22-referencia-rápida)

---

## 1. Qué hace el sistema

| Módulo | Ruta | Función |
|---|---|---|
| **Expedientes** | `/` | Importa un Excel de expedientes (N°, solicitante, RUT, fechas, región, comuna…), recorre el Diario Oficial por un rango de fechas y detecta publicaciones que coinciden con cada expediente (por N° de expediente, RUT, nombre y N° de resolución). Las coincidencias se confirman o rechazan a mano y se exportan a Excel. |
| **Publicaciones DGA** | `/publicaciones` | Importa los Excel de publicaciones (ID_DOE, CVE, FECPUB…), clasifica cada registro como competencia DGA o no con reglas editables, y descarga y guarda el PDF de cada CVE una sola vez. Incluye filtros, auditoría y edición de reglas en `/publicaciones/reglas`. |

---

## 2. Arquitectura

```
Usuarios (navegador)
       │  HTTPS (443)
       ▼
   Nginx (proxy inverso, certificado TLS)
       │  HTTP local (127.0.0.1:3000)
       ▼
   Aplicación Next.js 16 (Node.js, servicio systemd "diario-oficial")
       ├── PostgreSQL local (127.0.0.1:5432)  → expedientes, publicaciones, coincidencias, reglas, auditoría
       ├── Disco local (/var/lib/diario-oficial/pdfs) → PDFs descargados
       └── Chromium headless → https://www.diariooficial.interior.gob.cl (salida a internet)
```

Puntos clave:

- **Un solo proceso Node.js** sirve la interfaz, las rutas API y ejecuta los trabajos largos (búsquedas y descargas) en segundo plano.
- **PostgreSQL**: el sistema usa el driver estándar `pg`, así que funciona con cualquier PostgreSQL 15 o superior.
- **PDFs en disco local**: si no se configura Vercel Blob, los PDFs se guardan automáticamente en una carpeta del servidor (`PDF_STORAGE_DIR`).
- **Chromium**: el sitio del Diario Oficial tiene un desafío anti-bot que una petición HTTP simple no resuelve. Por eso el sistema abre un navegador Chromium real, sin ventana.
- **Sin límites de tiempo**: en un servidor propio una búsqueda de un mes completo (unos 15 minutos) termina sin cortes, siempre que el servicio no se reinicie a mitad del proceso.

---

## 3. Requisitos del servidor

### 3.1 Hardware mínimo

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 núcleos x86-64 | 4 núcleos |
| RAM | 4 GB | 8 GB (cada navegador Chromium usa 300–500 MB) |
| Disco | 20 GB | 50 GB o más. Cada PDF pesa unos 150–200 KB: 10.000 PDFs ocupan unos 2 GB. |

> **Arquitectura x86-64 (amd64)**. En servidores ARM (Graviton, Ampere, Raspberry Pi) también funciona, pero hay que usar el Chromium del sistema (ver §7.2).

### 3.2 Software

| Software | Versión |
|---|---|
| Sistema operativo | Ubuntu Server 22.04/24.04 LTS o Debian 12 (recomendado). También Windows Server 2019+ (§20). |
| Node.js | **20.9 o superior**. Recomendado **24 LTS**. |
| pnpm | La versión declarada en `package.json` (se activa con Corepack, viene con Node). |
| PostgreSQL | **15 o superior** (Ubuntu 24.04 trae la 16). |
| Git | Cualquier versión reciente. |
| Nginx | Opcional pero recomendado, para HTTPS. |

### 3.3 Red

| Dirección | Destino | Para qué |
|---|---|---|
| Salida 443 | `www.diariooficial.interior.gob.cl` | Leer sumarios y descargar PDFs (**imprescindible**) |
| Salida 443 | `registry.npmjs.org`, `cdn.sheetjs.com`, `github.com` | Solo durante la instalación y las actualizaciones |
| Entrada 443 (o 80) | Desde la red de los usuarios | Acceso a la aplicación |

Si el servidor sale a internet a través de un **proxy corporativo**, ver §21 ("Detrás de un proxy").

### 3.4 Datos que debes tener a mano

- Nombre DNS que tendrá el sistema (por ejemplo `diario-oficial.midominio.cl`), si se publicará con HTTPS.
- Una contraseña segura para el usuario de base de datos.
- Acceso al repositorio de código (GitHub) o una copia `.zip` del proyecto.

---

## 4. Paso 1 — Preparar el sistema operativo

Conéctate por SSH con un usuario con `sudo`.

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Herramientas básicas
sudo apt install -y git curl ca-certificates gnupg unzip

# Zona horaria de Chile (las fechas de publicación se manejan en hora chilena)
sudo timedatectl set-timezone America/Santiago
timedatectl    # verificar
```

Crear un **usuario de sistema** exclusivo para la aplicación (no inicia sesión, sin privilegios):

```bash
sudo useradd --system --create-home --home-dir /opt/diario-oficial --shell /usr/sbin/nologin diario
```

Crear la **carpeta de los PDFs** y dársela a ese usuario:

```bash
sudo mkdir -p /var/lib/diario-oficial/pdfs
sudo chown -R diario:diario /var/lib/diario-oficial
sudo chmod 750 /var/lib/diario-oficial
```

---

## 5. Paso 2 — Instalar Node.js y pnpm

Usar el repositorio oficial de NodeSource (no la versión de `apt` de Ubuntu, que es antigua):

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # debe mostrar v24.x.x
```

Activar **Corepack**, que instala automáticamente la versión de pnpm que pide el proyecto:

```bash
sudo corepack enable
```

---

## 6. Paso 3 — Instalar y configurar PostgreSQL

### 6.1 Instalar

```bash
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
psql --version     # 16.x en Ubuntu 24.04
```

### 6.2 Crear usuario y base de datos

Reemplaza `CAMBIAR_ESTA_CLAVE` por una contraseña segura (sin `@`, `:`, `/` ni `#`, para no tener que codificarla en la URL):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER diario WITH PASSWORD 'CAMBIAR_ESTA_CLAVE';
CREATE DATABASE diario_oficial OWNER diario ENCODING 'UTF8' TEMPLATE template0;
\c diario_oficial
GRANT ALL ON SCHEMA public TO diario;
SQL
```

### 6.3 Comprobar la conexión

```bash
psql "postgresql://diario:CAMBIAR_ESTA_CLAVE@127.0.0.1:5432/diario_oficial" -c "SELECT version();"
```

Si responde con la versión de PostgreSQL, la conexión funciona. Esa misma cadena es la que irá en `DATABASE_URL`.

> **Seguridad**: por defecto PostgreSQL solo escucha en `localhost`, que es lo correcto cuando la base y la aplicación están en el mismo servidor. No abras el puerto 5432 al exterior.

### 6.4 Base de datos en otro servidor (opcional)

Si la base está en un servidor distinto:

1. En el servidor de base de datos, edita `/etc/postgresql/16/main/postgresql.conf` → `listen_addresses = '*'` (o la IP concreta).
2. En `/etc/postgresql/16/main/pg_hba.conf` agrega solo la IP del servidor de aplicación:
   ```
   host  diario_oficial  diario  10.0.0.20/32  scram-sha-256
   ```
3. `sudo systemctl restart postgresql`.
4. En `DATABASE_URL` usa la IP del servidor de base. Si la conexión cruza una red no confiable, activa SSL en PostgreSQL y agrega `?sslmode=require` al final de la URL.

---

## 7. Paso 4 — Instalar Chromium y sus librerías

El sistema necesita un navegador Chromium para leer el Diario Oficial. Hay dos formas; usa **una**.

### 7.1 Opción recomendada en x86-64: Chromium incluido en el proyecto

El paquete `@sparticuz/chromium` (que se instala con las dependencias) trae su propio Chromium para Linux x86-64. Solo hay que instalar las librerías del sistema que necesita:

```bash
sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2t64 fonts-liberation
```

> En Ubuntu 22.04 o Debian 12 el paquete se llama `libasound2` en vez de `libasound2t64`.

No hace falta configurar `CHROMIUM_EXECUTABLE_PATH`.

### 7.2 Alternativa (obligatoria en ARM): Google Chrome o Chromium del sistema

**Ubuntu x86-64, con Google Chrome:**

```bash
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
  | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update && sudo apt install -y google-chrome-stable
which google-chrome     # /usr/bin/google-chrome
```

**Debian 12 (x86-64 o ARM):**

```bash
sudo apt install -y chromium
which chromium          # /usr/bin/chromium
```

> En Ubuntu, `apt install chromium-browser` instala un paquete *snap* que no funciona bien con un usuario de sistema. Usa Google Chrome (x86-64) o Debian.

Luego, en el Paso 7, define `CHROMIUM_EXECUTABLE_PATH` con la ruta que mostró `which`.

---

## 8. Paso 5 — Obtener el código e instalar dependencias

### 8.1 Descargar el código

Con Git (recomendado, facilita las actualizaciones):

```bash
sudo -u diario git clone https://github.com/<organizacion>/busqueda-diario-oficial.git /opt/diario-oficial/app
```

Si el repositorio es privado, usa un *token* de acceso personal de GitHub o una *deploy key* SSH.

Sin Git (copia `.zip`):

```bash
sudo unzip busqueda-diario-oficial.zip -d /opt/diario-oficial/
sudo mv /opt/diario-oficial/busqueda-diario-oficial-main /opt/diario-oficial/app
sudo chown -R diario:diario /opt/diario-oficial/app
```

Comprueba que existan las carpetas `app/`, `lib/`, `components/`, `scripts/` y el archivo `package.json`:

```bash
ls /opt/diario-oficial/app
```

### 8.2 Instalar dependencias

```bash
cd /opt/diario-oficial/app
sudo -u diario -H corepack pnpm install --frozen-lockfile
```

- `--frozen-lockfile` instala exactamente las versiones probadas (`pnpm-lock.yaml`).
- La librería de Excel (`xlsx`) se descarga desde `cdn.sheetjs.com` y no desde npm, porque la versión de npm tiene vulnerabilidades conocidas. El servidor debe poder acceder a ese dominio durante la instalación.
- La primera vez Corepack pregunta si descarga pnpm; responde `Y`. Para que no pregunte: `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.

---

## 9. Paso 6 — Crear las tablas

Desde la carpeta del proyecto:

```bash
cd /opt/diario-oficial/app
export DATABASE_URL="postgresql://diario:CAMBIAR_ESTA_CLAVE@127.0.0.1:5432/diario_oficial"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/001-schema-completo.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/002-reglas-dga-iniciales.sql
```

| Script | Qué hace | Cuándo |
|---|---|---|
| `001-schema-completo.sql` | Crea las 11 tablas e índices. Es idempotente: se puede volver a ejecutar sin perder datos. | Siempre en una instalación nueva. |
| `002-reglas-dga-iniciales.sql` | Carga las 14 reglas de clasificación DGA. | **Solo una vez.** Si se repite, duplica las reglas. |
| `003-publicaciones-dga.sql` | Migración del módulo DGA para instalaciones antiguas. | No hace falta en una instalación nueva (ya está dentro del 001). |

Comprobar:

```bash
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "SELECT count(*) FROM reglas_dga;"   # debe dar 14
```

Deben aparecer las tablas: `auditoria`, `auditoria_documentos`, `coincidencias`, `documentos_cve`, `ejecuciones_descarga`, `ejecuciones_scraping`, `expedientes`, `importaciones_dga`, `publicaciones`, `publicaciones_dga`, `reglas_dga`.

---

## 10. Paso 7 — Configurar variables de entorno

Crear el archivo de configuración **fuera** de la carpeta del código (así no se pisa al actualizar y no se sube a Git):

```bash
sudo mkdir -p /etc/diario-oficial
sudo nano /etc/diario-oficial/diario-oficial.env
```

Contenido:

```dotenv
# --- Obligatoria ---
DATABASE_URL=postgresql://diario:CAMBIAR_ESTA_CLAVE@127.0.0.1:5432/diario_oficial

# --- Almacenamiento de PDFs en disco local ---
STORAGE_DRIVER=local
PDF_STORAGE_DIR=/var/lib/diario-oficial/pdfs

# --- Solo si usaste la opción 7.2 (Chrome/Chromium del sistema) ---
# CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome

# --- Generales ---
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
TZ=America/Santiago
NEXT_TELEMETRY_DISABLED=1
```

Proteger el archivo (contiene la clave de la base):

```bash
sudo chown root:diario /etc/diario-oficial/diario-oficial.env
sudo chmod 640 /etc/diario-oficial/diario-oficial.env
```

### Referencia de variables

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `DATABASE_URL` | **Sí** | — | Cadena de conexión PostgreSQL: `postgresql://usuario:clave@host:puerto/base`. Agrega `?sslmode=require` si la base está en otro servidor con SSL. |
| `STORAGE_DRIVER` | No | `local` (si no hay `BLOB_READ_WRITE_TOKEN`) | `local` = PDFs en disco del servidor. `blob` = Vercel Blob (no se usa en esta instalación). |
| `PDF_STORAGE_DIR` | No | `<carpeta del proyecto>/storage/pdfs` | Carpeta donde se guardan los PDFs. Debe existir y el usuario `diario` debe poder escribir en ella. |
| `CHROMIUM_EXECUTABLE_PATH` | Solo con §7.2, en ARM o en Windows | — | Ruta al ejecutable de Chrome/Chromium. Si no se define, se usa el Chromium de `@sparticuz/chromium`. |
| `PORT` | No | `3000` | Puerto en que escucha la aplicación. |
| `HOSTNAME` | No | `0.0.0.0` | Usa `127.0.0.1` cuando hay Nginx delante, para que la aplicación no quede expuesta directamente. |
| `TZ` | Recomendada | Zona del sistema | `America/Santiago`. |
| `BLOB_READ_WRITE_TOKEN` | No | — | **No definirla** en una instalación propia. Si existe y no se fija `STORAGE_DRIVER=local`, los PDFs se enviarían a Vercel Blob. |

Los PDFs se guardan como `PDF_STORAGE_DIR/diario-oficial/AAAA/MM/<CVE>.pdf`, y la ruta relativa queda registrada en la columna `documentos_cve.blob_pathname`. La aplicación siempre los entrega a través de `/api/dga/pdf/<CVE>`, nunca como archivos estáticos.

---

## 11. Paso 8 — Compilar y probar

### 11.1 Compilar

```bash
cd /opt/diario-oficial/app
sudo -u diario -H bash -c 'set -a; source /etc/diario-oficial/diario-oficial.env; set +a; corepack pnpm build'
```

Debe terminar con una tabla de rutas (`/`, `/publicaciones`, `/api/...`) y sin errores. Tarda entre 1 y 3 minutos.

### 11.2 Prueba manual

```bash
sudo -u diario -H bash -c 'set -a; source /etc/diario-oficial/diario-oficial.env; set +a; HOSTNAME=0.0.0.0 corepack pnpm start'
```

Desde tu equipo abre `http://<IP-del-servidor>:3000` (si el firewall lo permite) o, en el mismo servidor:

```bash
curl -I http://127.0.0.1:3000/            # debe responder HTTP/1.1 200
curl -I http://127.0.0.1:3000/publicaciones
```

Detén la prueba con `Ctrl + C`.

### 11.3 Probar Chromium (recomendado)

Antes de seguir, confirma que el navegador arranca con el usuario del servicio:

```bash
cd /opt/diario-oficial/app
sudo -u diario -H bash -c 'set -a; source /etc/diario-oficial/diario-oficial.env; set +a; node -e "
const { chromium } = require(\"playwright-core\");
(async () => {
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH || await require(\"@sparticuz/chromium\").default.executablePath();
  const args = process.env.CHROMIUM_EXECUTABLE_PATH ? [] : require(\"@sparticuz/chromium\").default.args;
  const b = await chromium.launch({ executablePath: exe, args, headless: true });
  const p = await b.newPage();
  await p.goto(\"https://www.diariooficial.interior.gob.cl/\", { waitUntil: \"domcontentloaded\", timeout: 60000 });
  console.log(\"OK:\", await p.title());
  await b.close();
})().catch(e => { console.error(\"ERROR:\", e.message); process.exit(1); });
"'
```

Debe mostrar `OK:` con el título del sitio. Si falla, ver §21.

---

## 12. Paso 9 — Dejarlo como servicio (systemd)

Así la aplicación arranca sola al encender el servidor y se reinicia si falla.

```bash
sudo nano /etc/systemd/system/diario-oficial.service
```

```ini
[Unit]
Description=Sistema de busqueda Diario Oficial (DGA)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=diario
Group=diario
WorkingDirectory=/opt/diario-oficial/app
EnvironmentFile=/etc/diario-oficial/diario-oficial.env
Environment=COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ExecStart=/usr/bin/corepack pnpm start
Restart=on-failure
RestartSec=5
# Dar tiempo a que termine lo que esté procesando al detener el servicio
TimeoutStopSec=30

# Endurecimiento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/diario-oficial /opt/diario-oficial

[Install]
WantedBy=multi-user.target
```

Activar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now diario-oficial
sudo systemctl status diario-oficial      # debe decir "active (running)"
```

Comandos útiles:

```bash
sudo journalctl -u diario-oficial -f            # ver logs en vivo
sudo journalctl -u diario-oficial --since today # logs de hoy
sudo systemctl restart diario-oficial           # reiniciar
sudo systemctl stop diario-oficial              # detener
```

> **Importante**: reiniciar el servicio interrumpe las búsquedas o descargas en curso. Las descargas interrumpidas quedan marcadas tras 10 minutos sin avance y se retoman pulsando de nuevo **Descargar PDF pendientes**. Las búsquedas se vuelven a lanzar para las fechas que faltaron.

---

## 13. Paso 10 — Proxy inverso con HTTPS (Nginx)

### 13.1 Instalar Nginx

```bash
sudo apt install -y nginx
```

### 13.2 Configurar el sitio

```bash
sudo nano /etc/nginx/sites-available/diario-oficial
```

```nginx
server {
    listen 80;
    server_name diario-oficial.midominio.cl;

    # Excel de varios MB
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # La importación de Excel grandes puede tardar
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/diario-oficial /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 13.3 Certificado HTTPS

**Si el servidor es accesible desde internet** (Let's Encrypt, gratis):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d diario-oficial.midominio.cl
```

Certbot modifica la configuración para HTTPS y renueva el certificado automáticamente.

**Si es solo de red interna**: usa el certificado de la institución:

```nginx
server {
    listen 443 ssl;
    server_name diario-oficial.midominio.cl;
    ssl_certificate     /etc/ssl/certs/diario-oficial.crt;
    ssl_certificate_key /etc/ssl/private/diario-oficial.key;
    # ... mismo bloque "location /" de arriba ...
}
server {
    listen 80;
    server_name diario-oficial.midominio.cl;
    return 301 https://$host$request_uri;
}
```

### 13.4 Control de acceso

**El sistema no tiene inicio de sesión propio.** Cualquiera que llegue a la URL puede importar, borrar y descargar. Limita el acceso de alguna de estas formas:

- **Solo red interna / VPN** (lo más simple): no publicarlo en internet.
- **Restringir por IP** en Nginx, dentro de `location /`:
  ```nginx
  allow 10.0.0.0/8;
  allow 192.168.0.0/16;
  deny all;
  ```
- **Usuario y contraseña** (autenticación básica):
  ```bash
  sudo apt install -y apache2-utils
  sudo htpasswd -c /etc/nginx/.htpasswd-diario usuario1
  ```
  y dentro de `location /`:
  ```nginx
  auth_basic "Sistema Diario Oficial";
  auth_basic_user_file /etc/nginx/.htpasswd-diario;
  ```

---

## 14. Paso 11 — Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'     # puertos 80 y 443
sudo ufw enable
sudo ufw status
```

No abras los puertos 3000 (aplicación) ni 5432 (PostgreSQL).

---

## 15. Verificación final

Marca cada punto:

- [ ] `sudo systemctl status diario-oficial` muestra **active (running)**.
- [ ] `https://diario-oficial.midominio.cl/` carga el panel de expedientes (0 expedientes en una instalación nueva).
- [ ] `/publicaciones` carga con los contadores en 0.
- [ ] `/publicaciones/reglas` muestra las **14 reglas** iniciales.
- [ ] Importar un Excel de expedientes funciona y los expedientes aparecen en la tabla.
- [ ] **Ejecutar búsqueda** con **1 día hábil** termina con "publicaciones revisadas" mayor que 0. Si da 0 y la fecha queda "con error", revisa Chromium (§21).
- [ ] Importar un Excel DGA muestra el resumen (registros, DGA, nuevos, actualizados).
- [ ] **Descargar PDF pendientes** baja al menos un PDF, y el enlace del CVE lo abre en el navegador.
- [ ] El PDF aparece en disco: `sudo find /var/lib/diario-oficial/pdfs -name '*.pdf' | head`.
- [ ] Después de `sudo reboot`, el sistema vuelve a estar disponible sin intervención.

---

## 16. Primer uso: carga inicial de datos

1. **Expedientes** (`/`): **Importar Excel** → elegir el archivo. Si un N° de expediente ya existe, se actualiza en vez de duplicarse.
2. **Búsqueda** (`/`): **Ejecutar búsqueda** → elegir un rango de fechas. Puedes cerrar el diálogo: la búsqueda sigue en el servidor y, al volver a abrirlo, retoma el avance.
3. **Revisión**: en cada expediente con coincidencias, **confirmar** o **rechazar**. Exportar con **Exportar Excel**.
4. **Publicaciones DGA** (`/publicaciones`): **Importar Excel** (admite varios archivos a la vez). Los registros se identifican por `ID_DOE`: reimportar el mismo archivo actualiza, no duplica. Se guardan todos los registros, sean DGA o no; el filtro "Competencia DGA" muestra solo los relevantes.
5. **PDFs**: **Descargar PDF pendientes**. Procesa los CVE pendientes o con error, fecha por fecha. Un CVE ya descargado nunca se vuelve a descargar. Los que fallan se reintentan uno a uno desde la tabla.
6. **Reglas** (`/publicaciones/reglas`): ajustar o agregar reglas y pulsar **Reclasificar** para aplicarlas a lo ya importado.

Recomendaciones de operación:

- El sitio del Diario Oficial puede bloquear temporalmente si recibe muchas consultas seguidas. El sistema ya espera entre fechas, pero **no lances varias búsquedas grandes al mismo tiempo**.
- Si una búsqueda deja **fechas con error**, espera unos minutos y vuelve a buscar solo esas fechas.
- Lanza las búsquedas largas (meses completos) en horarios en que no vayas a reiniciar el servicio.

---

## 17. Formato de los archivos Excel

Solo se admite **.xlsx**. Un `.xls` antiguo se abre en Excel y se guarda como `.xlsx`.

### 17.1 Excel de expedientes

Se lee la hoja cuyo nombre contenga "resumen", "expediente" o "coincidencia" (si no hay, la primera). Los encabezados se reconocen sin importar mayúsculas, tildes ni espacios:

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

### 17.2 Excel de publicaciones DGA

Se leen **todas las hojas**. Columnas (nombres exactos, en mayúsculas):

`ID_DOE` (**obligatorio**; las filas sin él se ignoran), `CVE`, `FECPUB`, `CUERPO`, `TITULO`, `TIPOSOL`, `SOLICITANTE`, `RUT`, `REGION`, `PROVINCIA`, `COMUNA`, `TEXTO`.

Cualquier otra columna se guarda igual en `datos_originales`. `FECPUB` acepta fecha de Excel, `dd-mm-aaaa` o `aaaa-mm-dd`.

---

## 18. Respaldos

Hay que respaldar **dos cosas**: la base de datos y la carpeta de PDFs. El código se recupera desde Git.

### 18.1 Script de respaldo diario

```bash
sudo nano /usr/local/bin/respaldo-diario-oficial.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
DESTINO=/var/backups/diario-oficial
FECHA=$(date +%F)
mkdir -p "$DESTINO"

# 1. Base de datos (formato comprimido de pg_dump)
sudo -u postgres pg_dump -Fc diario_oficial > "$DESTINO/db-$FECHA.dump"

# 2. PDFs (incremental: solo copia lo nuevo)
rsync -a /var/lib/diario-oficial/pdfs/ "$DESTINO/pdfs/"

# 3. Conservar 30 días de respaldos de base
find "$DESTINO" -name 'db-*.dump' -mtime +30 -delete
```

```bash
sudo chmod +x /usr/local/bin/respaldo-diario-oficial.sh
sudo apt install -y rsync
sudo crontab -e
```

Agregar (todos los días a las 02:30):

```
30 2 * * * /usr/local/bin/respaldo-diario-oficial.sh >> /var/log/respaldo-diario-oficial.log 2>&1
```

> Copia `/var/backups/diario-oficial` a **otro equipo** o almacenamiento externo; un respaldo en el mismo disco no protege ante una falla del servidor.

### 18.2 Restaurar

```bash
sudo systemctl stop diario-oficial
sudo -u postgres dropdb diario_oficial
sudo -u postgres createdb -O diario diario_oficial
sudo -u postgres pg_restore -d diario_oficial --no-owner --role=diario /var/backups/diario-oficial/db-AAAA-MM-DD.dump
sudo rsync -a /var/backups/diario-oficial/pdfs/ /var/lib/diario-oficial/pdfs/
sudo chown -R diario:diario /var/lib/diario-oficial
sudo systemctl start diario-oficial
```

---

## 19. Actualizar el sistema

```bash
# 1. Respaldo previo
sudo /usr/local/bin/respaldo-diario-oficial.sh

# 2. Bajar la nueva versión
cd /opt/diario-oficial/app
sudo -u diario git pull

# 3. Si la actualización trae un script nuevo en scripts/, ejecutarlo
ls scripts/
# psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/00X-nuevo.sql

# 4. Dependencias y compilación
sudo -u diario -H corepack pnpm install --frozen-lockfile
sudo -u diario -H bash -c 'set -a; source /etc/diario-oficial/diario-oficial.env; set +a; corepack pnpm build'

# 5. Reiniciar (verificar antes que no haya búsquedas o descargas en curso)
sudo systemctl restart diario-oficial
sudo systemctl status diario-oficial
```

Si algo sale mal, vuelve a la versión anterior con `sudo -u diario git checkout <commit-anterior>` y repite los pasos 4 y 5.

---

## 20. Instalación en Windows Server

Funciona en Windows Server 2019/2022 y Windows 10/11. Las diferencias con Linux:

1. **Node.js 24 LTS**: instalador `.msi` desde [nodejs.org](https://nodejs.org). Luego, en PowerShell **como administrador**: `corepack enable`.
2. **PostgreSQL 16**: instalador desde [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). Crear usuario y base con *pgAdmin* o `psql` (mismos comandos que §6.2).
3. **Google Chrome**: instalarlo normalmente. El Chromium de `@sparticuz/chromium` **no funciona en Windows**, así que es obligatorio:
   ```dotenv
   CHROMIUM_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
   ```
4. **Código y dependencias** (PowerShell):
   ```powershell
   git clone https://github.com/<organizacion>/busqueda-diario-oficial.git C:\diario-oficial
   cd C:\diario-oficial
   pnpm install --frozen-lockfile
   ```
5. **Tablas**:
   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" "postgresql://diario:CLAVE@127.0.0.1:5432/diario_oficial" -f scripts\001-schema-completo.sql
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" "postgresql://diario:CLAVE@127.0.0.1:5432/diario_oficial" -f scripts\002-reglas-dga-iniciales.sql
   ```
6. **Variables**: crear `C:\diario-oficial\.env.local` (Next.js lo lee solo) con:
   ```dotenv
   DATABASE_URL=postgresql://diario:CLAVE@127.0.0.1:5432/diario_oficial
   STORAGE_DRIVER=local
   PDF_STORAGE_DIR=D:\diario-oficial-pdfs
   CHROMIUM_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
   TZ=America/Santiago
   ```
7. **Compilar y probar**: `pnpm build` y luego `pnpm start` → `http://localhost:3000`.
8. **Como servicio de Windows**: usar [NSSM](https://nssm.cc):
   ```powershell
   nssm install DiarioOficial "C:\Program Files\nodejs\node.exe" "C:\diario-oficial\node_modules\next\dist\bin\next start -p 3000"
   nssm set DiarioOficial AppDirectory C:\diario-oficial
   nssm set DiarioOficial AppEnvironmentExtra NODE_ENV=production
   nssm start DiarioOficial
   ```
9. **HTTPS**: usar IIS con *URL Rewrite* + *Application Request Routing* como proxy inverso hacia `http://127.0.0.1:3000`, o Nginx para Windows.
10. **Respaldos**: `pg_dump -Fc` programado con el Programador de tareas, más copia de la carpeta `PDF_STORAGE_DIR`.

---

## 21. Solución de problemas

Revisa siempre primero los logs: `sudo journalctl -u diario-oficial -n 200 --no-pager`.

| Síntoma | Causa probable | Solución |
|---|---|---|
| El servicio no arranca, log: `Could not find a production build` | No se compiló | Ejecuta el paso §11.1. |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL detenido | `sudo systemctl start postgresql`. |
| `password authentication failed for user "diario"` | Clave incorrecta en `DATABASE_URL` | Corrige el archivo `.env` o cambia la clave: `sudo -u postgres psql -c "ALTER USER diario PASSWORD '...'"`. |
| `relation "expedientes" does not exist` | No se crearon las tablas | Ejecuta `scripts/001-schema-completo.sql` (§9). |
| `permission denied for schema public` | Faltó el `GRANT` | `sudo -u postgres psql -d diario_oficial -c "GRANT ALL ON SCHEMA public TO diario;"`. |
| La búsqueda termina con 0 publicaciones y todas las fechas "con error" | Chromium no arranca | Ejecuta la prueba §11.3 y revisa el mensaje. |
| `error while loading shared libraries: libnss3.so` (u otra `.so`) | Faltan librerías | Instala la lista de §7.1. |
| `Failed to launch the browser process` en ARM | El Chromium incluido es solo x86-64 | Usa §7.2 y define `CHROMIUM_EXECUTABLE_PATH`. |
| Chromium se cierra solo / `Target page, context or browser has been closed` | Falta de RAM | Sube la RAM a 4 GB o más, o agrega swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |
| Algunas fechas "con error" al azar | Bloqueo temporal del sitio o fallo puntual | Espera unos minutos y reintenta solo esas fechas. |
| Descarga de PDF falla con `EACCES` | El usuario `diario` no puede escribir en la carpeta | `sudo chown -R diario:diario /var/lib/diario-oficial` y revisa `ReadWritePaths` en el servicio. |
| Los PDFs se van a Vercel Blob y no al disco | Existe `BLOB_READ_WRITE_TOKEN` | Quítala o fija `STORAGE_DRIVER=local`. |
| Al abrir un CVE: "PDF no encontrado" | El registro existe pero el archivo no está en `PDF_STORAGE_DIR` (se cambió la carpeta o se perdió) | Restaura la carpeta del respaldo, o marca el CVE como pendiente y vuelve a descargarlo. |
| Descarga "en progreso" para siempre | El servicio se reinició a mitad del proceso | Tras 10 min sin avance se marca como interrumpida; pulsa **Descargar PDF pendientes** otra vez. |
| CVE en estado **no disponible** | El sumario de esa fecha no tiene PDF para ese CVE, o la `FECPUB` del Excel no coincide | Revisa la fecha del registro y reintenta. |
| `413 Request Entity Too Large` al importar Excel | Límite de Nginx | Sube `client_max_body_size` (§13.2). |
| `504 Gateway Timeout` al importar Excel | Tiempo de espera de Nginx | Sube `proxy_read_timeout` (§13.2). |
| "An unexpected response was received from the server" | La pestaña se abrió antes de un reinicio o actualización | Recarga la página (F5). |
| `pnpm install` falla al bajar `xlsx` | Sin acceso a `cdn.sheetjs.com` | Permite ese dominio en el firewall o proxy. |
| Fechas desplazadas un día | Zona horaria incorrecta | `TZ=America/Santiago` en el `.env` y `timedatectl set-timezone America/Santiago`. |

### Detrás de un proxy corporativo

Agrega al archivo `.env` y exporta en la sesión durante la instalación:

```dotenv
HTTPS_PROXY=http://proxy.midominio.cl:8080
HTTP_PROXY=http://proxy.midominio.cl:8080
NO_PROXY=localhost,127.0.0.1
```

Para pnpm: `sudo -u diario -H corepack pnpm config set proxy http://proxy.midominio.cl:8080` (y lo mismo con `https-proxy`). El proxy debe permitir `www.diariooficial.interior.gob.cl`.

---

## 22. Referencia rápida

| Elemento | Ubicación |
|---|---|
| Código | `/opt/diario-oficial/app` |
| Configuración | `/etc/diario-oficial/diario-oficial.env` |
| PDFs | `/var/lib/diario-oficial/pdfs` |
| Servicio | `/etc/systemd/system/diario-oficial.service` |
| Sitio Nginx | `/etc/nginx/sites-available/diario-oficial` |
| Respaldos | `/var/backups/diario-oficial` |
| Script de respaldo | `/usr/local/bin/respaldo-diario-oficial.sh` |
| Logs de la aplicación | `sudo journalctl -u diario-oficial` |
| Logs de Nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |

| Acción | Comando |
|---|---|
| Ver estado | `sudo systemctl status diario-oficial` |
| Reiniciar | `sudo systemctl restart diario-oficial` |
| Ver logs en vivo | `sudo journalctl -u diario-oficial -f` |
| Respaldar ahora | `sudo /usr/local/bin/respaldo-diario-oficial.sh` |
| Entrar a la base | `sudo -u postgres psql diario_oficial` |
| Espacio usado por PDFs | `sudo du -sh /var/lib/diario-oficial/pdfs` |
