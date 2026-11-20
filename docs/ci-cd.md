# CI/CD

## CI (`.github/workflows/ci.yml`)

Se ejecuta en cada PR y en `main` con permisos de solo lectura y **sin secretos**:

1. `npm ci`, lint, verificación de tipos, pruebas de `shared`.
2. Supabase local desechable (`supabase start`), `.env` de prueba generado en el job, pruebas de integración de la API, `supabase db lint`.
3. Build de la web.
4. Build de las imágenes Docker de API y web **sin publicar**.

Las pruebas contra Stellar Testnet real (`RUN_TESTNET_TESTS=1`) y las E2E no corren en CI por defecto (dependen de red pública y navegadores); se ejecutan en local.

## CD (`.github/workflows/cd.yml`)

Solo manual (**Run workflow**) y con aprobación del Environment `production`:

1. Construye y publica `ghcr.io/<owner>/jucumari-api:<tag>` y `jucumari-web:<tag>`.
2. Opcional (`run_migrations`): `supabase db push` contra la base remota.
3. Por SSH en el VPS: guarda la versión anterior en `.previous_tag`, hace `pull` + `up -d` y comprueba `/api/health/ready`.

Ningún workflow escribe en el repositorio ni hace push de código.

## Configuración en GitHub (la hace el responsable)

| Dónde | Nombre | Valor |
|---|---|---|
| Settings → Environments | `production` | Añadir «Required reviewers» (tú) |
| Environment secrets | `VPS_HOST`, `VPS_USER` | IP/dominio y usuario del VPS |
| Environment secrets | `VPS_SSH_KEY` | llave privada **dedicada** al despliegue (solo para este usuario) |
| Environment secrets | `VPS_KNOWN_HOSTS` | salida de `ssh-keyscan <host>` verificada |
| Environment secrets | `SUPABASE_DB_URL` | cadena del *Session pooler* de Supabase (IPv4) |
| Environment variables | `VITE_STELLAR_NETWORK`, `VITE_DEMO_MODE`, `VITE_POLLAR_PUBLISHABLE_KEY` | valores públicos de la web |
| Settings → Actions → General | Workflow permissions | «Read repository contents» |

## Arquitectura de las imágenes

El VPS es Oracle Cloud ARM64 (`aarch64`). Por eso:

- El **CD** publica las imágenes para `linux/arm64` (entrada `platforms`; se puede pedir
  `linux/amd64,linux/arm64` si algún día se despliega en otro servidor).
- El **CI** construye también para `linux/arm64`, así un fallo de arquitectura aparece en el PR y no en el despliegue.
- En los Dockerfiles, la compilación (TypeScript, Vite) corre nativa con `--platform=$BUILDPLATFORM`
  porque su resultado sirve para cualquier procesador; solo la instalación de dependencias de producción
  de la API y las imágenes finales son ARM64 (emuladas con QEMU en GitHub Actions).
- Se usa la caché de GitHub Actions (`type=gha`) para que los builds siguientes sean rápidos.
