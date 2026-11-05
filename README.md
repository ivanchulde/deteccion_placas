# Sistema ANPR ECU 911 · despliegue

Control de acceso vehicular por reconocimiento de placas. Este repositorio trae solo lo necesario
para compilar y desplegar el sistema con Docker Compose en un servidor.

| Servicio | Contenido |
|---|---|
| `backend/` | API (Node.js 24, TypeScript) |
| `frontend/` | Interfaz web (React + Vite, servida por nginx) |
| `services/anpr/` | Motor ANPR (Python 3.12, FastAPI): detector de placas, OCR y verificador. Incluye los pesos de los detectores |
| `db/postgresql/` | Esquema de PostgreSQL 17 (el backend lo aplica al arrancar) |
| `mediamtx/` | Servidor de video (RTSP a WebRTC) |
| `despliegue/` | Paquete para un servidor sin internet (`empaquetar.sh`) y scripts de instalación |

## Requisitos

- Linux de 64 bits con Docker Engine y Compose v2 (recomendado Ubuntu Server 22.04 o 24.04), o
  Windows con Docker Desktop.
- CPU x86-64 de 4 núcleos con AVX2 (recomendado 8), 8 GB de RAM (recomendado 16) y 30 GB de disco.
  No hace falta GPU.
- IP fija con acceso a la red de las cámaras y a la del personal.
- Internet solo para compilar las imágenes. En operación el motor no se conecta a internet.

## Instalación

```bash
git clone https://github.com/ivanchulde/deteccion_placas.git
cd deteccion_placas
cp .env.example .env
chmod 600 .env
```

Complete en `.env` los secretos (genere valores nuevos para cada uno):

| Variable | Cómo generarla |
|---|---|
| `DB_PASSWORD` | Contraseña fuerte para PostgreSQL |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `CAMARAS_CLAVE_CIFRADO` | `openssl rand -base64 32` (guárdela: sin ella hay que volver a escribir las contraseñas de las cámaras) |
| `ANPR_SERVICE_TOKEN` | `openssl rand -base64 32` |

Y la red, también obligatoria. Reemplace `192.168.1.50` por la IP del servidor:

```dotenv
FRONTEND_URL=http://192.168.1.50:3000
WEBRTC_HOSTS=127.0.0.1,192.168.1.50
WEBRTC_PUBLIC_URL=http://192.168.1.50:8889
ANPR_PUBLIC_URL=http://192.168.1.50:8000
CAMARAS_REDES_PERMITIDAS=10.20.30.0/24   # solo la red de las cámaras
```

Compile y arranque:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

La primera compilación tarda de 10 a 30 minutos. El motor tarda hasta 5 minutos en quedar *healthy*
mientras carga los modelos.

Para un servidor sin internet, arme el paquete con las imágenes ya compiladas en un equipo con
internet (`bash despliegue/empaquetar.sh`) y siga el `LEEME_DESPLIEGUE.txt` que va dentro.

## Puertos

| Puerto | Uso |
|---|---|
| 3000/tcp | Interfaz web y API |
| 8000/tcp | Cajas de detección sobre el video |
| 8889/tcp | Video en vivo (WebRTC) |
| 8189/udp y tcp | Video en vivo (medios WebRTC) |

PostgreSQL (5433), la API directa (5000) y RTSP (8554) quedan solo en `127.0.0.1`. No los abra.

## Primer uso

1. Abra `http://<IP del servidor>:3000` y cree el primer administrador.
2. En **Registro de cámaras**, registre la cámara con su URL RTSP y pruébela con **Ping** y **Play**.
3. En **Zonas**, dibuje el área de detección sobre el carril.
4. En **Usuarios**, cree las cuentas del personal (Guardia, Gestor de permisos).

## Operación

```bash
docker compose -f docker-compose.prod.yml logs -f backend anpr
docker compose -f docker-compose.prod.yml stop
docker compose -f docker-compose.prod.yml start
```

No use `docker compose down -v`: los volúmenes `anpr-produccion_db_data` y
`anpr-produccion_anpr_media` guardan la base de datos y la evidencia fotográfica.

Respaldo de la base de datos:

```bash
mkdir -p respaldos
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > respaldos/ANPR_ECU911_$(date +%F).dump
```

Para actualizar: respalde, haga `git pull` (conserve su `.env`) y vuelva a ejecutar
`docker compose -f docker-compose.prod.yml up -d --build`.
