# Estructura Grupo Daabon

Papel de trabajo interactivo para la composición accionaria del Grupo Daabon.
Cliente React + Vite, backend Express + SQLite (`better-sqlite3`). Los datos
viven en un único archivo `data-db/estructura.db` en disco — sobreviven a
recargas, cambios de puerto y refactors del código.

## Correr en local

Requisitos: Node ≥ 20 (compilable `better-sqlite3`), npm.

```bash
npm install
npm run dev
```

Arranca dos procesos con `concurrently`:

- `server` — Express + SQLite en `http://localhost:4001`
- `client` — Vite en `http://localhost:5173` (proxea `/api/*` al backend)

En el primer arranque, si `data-db/estructura.db` no existe, el servidor lo
crea y lo siembra desde `src/data/graph.ts`. Después de eso, la base es la
única fuente de verdad — `graph.ts` no vuelve a leerse a menos que uses el
botón **Restaurar original**.

### Scripts útiles

| Script | Descripción |
| --- | --- |
| `npm run dev` | server + cliente juntos, con `predev` que libera 5173 y 4001 |
| `npm run server` | solo el backend SQLite |
| `npm run client` | solo el frontend |
| `npm run killports` | mata cualquier proceso en 5173 y 4001 |
| `npm run backup` | snapshot manual — usa `wal_checkpoint(FULL)` + `db.backup()` |
| `npm run build:prod` | build de producción con `base=/estructuradaabon/` |
| `npm start` | arranca el server Node en modo producción sirviendo `dist/` |

### Datos

- `data-db/estructura.db` — base SQLite en modo WAL.
- Cada operación destructiva (`replace`, `restore-original`, `restore-backup`)
  hace un auto-backup antes en `data-db/estructura.<timestamp>.autobak.db`.
- El endpoint `/api/restore-original` **exige** el body
  `{ "confirm": "SI, BORRAR TODO" }` — el cliente lo manda solo cuando el
  usuario confirma explícitamente.

## Desplegar en Ubuntu bajo `/estructuradaabon`

Repositorio: `https://github.com/mantilla16/grupoDaabon`.

### 1. Preparar el VPS

```bash
# Node 20 LTS + build-essential (para compilar better-sqlite3)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 git nginx
```

### 2. Primer despliegue

```bash
git clone https://github.com/mantilla16/grupoDaabon.git /var/www/estructuradaabon
cd /var/www/estructuradaabon
chmod +x deploy/deploy.sh
./deploy/deploy.sh --fresh
```

El script:
1. Corre `npm ci` (incluye devDeps para poder buildear).
2. Genera el build con `APP_BASE=/estructuradaabon/`.
3. Reinicia el servicio systemd (o lo inicia si no existía).

### 3. Configurar systemd

```bash
sudo cp deploy/estructuradaabon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now estructuradaabon
sudo systemctl status estructuradaabon
```

Log en vivo:

```bash
journalctl -u estructuradaabon -f
```

### 4. Configurar nginx

Agrega el contenido de `deploy/nginx.conf` dentro del bloque `server { … }` de
tu vhost (por ejemplo `/etc/nginx/sites-available/tuservidor.conf`), luego:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

La app queda accesible en `https://tuservidor/estructuradaabon/`.

### 5. Actualizaciones posteriores

```bash
cd /var/www/estructuradaabon
./deploy/deploy.sh
```

Los datos en `data-db/` no se tocan — `.gitignore` los excluye del repo y el
build no los sobreescribe. Copiá `data-db/estructura.db` a tu máquina si
querés respaldarlo fuera del servidor.

## Estructura

```
src/
  App.tsx                        composición general
  data/graph.ts                  seed inicial (solo se usa la primera vez)
  components/
    CompanyNode.tsx              nodo del grafo (React Flow)
    OwnershipEdge.tsx            flecha con tier de color por %
    TreeView.tsx                 vista de árbol expandible
    DetailPanel.tsx, LeftPanel.tsx, Header.tsx
    CompanyModal.tsx, EdgeModal.tsx, Modal.tsx, DataDrawer.tsx
  lib/
    api.ts                       cliente REST (usa import.meta.env.BASE_URL)
    layout.ts                    layout jerárquico con dagre
    theme.ts                     paleta + tiers
    storage.ts                   (legacy) — reemplazado por api.ts
server/
  index.mjs                      Express + SQLite + estáticos de dist/
scripts/
  backup.mjs                     backup WAL-safe
  killports.mjs                  libera 5173 y 4001
deploy/
  nginx.conf                     reverse-proxy /estructuradaabon/
  estructuradaabon.service       unit systemd
  deploy.sh                      pull + build + restart
```
