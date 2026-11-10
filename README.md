# Sistema ANPR ECU 911 · Despliegue

Control de acceso vehicular por reconocimiento automático de placas (ANPR). Este repositorio trae
solo lo necesario para compilar y poner en marcha el sistema con Docker Compose en un servidor
**Linux** o **Windows**. No incluye documentación de desarrollo, pruebas, datasets ni datos personales.

## Contenido

1. [Requisitos del sistema](#1-requisitos-del-sistema)
2. [Instalación en Linux](#2-instalación-en-linux)
3. [Instalación en Windows](#3-instalación-en-windows)
4. [Comprobar que el sistema está en marcha](#4-comprobar-que-el-sistema-está-en-marcha)
5. [Primer uso](#5-primer-uso)
6. [Cargar la lista blanca](#6-cargar-la-lista-blanca)
7. [Operación diaria](#7-operación-diaria)
8. [Servidor sin internet](#8-servidor-sin-internet)
9. [Solución de problemas](#9-solución-de-problemas)

### Qué hay en el repositorio

| Carpeta o archivo | Contenido |
|---|---|
| `docker-compose.prod.yml` | Los 5 servicios de producción |
| `.env.example` | Plantilla de configuración, con todas las variables comentadas |
| `backend/` | API REST y tiempo real (Node.js 24, TypeScript) |
| `frontend/` | Interfaz web (React + Vite, servida por nginx) |
| `services/anpr/` | Motor ANPR (Python 3.12, FastAPI): detector de placas, OCR y verificador, con los pesos de los modelos |
| `db/postgresql/` | Esquema de PostgreSQL 17. El backend lo aplica solo al arrancar |
| `mediamtx/` | Servidor de video (RTSP de las cámaras a WebRTC para el navegador) |
| `despliegue/` | Paquete para un servidor sin internet (`empaquetar.sh`) y sus scripts de instalación |
| `datos/` | Lugar donde se copia la lista blanca, que se entrega aparte (ver [sección 6](#6-cargar-la-lista-blanca)) |

### Servicios

| Servicio | Imagen | Función |
|---|---|---|
| `db` | `postgres:17-alpine` | Base de datos |
| `backend` | `anpr-backend:produccion` (se compila) | API, autenticación, listas, reportes |
| `frontend` | `anpr-frontend:produccion` (se compila) | Interfaz web en el puerto 3000 |
| `anpr` | `anpr-motor:produccion` (se compila) | Lee el video, detecta y reconoce las placas |
| `mediamtx` | `bluenviron/mediamtx:1.21.3` | Video en vivo de las cámaras |

---

## 1. Requisitos del sistema

### Hardware del servidor

| Recurso | Mínimo | Recomendado |
|---|---|---|
| Procesador | x86-64 de 4 núcleos con AVX2 | 8 núcleos o más (Intel Core i7/i9, Xeon, AMD Ryzen) |
| Memoria RAM | 8 GB | 16 GB (obligatorio en Windows, ver [3.2](#32-asignar-memoria-a-docker)) |
| Disco | 30 GB libres (SSD) | 100 GB SSD: la evidencia fotográfica crece con el uso |
| GPU | No hace falta | — |
| Cámaras | Cámara IP con salida RTSP (H.264) | 1080p apuntando al carril de ingreso |

Un motor analiza hasta 4 cámaras a la vez.

### Software

| | Linux (recomendado para operar 24/7) | Windows |
|---|---|---|
| Sistema operativo | Ubuntu Server 22.04 o 24.04 LTS de 64 bits (o Debian 12/13) | Windows 10 22H2 o Windows 11, de 64 bits |
| Contenedores | Docker Engine actual con el complemento Docker Compose v2 | Docker Desktop actual con el motor WSL 2 |
| Otros | `git` y `openssl` | Git para Windows; virtualización activada en la BIOS/UEFI |
| Navegador de los usuarios | Chrome, Edge o Firefox actualizados | Igual |

Probado en Windows 11 con Docker Desktop (Docker 28.5, Compose 2.40). Docker Engine en Linux es
gratuito; Docker Desktop exige una suscripción paga en organizaciones grandes (revise su licencia).

### Red

- IP fija para el servidor, con acceso a la red de las cámaras y a la del personal.
- Internet solo para descargar este repositorio y compilar las imágenes. En operación el sistema
  no se conecta a internet (salvo el correo SMTP, si se configura).
- Puertos que deben quedar abiertos hacia la red del personal:

| Puerto | Protocolo | Uso |
|---|---|---|
| 3000 | TCP | Interfaz web y API |
| 8000 | TCP | Cajas de detección dibujadas sobre el video |
| 8889 | TCP | Video en vivo (WebRTC) |
| 8189 | UDP y TCP | Medios del video en vivo (WebRTC) |

PostgreSQL (5433), la API directa (5000) y RTSP (8554) se publican solo en `127.0.0.1` del servidor.
No los abra en el firewall.

### Lo que se entrega aparte

- **`lista_blanca.sql`**: los vehículos autorizados. No está en el repositorio porque contiene datos
  personales (nombres, cédulas y placas). Se entrega por un medio privado y se carga en el paso 6.
- **Los secretos** (`.env`) no se entregan: se generan en el propio servidor durante la instalación.

---

## 2. Instalación en Linux

Los comandos son para Ubuntu Server. Ejecútelos con un usuario con `sudo`.

### 2.1 Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt-get install -y git openssl
```

Cierre la sesión y vuelva a entrar (para usar `docker` sin `sudo`) y compruebe:

```bash
docker compose version          # debe mostrar v2.x
```

### 2.2 Descargar el sistema

```bash
git clone https://github.com/ivanchulde/deteccion_placas.git
cd deteccion_placas
```

### 2.3 Crear la configuración (`.env`)

Cambie la IP del servidor y la red de las cámaras por las suyas y ejecute el bloque completo. Genera
secretos nuevos y llena las direcciones de red:

```bash
IP=192.168.1.50                  # IP del servidor en la red del personal
RED_CAMARAS=10.20.30.0/24        # red (CIDR) donde están las cámaras

cp .env.example .env
chmod 600 .env
sed -i \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|" \
  -e "s|^CAMARAS_CLAVE_CIFRADO=.*|CAMARAS_CLAVE_CIFRADO=$(openssl rand -base64 32)|" \
  -e "s|^ANPR_SERVICE_TOKEN=.*|ANPR_SERVICE_TOKEN=$(openssl rand -hex 32)|" \
  -e "s|^FRONTEND_URL=.*|FRONTEND_URL=http://$IP:3000|" \
  -e "s|^WEBRTC_HOSTS=.*|WEBRTC_HOSTS=127.0.0.1,$IP|" \
  -e "s|^WEBRTC_PUBLIC_URL=.*|WEBRTC_PUBLIC_URL=http://$IP:8889|" \
  -e "s|^ANPR_PUBLIC_URL=.*|ANPR_PUBLIC_URL=http://$IP:8000|" \
  -e "s|^CAMARAS_REDES_PERMITIDAS=.*|CAMARAS_REDES_PERMITIDAS=$RED_CAMARAS|" \
  .env
```

> **Guarde una copia del `.env` en un lugar seguro.** Si se pierde `CAMARAS_CLAVE_CIFRADO`, hay que
> volver a escribir las contraseñas de las cámaras y del correo.

Las demás variables (correo SMTP, dominios de correo permitidos, límites) son opcionales y están
explicadas dentro del mismo `.env`.

### 2.4 Compilar y arrancar

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La primera compilación tarda de 10 a 30 minutos según la conexión. Las imágenes ocupan unos 6 GB.

### 2.5 Abrir los puertos en el firewall

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 8889/tcp
sudo ufw allow 8189
```

Continúe en la [sección 4](#4-comprobar-que-el-sistema-está-en-marcha).

---

## 3. Instalación en Windows

Use **PowerShell** (no CMD) para todos los comandos.

### 3.1 Instalar los requisitos

1. Active la virtualización (Intel VT-x o AMD-V) en la BIOS/UEFI si no lo está.
2. En PowerShell **como administrador**, instale WSL 2 y reinicie el equipo:
   ```powershell
   wsl --install
   ```
3. Instale [Docker Desktop](https://www.docker.com/products/docker-desktop/) con la opción
   *Use WSL 2 based engine*. En *Settings › General* active *Start Docker Desktop when you sign in*.
4. Instale [Git para Windows](https://git-scm.com/download/win).
5. Compruebe en una ventana nueva de PowerShell:
   ```powershell
   docker compose version
   git --version
   ```

### 3.2 Asignar memoria a Docker

Por omisión, WSL 2 usa solo la mitad de la RAM del equipo y el motor ANPR puede quedarse sin memoria.
Cree el archivo `C:\Users\<su usuario>\.wslconfig` con este contenido (para un equipo de 16 GB):

```ini
[wsl2]
memory=12GB
processors=8
```

Aplíquelo cerrando WSL y volviendo a abrir Docker Desktop:

```powershell
wsl --shutdown
```

### 3.3 Descargar el sistema

```powershell
git clone https://github.com/ivanchulde/deteccion_placas.git
cd deteccion_placas
```

### 3.4 Crear la configuración (`.env`)

Cambie la IP del servidor y la red de las cámaras por las suyas y pegue el bloque completo en
PowerShell. Genera secretos nuevos y llena las direcciones de red:

```powershell
$IP = '192.168.1.50'               # IP del servidor en la red del personal (ipconfig)
$RED_CAMARAS = '10.20.30.0/24'     # red (CIDR) donde están las cámaras

Copy-Item .env.example .env
function Azar([int]$n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ,$b }
function Hex([int]$n) { -join ((Azar $n) | ForEach-Object { $_.ToString('x2') }) }
$valores = [ordered]@{
  DB_PASSWORD              = Hex 24
  JWT_SECRET               = Hex 48
  CAMARAS_CLAVE_CIFRADO    = [Convert]::ToBase64String((Azar 32))
  ANPR_SERVICE_TOKEN       = Hex 32
  FRONTEND_URL             = "http://${IP}:3000"
  WEBRTC_HOSTS             = "127.0.0.1,$IP"
  WEBRTC_PUBLIC_URL        = "http://${IP}:8889"
  ANPR_PUBLIC_URL          = "http://${IP}:8000"
  CAMARAS_REDES_PERMITIDAS = $RED_CAMARAS
}
$ruta = Join-Path (Get-Location) '.env'
$texto = [IO.File]::ReadAllText($ruta)
foreach ($k in $valores.Keys) { $texto = [regex]::Replace($texto, "(?m)^$k=.*$", "$k=$($valores[$k])") }
[IO.File]::WriteAllText($ruta, $texto, (New-Object Text.UTF8Encoding $false))
```

> **Guarde una copia del `.env` en un lugar seguro.** Si se pierde `CAMARAS_CLAVE_CIFRADO`, hay que
> volver a escribir las contraseñas de las cámaras y del correo.

### 3.5 Compilar y arrancar

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

La primera compilación tarda de 10 a 30 minutos según la conexión. Las imágenes ocupan unos 6 GB.

### 3.6 Abrir los puertos en el firewall

En PowerShell **como administrador**:

```powershell
New-NetFirewallRule -DisplayName 'ANPR TCP' -Direction Inbound -Protocol TCP -LocalPort 3000,8000,8889,8189 -Action Allow -Profile Domain,Private
New-NetFirewallRule -DisplayName 'ANPR UDP' -Direction Inbound -Protocol UDP -LocalPort 8189 -Action Allow -Profile Domain,Private
```

### 3.7 Para que funcione sin interrupciones

- Docker Desktop corre dentro de la sesión del usuario: el equipo debe iniciar sesión solo y
  Docker Desktop debe abrirse al iniciar. Los contenedores arrancan solos cuando Docker Desktop está listo.
- Desactive la suspensión del equipo mientras esté conectado a la corriente:
  ```powershell
  powercfg /change standby-timeout-ac 0
  ```

Continúe en la [sección 4](#4-comprobar-que-el-sistema-está-en-marcha).

---

## 4. Comprobar que el sistema está en marcha

Igual en Linux y en Windows:

```bash
docker compose -f docker-compose.prod.yml ps
```

Los servicios `db`, `backend`, `frontend` y `anpr` deben quedar en `healthy` y `mediamtx` en `Up`.
El motor (`anpr`) tarda hasta 5 minutos en quedar `healthy` mientras carga los modelos; es normal.

Luego abra desde otro equipo de la red: `http://<IP del servidor>:3000`

---

## 5. Primer uso

1. Al abrir el sistema por primera vez aparece **Configuración inicial**: cree la cuenta del
   administrador (contraseña de 10 caracteres o más, con mayúscula, minúscula, número y símbolo).
2. Cargue la lista blanca ([sección 6](#6-cargar-la-lista-blanca)).
3. En **Registro de cámaras**, registre la cámara con su URL RTSP, compruébela con **Ping** y
   **Play** y dibuje su **Zona de interés** sobre el carril (fuera de ella el motor no busca placas).
4. En **Usuarios**, cree las cuentas del personal con su rol: *Guardia* o *Gestor de permisos*.
   Si el personal se registra por su cuenta desde la pantalla de acceso, por omisión solo se aceptan
   correos `@ecu911.gob.ec`; se cambia en **Configuración** o con `ALLOWED_EMAIL_DOMAINS` en el `.env`.

---

## 6. Cargar la lista blanca

La lista blanca inicial (vehículos autorizados) se entrega aparte en el archivo `lista_blanca.sql`.
Se carga **una vez que el sistema arrancó** (paso 4), porque el backend crea las tablas al iniciar.

1. Copie el archivo en la carpeta `datos/` del repositorio: `datos/lista_blanca.sql`.
   Git ignora esa carpeta, así que el archivo nunca se sube por error.
2. Ejecute estos tres comandos desde la carpeta del repositorio. Son **iguales en Linux y en
   PowerShell**:

```bash
docker compose -f docker-compose.prod.yml cp datos/lista_blanca.sql db:/tmp/lista_blanca.sql
docker compose -f docker-compose.prod.yml exec db sh -c 'psql -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/lista_blanca.sql'
docker compose -f docker-compose.prod.yml exec db rm /tmp/lista_blanca.sql
```

Resultado esperado: una línea `INSERT 0 1` por vehículo y, al final, el total:

```
 vehiculos_en_lista_blanca
---------------------------
                       250
```

3. Compruébelo en la interfaz: **Control de accesos › Lista blanca**.

Se puede ejecutar más de una vez sin riesgo: las placas que ya existen no se duplican ni se
modifican (aparecen como `INSERT 0 0`). Después de cargarla, guarde el archivo en un lugar
protegido o bórrelo del servidor: contiene datos personales (LOPDP).

Los permisos nuevos se registran desde la interfaz (**Lista blanca** o **Gestión de Permisos**), que
también permite importarlos desde un archivo Excel (`.xlsx`) o `.csv`.

---

## 7. Operación diaria

Todos los comandos se ejecutan desde la carpeta del repositorio y son iguales en Linux y en Windows,
salvo donde se indica.

### Ver registros, detener y arrancar

```bash
docker compose -f docker-compose.prod.yml logs -f backend anpr     # Ctrl+C para salir
docker compose -f docker-compose.prod.yml stop
docker compose -f docker-compose.prod.yml start
docker compose -f docker-compose.prod.yml restart anpr
```

> **No use `docker compose down -v`**: los volúmenes `anpr-produccion_db_data`,
> `anpr-produccion_anpr_media` y `anpr-produccion_listas_evidencia` guardan la base de datos y la
> evidencia fotográfica. `down -v` los borra.

### Respaldo de la base de datos

```bash
mkdir respaldos                 # solo la primera vez
docker compose -f docker-compose.prod.yml exec db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/respaldo.dump'
```

Copie el respaldo con la fecha del día:

```bash
# Linux
docker compose -f docker-compose.prod.yml cp db:/tmp/respaldo.dump respaldos/ANPR_ECU911_$(date +%F).dump
```

```powershell
# Windows (PowerShell)
docker compose -f docker-compose.prod.yml cp db:/tmp/respaldo.dump "respaldos/ANPR_ECU911_$(Get-Date -Format yyyy-MM-dd).dump"
```

```bash
docker compose -f docker-compose.prod.yml exec db rm /tmp/respaldo.dump
```

Guarde los respaldos fuera del servidor. Contienen datos personales.

### Restaurar un respaldo

Reemplaza el contenido actual de la base por el del respaldo (cambie el nombre del archivo):

```bash
docker compose -f docker-compose.prod.yml stop frontend anpr backend
docker compose -f docker-compose.prod.yml cp respaldos/ANPR_ECU911_2026-11-10.dump db:/tmp/respaldo.dump
docker compose -f docker-compose.prod.yml exec db sh -c 'pg_restore --clean --if-exists --no-owner -U $POSTGRES_USER -d $POSTGRES_DB /tmp/respaldo.dump'
docker compose -f docker-compose.prod.yml exec db rm /tmp/respaldo.dump
docker compose -f docker-compose.prod.yml start backend anpr frontend
```

### Actualizar a una versión nueva

1. Haga un respaldo.
2. Descargue los cambios (su `.env` y la carpeta `datos/` no se tocan):
   ```bash
   git pull
   ```
3. Vuelva a compilar y arrancar:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

---

## 8. Servidor sin internet

Si el servidor de producción no tiene internet, compile en otro equipo que sí tenga (Linux, o Windows
con Git Bash) y lleve el paquete:

```bash
bash despliegue/empaquetar.sh /ruta/de/salida
```

El paquete trae las 5 imágenes ya compiladas, el compose, los scripts `instalar.sh` (Linux) e
`instalar.ps1` (Windows) y su propio `LEEME_DESPLIEGUE.txt` con los pasos. Tras instalar, cargue la
lista blanca como en la [sección 6](#6-cargar-la-lista-blanca), usando `docker compose` sin
`-f docker-compose.prod.yml` (el paquete trae un `docker-compose.yml`).

---

## 9. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Defina … en .env` al arrancar | Falta una variable obligatoria | Repita el paso 2.3 o 3.4, o complete la variable en `.env` |
| `anpr` sigue en `health: starting` | Está cargando los modelos | Espere hasta 5 minutos |
| Desde otro equipo no se puede iniciar sesión | `FRONTEND_URL` no tiene la IP real del servidor | Corríjala en `.env` y ejecute `docker compose -f docker-compose.prod.yml up -d` |
| La página abre pero no se ve el video | `WEBRTC_HOSTS` o `WEBRTC_PUBLIC_URL` sin la IP del servidor, o el puerto 8189 cerrado | Revise esas variables y el firewall (8189 UDP y TCP) |
| La cámara no se puede registrar por la red | Su IP no está en `CAMARAS_REDES_PERMITIDAS` | Agregue la red de las cámaras (CIDR) y reinicie con `up -d` |
| `relation "listablanca" does not exist` al cargar la lista | El sistema aún no arrancó por primera vez | Espere a que `backend` esté `healthy` y repita la sección 6 |
| `port is already allocated` | Otro programa usa el puerto 3000, 8000 u 8889 | Libérelo; el puerto web se puede cambiar con `PUERTO_WEB` en `.env` |
| Windows: el motor se reinicia solo | Poca memoria para WSL 2 | Revise el paso 3.2 |

Para ver el detalle de un error:

```bash
docker compose -f docker-compose.prod.yml logs --tail 100 backend
docker compose -f docker-compose.prod.yml logs --tail 100 anpr
```
