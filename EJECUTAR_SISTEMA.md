# Ejecutar el sistema ANPR en su computadora

Guía para descargar este repositorio y poner en marcha el sistema completo **en un solo equipo**,
para usarlo desde el navegador de ese mismo equipo (`http://localhost:3000`). Sirve para probarlo,
hacer una demostración o revisarlo.

Para instalarlo en un servidor y usarlo desde otros equipos de la red, siga el [README](README.md):
la única diferencia es que las direcciones llevan la IP del servidor en lugar de `localhost`.

## Contenido

1. [Requisitos](#1-requisitos)
2. [Descargar el sistema](#2-descargar-el-sistema)
3. [Crear la configuración (`.env`)](#3-crear-la-configuración-env)
4. [Compilar y arrancar](#4-compilar-y-arrancar)
5. [Abrir el sistema y crear el administrador](#5-abrir-el-sistema-y-crear-el-administrador)
6. [Conectar una cámara (opcional)](#6-conectar-una-cámara-opcional)
7. [Uso diario: detener, arrancar y ver registros](#7-uso-diario-detener-arrancar-y-ver-registros)
8. [Actualizar a una versión nueva](#8-actualizar-a-una-versión-nueva)
9. [Desinstalar](#9-desinstalar)
10. [Solución de problemas](#10-solución-de-problemas)

---

## 1. Requisitos

| | Mínimo | Recomendado |
|---|---|---|
| Sistema operativo | Windows 10 22H2 / Windows 11 (64 bits) o Ubuntu 22.04/24.04 | Igual |
| Procesador | x86-64 de 4 núcleos con AVX2 | 8 núcleos o más |
| Memoria RAM | 8 GB | 16 GB (en Windows, ver el paso 1.2) |
| Disco libre | 30 GB | 50 GB en SSD |
| Internet | Solo la primera vez, para descargar y compilar (~6 GB) | — |

No hace falta tarjeta gráfica (GPU): el reconocimiento corre en el procesador.

### 1.1 Programas

**Windows**

1. Active la virtualización (Intel VT-x o AMD-V) en la BIOS/UEFI si no lo está.
2. Instale WSL 2 en PowerShell **como administrador** y reinicie el equipo:
   ```powershell
   wsl --install
   ```
3. Instale [Docker Desktop](https://www.docker.com/products/docker-desktop/) con la opción
   *Use WSL 2 based engine* y ábralo.
4. Instale [Git para Windows](https://git-scm.com/download/win).

**Linux (Ubuntu)**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt-get install -y git openssl
```

Cierre la sesión y vuelva a entrar para usar `docker` sin `sudo`.

Compruebe en una terminal nueva (PowerShell en Windows):

```bash
docker compose version      # debe mostrar v2.x
git --version
```

### 1.2 Memoria para Docker (solo Windows)

Por omisión WSL 2 usa la mitad de la RAM y el motor de reconocimiento puede quedarse sin memoria.
Cree el archivo `C:\Users\<su usuario>\.wslconfig` con este contenido (para un equipo de 16 GB):

```ini
[wsl2]
memory=12GB
processors=8
```

Aplíquelo y vuelva a abrir Docker Desktop:

```powershell
wsl --shutdown
```

### 1.3 Puertos libres

El sistema usa estos puertos del equipo. Si otro programa ya ocupa alguno, ciérrelo antes de seguir:

| Puerto | Uso |
|---|---|
| 3000 | Sistema web (lo que se abre en el navegador) |
| 8000 | Recuadros de las placas sobre el video |
| 8889 y 8189 | Video en vivo de las cámaras |
| 5000, 5433 y 8554 | API, base de datos y RTSP (solo dentro del equipo) |

---

## 2. Descargar el sistema

Elija una carpeta (por ejemplo, Documentos) y ejecute:

```bash
git clone https://github.com/ivanchulde/deteccion_placas.git
cd deteccion_placas
```

Todos los comandos que siguen se ejecutan **desde la carpeta `deteccion_placas`**.

---

## 3. Crear la configuración (`.env`)

El archivo `.env` guarda las contraseñas internas del sistema. Se crea a partir de la plantilla
`.env.example`, que ya trae las direcciones de `localhost` para usarlo en el propio equipo. Solo hay
que generar los secretos: pegue el bloque completo que corresponda a su sistema.

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
function Azar([int]$n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ,$b }
function Hex([int]$n) { -join ((Azar $n) | ForEach-Object { $_.ToString('x2') }) }
$valores = [ordered]@{
  DB_PASSWORD           = Hex 24
  JWT_SECRET            = Hex 48
  CAMARAS_CLAVE_CIFRADO = [Convert]::ToBase64String((Azar 32))
  ANPR_SERVICE_TOKEN    = Hex 32
}
$ruta = Join-Path (Get-Location) '.env'
$texto = [IO.File]::ReadAllText($ruta)
foreach ($k in $valores.Keys) { $texto = [regex]::Replace($texto, "(?m)^$k=.*$", "$k=$($valores[$k])") }
[IO.File]::WriteAllText($ruta, $texto, (New-Object Text.UTF8Encoding $false))
```

**Linux (o Git Bash en Windows):**

```bash
cp .env.example .env
chmod 600 .env
sed -i \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|" \
  -e "s|^CAMARAS_CLAVE_CIFRADO=.*|CAMARAS_CLAVE_CIFRADO=$(openssl rand -base64 32)|" \
  -e "s|^ANPR_SERVICE_TOKEN=.*|ANPR_SERVICE_TOKEN=$(openssl rand -hex 32)|" \
  .env
```

> **No borre ni regenere el `.env` después del primer arranque.** La base de datos queda creada con
> esa contraseña, y las contraseñas de las cámaras y del correo se guardan cifradas con
> `CAMARAS_CLAVE_CIFRADO`. El `.env` nunca se sube a GitHub.

---

## 4. Compilar y arrancar

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La primera vez descarga y compila todo: tarda de **10 a 30 minutos** según la conexión. Las veces
siguientes arranca en segundos.

Compruebe el estado:

```bash
docker compose -f docker-compose.prod.yml ps
```

Debe ver `db`, `backend`, `frontend` y `anpr` como **`healthy`** y `mediamtx` como `Up`. El motor
(`anpr`) tarda hasta **5 minutos** en quedar `healthy` mientras carga los modelos: es normal.

---

## 5. Abrir el sistema y crear el administrador

1. Abra en el navegador: **<http://localhost:3000>**
2. La primera vez aparece **Configuración inicial**: cree la cuenta del administrador (contraseña de
   10 caracteres o más, con mayúscula, minúscula, número y símbolo).
3. Ingrese con esa cuenta. Desde **Usuarios** puede crear cuentas de *Guardia* y de *Gestor de
   permisos*.

Sin cámara ya puede usar el sistema: lista blanca y negra, gestión de permisos, registro manual de
ingresos y salidas, historial y reportes. El reconocimiento automático de placas necesita una cámara
(paso 6).

Si tiene el archivo de la lista blanca (`lista_blanca.sql`, se entrega aparte porque contiene datos
personales), cárguelo como indica la [sección 6 del README](README.md#6-cargar-la-lista-blanca).

---

## 6. Conectar una cámara (opcional)

La cámara debe ser IP, con salida RTSP (H.264) y estar en la misma red que el equipo.

1. **Registro de cámaras › Registrar cámara**: escriba la URL RTSP del flujo principal, por ejemplo
   `rtsp://usuario:contraseña@192.168.1.64:554/Streaming/Channels/101`. La contraseña se guarda cifrada.
2. Pruebe el enlace con **Ping** (red y RTSP) y **Play** (video real).
3. **Zonas**: dibuje el área del carril donde se buscan placas.
4. **Monitoreo**: en *Cámara que procesa el motor ANPR*, elija la cámara. Desde ese momento se ven el
   video, los recuadros de las placas y los registros de ingreso.

Por omisión se aceptan cámaras en redes privadas (10.x, 172.16–31.x, 192.168.x). Para limitarlo a
la red de las cámaras, ponga su rango en `CAMARAS_REDES_PERMITIDAS` dentro del `.env` (por ejemplo
`192.168.1.0/24`) y aplique con `docker compose -f docker-compose.prod.yml up -d`.

---

## 7. Uso diario: detener, arrancar y ver registros

```bash
docker compose -f docker-compose.prod.yml stop        # detener (conserva todos los datos)
docker compose -f docker-compose.prod.yml start       # volver a arrancar
docker compose -f docker-compose.prod.yml restart anpr  # reiniciar solo el motor
docker compose -f docker-compose.prod.yml logs -f backend anpr   # ver qué pasa (Ctrl+C para salir)
```

- Los contenedores tienen `restart: always`: si Docker Desktop (o Docker en Linux) está abierto, el
  sistema arranca solo al encender el equipo.
- En Windows, cerrar Docker Desktop detiene el sistema; al abrirlo vuelve a arrancar.

---

## 8. Actualizar a una versión nueva

Su `.env` y la carpeta `datos/` no se tocan al actualizar:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Antes de actualizar un equipo con datos reales, haga un respaldo de la base
([README, sección 7](README.md#respaldo-de-la-base-de-datos)).

---

## 9. Desinstalar

```bash
docker compose -f docker-compose.prod.yml down        # quita los contenedores y CONSERVA los datos
docker compose -f docker-compose.prod.yml down -v     # quita contenedores Y BORRA la base y las fotos
```

> `down -v` elimina para siempre los volúmenes `anpr-produccion_db_data`,
> `anpr-produccion_anpr_media` y `anpr-produccion_listas_evidencia`. Úselo solo si quiere empezar de cero.

Para liberar el espacio de las imágenes compiladas: `docker image prune -a`.

---

## 10. Solución de problemas

| Síntoma | Qué hacer |
|---|---|
| `error during connect … dockerDesktopLinuxEngine` | Docker Desktop no está abierto: ábralo y espere a que diga que el motor está en marcha |
| `Defina … en .env` al arrancar | Falta el `.env` o un secreto: repita el paso 3 desde la carpeta `deteccion_placas` |
| `port is already allocated` | Otro programa usa ese puerto. En Windows: `netstat -ano \| findstr :3000` muestra cuál. Si es otra copia del sistema, deténgala (`docker ps` lista los contenedores en marcha) |
| `anpr` sigue en `health: starting` | Está cargando los modelos: espere hasta 5 minutos |
| El motor se reinicia solo (Windows) | Poca memoria para WSL 2: revise el paso 1.2 |
| La página no abre en `localhost:3000` | Espere a que `frontend` esté `healthy` (paso 4) y recargue |
| No se puede iniciar sesión tras varios intentos | Límite de intentos por seguridad: espere unos minutos |
| La cámara no se deja registrar | Su IP no es privada o no está en `CAMARAS_REDES_PERMITIDAS` (paso 6) |
| Se ve la página pero no el video | La cámara no está asignada en **Monitoreo** o no responde al **Ping** |
| Quiere usarlo desde otro equipo de la red | Cambie `localhost` por la IP de este equipo en `FRONTEND_URL`, `WEBRTC_HOSTS`, `WEBRTC_PUBLIC_URL` y `ANPR_PUBLIC_URL` del `.env` (ver [README](README.md#34-crear-la-configuración-env)) y abra los puertos del firewall |

Para ver el detalle de un error:

```bash
docker compose -f docker-compose.prod.yml logs --tail 100 backend
docker compose -f docker-compose.prod.yml logs --tail 100 anpr
```
