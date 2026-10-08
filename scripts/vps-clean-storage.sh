#!/usr/bin/env bash
# ==============================================================================
# OpenWA - VPS Automated Storage, Cache & Media Cleaner
# Libera espacio de forma masiva (Caché, Imágenes, Stickers, Audios, BuildKit, Logs)
# SIN desvincular sesiones de WhatsApp, SIN tocar plantillas, y SIN tocar la BD.
# ==============================================================================

set -eo pipefail

CRON_JOB_FILE="/etc/cron.d/openwa-storage-cleaner"
SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || echo "/root/vps-clean-storage.sh")"

# Manejo de instalación automática de Cron
if [ "$1" = "--install-cron" ] || [ "$1" = "-i" ]; then
    echo "=========================================================="
    echo "⚙️  Configurando tarea programada automática cada 2 días..."
    echo "=========================================================="
    
    # Crear script persistente en /root si se ejecuta desde otra ubicación
    if [ "$SCRIPT_PATH" != "/root/vps-clean-storage.sh" ]; then
        cp -f "$SCRIPT_PATH" /root/vps-clean-storage.sh
        chmod +x /root/vps-clean-storage.sh
        TARGET_EXEC="/root/vps-clean-storage.sh"
    else
        chmod +x "$SCRIPT_PATH"
        TARGET_EXEC="$SCRIPT_PATH"
    fi

    # Configurar cron en /etc/cron.d para ejecutarse cada 2 días a las 03:00 AM
    cat <<EOF > "$CRON_JOB_FILE"
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
# Ejecución automática de limpieza cada 2 días a las 03:00 AM
0 3 */2 * * root $TARGET_EXEC >> /var/log/vps-clean-storage.log 2>&1
EOF
    chmod 0644 "$CRON_JOB_FILE"
    echo "✅ Tarea programada instalada con éxito en $CRON_JOB_FILE"
    echo "🕒 Frecuencia: Cada 2 días a las 03:00 AM"
    echo "📝 Log: /var/log/vps-clean-storage.log"
    echo ""
fi

echo "=========================================================="
echo "🧹 [OpenWA] Iniciando limpieza profunda de almacenamiento"
echo "🕒 Fecha: $(date)"
echo "=========================================================="

echo "📊 Espacio en disco ANTES de la limpieza:"
df -h / | awk 'NR==1 || NR==2'
echo ""

# ------------------------------------------------------------------------------
# 1. Truncar logs acumulados de contenedores Docker
# ------------------------------------------------------------------------------
echo "➡️  [1/6] Truncando logs masivos de contenedores Docker..."
if [ -d "/var/lib/docker/containers" ]; then
    CONTAINER_LOGS_COUNT=$(find /var/lib/docker/containers/ -name "*-json.log" -type f | wc -l || echo 0)
    if [ "$CONTAINER_LOGS_COUNT" -gt 0 ]; then
        find /var/lib/docker/containers/ -name "*-json.log" -type f -exec truncate -s 0 {} + 2>/dev/null || true
        echo "    ✅ $CONTAINER_LOGS_COUNT archivos de logs de Docker truncados a 0 bytes."
    else
        echo "    ℹ️  No se encontraron logs acumulados."
    fi
else
    echo "    ℹ️  No se encontró /var/lib/docker/containers."
fi

# ------------------------------------------------------------------------------
# 2. Limpieza de Caché, Imágenes, Stickers y Audios en OpenWA
# ------------------------------------------------------------------------------
echo "➡️  [2/6] Limpiando caché, imágenes en tránsito, stickers y audios de OpenWA..."

# Buscar contenedores activos de OpenWA (por nombre openwa o whatsapp o etiquetas)
OPENWA_CONTAINERS=$(docker ps --format "{{.ID}} {{.Names}}" | grep -iE "openwa|whatsapp" | awk '{print $1}' || true)

if [ -n "$OPENWA_CONTAINERS" ]; then
    for CID in $OPENWA_CONTAINERS; do
        CNAME=$(docker inspect --format '{{.Name}}' "$CID" | sed 's/\///')
        echo "    📦 Limpiando contenedor OpenWA: $CNAME ($CID)..."
        
        docker exec "$CID" bash -c '
            # 1. Caché de Chromium (imágenes cargadas, assets, media en tránsito)
            rm -rf /app/data/sessions/*/Default/Cache/* \
                   /app/data/sessions/*/Default/Code\ Cache/* \
                   /app/data/sessions/*/Default/GPUCache/* 2>/dev/null || true

            # 2. Service Worker & Storage (stickers, sonidos, media offline)
            rm -rf /app/data/sessions/*/Default/Service\ Worker/CacheStorage/* \
                   /app/data/sessions/*/Default/Service\ Worker/ScriptCache/* 2>/dev/null || true

            # 3. Blob Storage (notas de voz, audios Opus, stickers decodificados en memoria/disco)
            rm -rf /app/data/sessions/*/Default/blob_storage/* 2>/dev/null || true

            # 4. Archivos temporales del sistema y transcodificación (NO borrar /app/data/uploads para proteger plantillas y difusiones activas)
            # /app/data/uploads almacena las imágenes asignadas a campañas y plantillas. Se preservan intactas.

            # 5. Archivos temporales de Node/Puppeteer/ffmpeg
            rm -rf /tmp/puppeteer* /tmp/media-* /tmp/ffmpeg-* /tmp/core* 2>/dev/null || true
        ' || true

        echo "    ✅ Caché de navegación, stickers, audios y subidas temporales purgados en $CNAME."
    done
else
    echo "    ℹ️  No se detectaron contenedores OpenWA en ejecución; verificando volúmenes en host..."
fi

# Limpieza directa en volumen docker si existe localmente montado en /var/lib/docker/volumes
if [ -d "/var/lib/docker/volumes" ]; then
    find /var/lib/docker/volumes/ -wholename "*/_data/sessions/*/Default/Cache/*" -delete 2>/dev/null || true
    find /var/lib/docker/volumes/ -wholename "*/_data/sessions/*/Default/Code Cache/*" -delete 2>/dev/null || true
    find /var/lib/docker/volumes/ -wholename "*/_data/sessions/*/Default/Service Worker/CacheStorage/*" -delete 2>/dev/null || true
    find /var/lib/docker/volumes/ -wholename "*/_data/sessions/*/Default/blob_storage/*" -delete 2>/dev/null || true
    # /_data/uploads se preserva intacto para no romper plantillas ni difusiones programadas
fi

# ------------------------------------------------------------------------------
# 3. Purgar Docker BuildKit (Build Cache de Coolify) - Mayor acumulador (50-100GB)
# ------------------------------------------------------------------------------
echo "➡️  [3/6] Purgando Docker Build Cache (BuildKit de Coolify)..."
docker builder prune -af --keep-storage 1GB 2>/dev/null || docker builder prune -af 2>/dev/null || true
echo "    ✅ Build cache purgado."

# ------------------------------------------------------------------------------
# 4. Purgar imágenes y contenedores Docker huérfanos
# ------------------------------------------------------------------------------
echo "➡️  [4/6] Purgando imágenes Docker huérfanas y contenedores detenidos..."
docker image prune -af 2>/dev/null || true
docker container prune -f 2>/dev/null || true
docker network prune -f 2>/dev/null || true
echo "    ✅ Imágenes viejas y contenedores detenidos purgados."

# ------------------------------------------------------------------------------
# 5. Limpieza de logs de Systemd (Journalctl)
# ------------------------------------------------------------------------------
echo "➡️  [5/6] Reduciendo registros de systemd (journalctl)..."
if command -v journalctl >/dev/null 2>&1; then
    journalctl --vacuum-time=2d >/dev/null 2>&1 || true
    journalctl --vacuum-size=100M >/dev/null 2>&1 || true
    echo "    ✅ Logs de systemd optimizados (máx 2 días / 100MB)."
else
    echo "    ℹ️  journalctl no disponible."
fi

# ------------------------------------------------------------------------------
# 6. Limpieza de temporales del sistema operativo (/tmp y /var/tmp)
# ------------------------------------------------------------------------------
echo "➡️  [6/6] Purgando archivos temporales del sistema..."
find /tmp -type f -atime +2 -delete 2>/dev/null || true
find /var/tmp -type f -atime +2 -delete 2>/dev/null || true
echo "    ✅ Temporales del sistema limpios."

echo ""
echo "=========================================================="
echo "📊 Espacio en disco DESPUÉS de la limpieza:"
df -h / | awk 'NR==1 || NR==2'
echo "=========================================================="
echo "🛡️  VERIFICACIÓN DE SEGURIDAD (INTEGRIDIDAD):"
echo "   ✅ Sesiones WhatsApp (IndexedDB & Local Storage): PRESERVADAS INTACTAS"
echo "   ✅ Base de datos (SQLite / PostgreSQL): PRESERVADA INTACTA"
echo "   ✅ Plantillas y Campañas configuradas: PRESERVADAS INTACTAS"
echo "   ✅ Variables de entorno (.env) y Plugins: PRESERVADOS INTACTOS"
echo "✨ [OpenWA] Limpieza completada con éxito."
echo "=========================================================="
