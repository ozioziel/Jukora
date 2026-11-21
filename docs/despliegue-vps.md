# Despliegue en el VPS (Oracle Cloud ARM64)

Lo ejecuta el responsable. El VPS ya aloja otros proyectos: este despliegue **no** toca sus
contenedores ni su proxy; la web escucha solo en `127.0.0.1:6704` y el proxy existente la publica.

Orden recomendado: 1 → 9. Los secretos se escriben **solo** en el VPS o en GitHub, nunca en el
repositorio ni en chats.

## 1. Comprobar el VPS

```bash
uname -m                              # debe decir aarch64 (las imágenes se publican para linux/arm64)
docker --version && docker compose version
free -h && df -h                      # margen: API ~200 MB, web ~20 MB (Ollama opcional 4–6 GB)
```

Si falta Docker: seguir la guía oficial «Install Docker Engine on Ubuntu» (incluye el plugin
`docker compose`).

## 2. Usuario de despliegue y llave SSH dedicada

En el VPS (con tu usuario administrador):

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo mkdir -p /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
sudo mkdir -p /srv/penguinlab/apps/jukora && sudo chown deploy:deploy /srv/penguinlab/apps/jukora
```

En tu PC (PowerShell) crea una llave **solo para el despliegue**:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\jukora_deploy -C "deploy-jukora" -N ""
```

Copia el contenido de `jukora_deploy.pub` al VPS en `/home/deploy/.ssh/authorized_keys` y ajusta
permisos (`sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys`).
La parte privada (`jukora_deploy`, sin `.pub`) irá al secreto `VPS_SSH_KEY` de GitHub.

Obtén la huella del servidor para `VPS_KNOWN_HOSTS` (desde tu PC):

```powershell
ssh-keyscan -t ed25519 <IP-del-VPS>
```

## 3. Dominio gratuito con HTTPS

La sesión usa cookies seguras: hace falta HTTPS. Sin comprar dominio:

1. Entra a duckdns.org (con tu cuenta de GitHub), crea un subdominio (ej. `jukora`) y pon la IP
   pública del VPS → `jukora.duckdns.org`.
2. Firewall de Oracle: en la consola de OCI, Security List de la subred, permitir 80 y 443 (TCP).
   Las imágenes Ubuntu de Oracle también traen reglas `iptables`; si 80/443 no responden:
   ```bash
   sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT
   sudo netfilter-persistent save
   ```
   (Si el VPS ya sirve otros sitios por 80/443, esto ya está hecho.) **No** abrir 3000, 6704 ni 11434.

## 4. Proxy hacia la app

Añade un sitio en el proxy que ya usa el VPS.

**Nginx** (`/etc/nginx/sites-available/jukora`, luego enlazar a `sites-enabled`):

```nginx
server {
  server_name jukora.duckdns.org;
  location / {
    proxy_pass http://127.0.0.1:6704;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # eventos en vivo (SSE) de la búsqueda
    proxy_read_timeout 300s;
  }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jukora.duckdns.org      # certificado Let's Encrypt gratuito
```

**Caddy** (alternativa; HTTPS automático), en el `Caddyfile`:

```
jukora.duckdns.org {
  reverse_proxy 127.0.0.1:6704 {
    flush_interval -1
  }
}
```

## 5. Base de datos de producción (Supabase, plan gratuito)

1. supabase.com → New project (región cercana, ej. São Paulo). Guarda la contraseña de la base.
2. **Connect → Session pooler**: copia la cadena `postgresql://postgres.<ref>:<contraseña>@aws-…pooler.supabase.com:5432/postgres`.
   Usa el *Session pooler* (IPv4): la conexión directa es solo IPv6 y el VPS y GitHub Actions usan IPv4.
   Esa misma cadena sirve para `DATABASE_URL` (VPS) y para el secreto `SUPABASE_DB_URL` (GitHub).
3. **Project Settings → API keys**: copia la clave secreta (`service_role` / `sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY`.
   La URL del proyecto (`https://<ref>.supabase.co`) → `SUPABASE_URL`.
4. Las tablas, RLS y buckets los crea el CD al desplegar (aplica las migraciones pendientes, paso 9).
   Elige la región de Supabase más cercana al VPS (VPS en Santiago → São Paulo): cada consulta cruza esa distancia.
5. Datos de demostración (opcional, ficticios y etiquetados DEMO): después del primer despliegue,
   en Supabase → SQL Editor, pega el contenido de `supabase/seed.sql` y ejecútalo.

## 6. Carpeta y variables en el VPS

Como usuario `deploy`:

```bash
cd /srv/penguinlab/apps/jukora     # carpeta de la app (VPS_APP_DIR)
# copia deploy/docker-compose.prod.yml del repositorio a esta carpeta (ej. con scp desde tu PC)
nano .env.production
chmod 600 .env.production
```

Contenido de `.env.production` (demo en testnet):

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `APP_PUBLIC_URL` | `https://jukora.duckdns.org` |
| `API_PORT` | `3000` |
| `DEMO_MODE` | `true` |
| `DATABASE_URL` | cadena del *Session pooler* (paso 5) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | paso 5 |
| `SESSION_SECRET` | 48+ caracteres aleatorios: `openssl rand -base64 48` |
| `KYC_HMAC_SECRET` | otro valor aleatorio: `openssl rand -base64 48` |
| `STELLAR_NETWORK` | `testnet` |
| `STELLAR_RPC_URL` / `STELLAR_HORIZON_URL` | los de `.env.example` (testnet) |
| `PLATFORM_STELLAR_ADDRESS` / `PLATFORM_STELLAR_SECRET` | los de tu `.env` local (cuentas **de prueba**) |
| `ARBITER_STELLAR_ADDRESS` | el de tu `.env` local |
| `DEMO_TOKEN_CODE` / `DEMO_TOKEN_ISSUER` / `DEMO_TOKEN_CONTRACT_ID` / `DEMO_TOKEN_ISSUER_SECRET` | los de tu `.env` local |
| `TW_API_URL` / `TW_API_KEY` | Trustless Work testnet (cuando tengas la clave) |
| `POLLAR_SECRET_KEY` / `POLLAR_API_URL` | Pollar testnet (cuando la tengas) |
| `DIDIT_API_KEY` / `DIDIT_WORKFLOW_ID` / `DIDIT_WEBHOOK_SECRET` | Didit sandbox (cuando la tengas) |
| `AI_PROVIDER` | `demo` (o `groq` con `GROQ_API_KEY`) |
| `SEARCH_PROVIDER` | `none` (o `tavily` con `TAVILY_API_KEY`) |
| `SEARCH_DAILY_CREDIT_CAP` / `SEARCH_RUN_CREDIT_BUDGET` | `30` / `8` |
| `PLATFORM_FEE_BPS` / `PLATFORM_FEE_MIN` | `250` / `1` |

Lo que no tengas aún, déjalo vacío: la app lo muestra como «no configurado» en vez de fallar.

## 7. Acceso a las imágenes (GHCR)

Las imágenes `ghcr.io/<usuario>/jucumari-api` y `jucumari-web` son privadas por defecto. En GitHub →
Settings (de tu cuenta) → Developer settings → Personal access tokens → *Tokens (classic)*, crea uno
**solo** con `read:packages`. En el VPS, como `deploy`:

```bash
docker login ghcr.io -u <tu-usuario-de-github>      # pega el token cuando lo pida
```

## 8. GitHub: entorno y secretos

Settings del repositorio → **Environments → New environment** → `production`:

- **Sin «Required reviewers»**: el CD despliega solo cada vez que el CI pasa en `main`.
- **Deployment branches and tags** → *Selected branches and tags* → `main` (los secretos solo
  se usan desde `main`).
- **Environment secrets**: `VPS_HOST` (IP o `jukora.duckdns.org`), `VPS_USER` (`deploy`),
  `VPS_SSH_KEY` (llave privada del paso 2), `VPS_KNOWN_HOSTS` (salida de `ssh-keyscan`),
  `SUPABASE_DB_URL` (cadena del *Session pooler*).
- **Environment variables**: `VPS_APP_DIR` (por defecto `/srv/penguinlab/apps/jukora`), `VPS_WEB_PORT` (por defecto `6704`), `VITE_STELLAR_NETWORK=testnet`, `VITE_DEMO_MODE=true` y, cuando la
  tengas, `VITE_POLLAR_PUBLISHABLE_KEY` (pública).

## 9. Primer despliegue

Es automático: al mergear un PR en `main`, el CI corre y, si sale en verde, el CD construye las
imágenes, aplica las migraciones pendientes y despliega (etiqueta `sha-<commit>`). El primer build
tarda más (se llena la caché). Al terminar, el workflow comprueba `/api/health/ready`. Abre tu dominio.

Para publicar una versión con nombre (opcional):

```bash
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

y en GitHub → **Actions → CD → Run workflow**: `tag = v0.1.0` (rama `main`).

Comprobación manual en el VPS:

```bash
cd /srv/penguinlab/apps/jukora
# El Compose exige GHCR_OWNER e IMAGE_TAG (el CD los pasa en cada despliegue; a mano hay que darlos).
GHCR_OWNER=<owner> IMAGE_TAG=$(cat .current_tag) docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:6704/api/health/ready
```

Rollback: vuelve a ejecutar el CD con el tag anterior (queda guardado en `/srv/penguinlab/apps/jukora/.previous_tag`).
Detalle en `operacion-y-rollback.md`.

## 10. Ollama opcional (IA privada)

```bash
GHCR_OWNER=… IMAGE_TAG=… docker compose -f docker-compose.prod.yml --profile ai up -d ollama
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:3b-instruct
```

Luego en `.env.production`: `OLLAMA_URL=http://ollama:11434` y, si se quiere como principal,
`AI_PROVIDER=ollama`. Medir antes RAM/CPU: comparte la máquina con otros proyectos.
