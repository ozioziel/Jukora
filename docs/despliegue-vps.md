# Despliegue en el VPS (Oracle Cloud ARM64)

Lo ejecuta el responsable. El VPS ya aloja otros proyectos: este despliegue **no** toca su proxy ni sus contenedores y escucha solo en `127.0.0.1`.

## 1. Requisitos en el VPS

```bash
uname -m            # aarch64 (las imágenes se construyen multi-arquitectura en CI si se activa QEMU; ver ci-cd.md)
docker --version && docker compose version
free -h && df -h    # dejar margen: API ~200 MB RAM, web ~20 MB; Ollama opcional 4–6 GB
```

## 2. Preparar carpeta y variables

```bash
mkdir -p ~/jucumari && cd ~/jucumari
# copiar deploy/docker-compose.prod.yml desde el repositorio
cp /ruta/al/repo/deploy/docker-compose.prod.yml .
nano .env.production   # basado en .env.example, con NODE_ENV=production y DEMO_MODE según la demo
chmod 600 .env.production
```

Valores mínimos para producción de demostración (testnet): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (32+ caracteres), `APP_PUBLIC_URL` (dominio con https), `STELLAR_NETWORK=testnet`, `TW_API_KEY`, `PLATFORM_STELLAR_ADDRESS`, `PLATFORM_STELLAR_SECRET` (testnet), `ARBITER_STELLAR_ADDRESS`, `DEMO_TOKEN_*`, y las de Groq/Tavily/Didit/Pollar si se usan.

## 3. Proxy y TLS (sin dominio comprado)

Opción sin costo: un subdominio gratuito (p. ej. DuckDNS) apuntando a la IP del VPS + Let’s Encrypt. En el proxy que ya usa el VPS, añadir un sitio que reenvíe a `http://127.0.0.1:8080` con:

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;          # eventos SSE de búsqueda
  proxy_read_timeout 300s;
}
```

Abrir solo 80/443 en el firewall (Oracle Security List + `iptables`/`ufw`). No publicar 3000 ni 11434.

## 4. Primer arranque

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <usuario> --password-stdin   # token con read:packages
GHCR_OWNER=<usuario-o-org> IMAGE_TAG=v0.1.0 docker compose -f docker-compose.prod.yml --env-file .env.production up -d
curl -fsS http://127.0.0.1:8080/api/health/ready
```

## 5. Ollama opcional (IA privada)

```bash
GHCR_OWNER=… IMAGE_TAG=… docker compose -f docker-compose.prod.yml --profile ai up -d ollama
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:3b-instruct
```

Luego en `.env.production`: `OLLAMA_URL=http://ollama:11434` y, si se quiere como principal, `AI_PROVIDER=ollama` (si no, queda como respaldo de Groq). Medir antes RAM/CPU: comparte la máquina con otros proyectos.
