#!/usr/bin/env bash
# Deploy / update script — ejecuta en el servidor Ubuntu como usuario con sudo.
# Uso:
#   ./deploy/deploy.sh                          # tira de git pull, instala, build, restart
#   ./deploy/deploy.sh --fresh                  # primera vez: clona el repo si no está
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/estructuradaabon}"
REPO_URL="${REPO_URL:-https://github.com/mantilla16/grupoDaabon.git}"
SERVICE="${SERVICE:-estructuradaabon}"

need() { command -v "$1" >/dev/null || { echo "Falta $1"; exit 1; }; }
need node
need npm
need git

if [[ "${1:-}" == "--fresh" ]]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER":"$USER" "$APP_DIR"
  if [[ ! -d "$APP_DIR/.git" ]]; then
    git clone "$REPO_URL" "$APP_DIR"
  fi
fi

cd "$APP_DIR"

echo "▸ git pull"
git pull --ff-only

echo "▸ npm ci (con devDeps porque necesitamos vite/tsc para el build)"
npm ci --include=dev

echo "▸ build producción con APP_BASE=/estructuradaabon/"
APP_BASE=/estructuradaabon/ npm run build

echo "▸ asegurar carpeta data-db con permisos www-data"
sudo mkdir -p data-db
# El service corre como www-data. Si data-db pertenece a otro usuario
# (por ejemplo al que hizo git clone), el server crashea con SQLITE_CANTOPEN.
sudo chown -R www-data:www-data data-db

if sudo systemctl is-active --quiet "$SERVICE"; then
  echo "▸ reiniciando servicio $SERVICE"
  sudo systemctl restart "$SERVICE"
else
  echo "▸ servicio $SERVICE no está corriendo; arrancando"
  sudo systemctl enable --now "$SERVICE" || {
    echo "  → si es la primera vez, copiá el unit:"
    echo "     sudo cp deploy/estructuradaabon.service /etc/systemd/system/"
    echo "     sudo systemctl daemon-reload && sudo systemctl enable --now $SERVICE"
    exit 1
  }
fi

echo "▸ estado:"
sudo systemctl --no-pager --lines=8 status "$SERVICE" || true

echo
echo "▸ probando health check"
sleep 1
curl -s http://127.0.0.1:4001/api/health || echo "  (health no responde aún — revisar journalctl -u $SERVICE)"
echo

echo "✓ deploy listo."
echo "  Recordá recargar nginx si cambió su config: sudo nginx -t && sudo systemctl reload nginx"
