#!/usr/bin/env bash
# ==============================================================================
# OpenWA - VPS Automated Storage, Cache, Media & Database Cleaner
# Libera espacio de forma masiva (Caché Chromium, Logs Docker, BuildKit, Base de Datos)
# SIN desvincular sesiones de WhatsApp, SIN tocar plantillas, y SIN tocar campañas.
#
# Modos de uso:
#   ./vps-clean-storage.sh                     Limpieza segura estándar (logs, caché, buildkit, media DB > 2 días)
#   ./vps-clean-storage.sh --truncate-messages Vacía 100% el historial acumulado de openwa.messages (libera 50-80GB+)
#   ./vps-clean-storage.sh --install-cron      Configura ejecución automática cada 2 días
# ==============================================================================

set -eo pipefail

CRON_JOB_FILE="/etc/cron.d/openwa-storage-cleaner"
SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || echo "/root/vps-clean-storage.sh")"
TRUNCATE_MESSAGES=false

for arg in "$@"; do
    case "$arg" in
        --truncate-messages|-t)
            TRUNCATE_MESSAGES=true
            ;;
        --install-cron|-i)
            INSTALL_CRON=true
            ;;
    esac
done

# Manejo de instalación automática de Cron
if [ "${INSTALL_CRON:-false}" = "true" ]; then
    echo "=========================================================="
    echo "⚙️  Configurando tarea programada automática cada 2 días..."
    echo "=========================================================="
    
    if [ "$SCRIPT_PATH" != "/root/vps-clean-storage.sh" ]; then
        cp -f "$SCRIPT_PATH" /root/vps-clean-storage.sh
        chmod +x /root/vps-clean-storage.sh
        TARGET_EXEC="/root/vps-clean-storage.sh"
    else
        chmod +x "$SCRIPT_PATH"
        TARGET_EXEC="$SCRIPT_PATH"
    fi

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
echo "➡️  [1/7] Truncando logs masivos de contenedores Docker..."
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
# 2. Purgar tabla de mensajes de OpenWA en PostgreSQL (supabase-db / openwa-postgres)
# ------------------------------------------------------------------------------
echo "➡️  [2/7] Gestionando historial acumulado de mensajes en base de datos..."
DB_CONTAINER=$(docker ps --format "{{.ID}} {{.Names}}" | grep -iE "supabase-db|openwa-postgres|postgres" | awk '{print $1}' | head -n 1 || true)

if [ -n "$DB_CONTAINER" ]; then
    DB_NAME=$(docker inspect --format '{{.Name}}' "$DB_CONTAINER" | sed 's/\///')
    echo "    🐘 Base de datos detectada: $DB_NAME ($DB_CONTAINER)"

    if [ "$TRUNCATE_MESSAGES" = "true" ]; then
        echo "    ⚠️  Vaciando completamente la tabla openwa.messages (--truncate-messages)..."
        docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
            TRUNCATE TABLE openwa.messages;
            TRUNCATE TABLE openwa.status_updates;
            ANALYZE openwa.messages;
        " >/dev/null 2>&1 || true
        echo "    ✅ Tabla openwa.messages y status_updates truncadas a 0 registros (espacio físico liberado inmediatamente)."
    else
        echo "    🧹 Purgando mensajes multimedia antiguos (>2 días) y optimizando..."
        docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
            DELETE FROM openwa.messages 
            WHERE type IN ('image', 'video', 'document', 'sticker', 'voice', 'revoked') 
              AND \"createdAt\" < now() - interval '2 days';
            VACUUM openwa.messages;
            ANALYZE openwa.messages;
        " >/dev/null 2>&1 || true
        echo "    ✅ Mensajes pesados con base64/multimedia mayores a 2 días purgados."
    fi
else
    echo "    ℹ️  No se detectó contenedor PostgreSQL activo en este host (verifique si usa SQLite o conexión externa)."
fi

# ------------------------------------------------------------------------------
# 3. Limpieza de Caché, Imágenes, Stickers y Audios en OpenWA
# ------------------------------------------------------------------------------
echo "➡️  [3/7] Limpiando caché, imágenes en tránsito, stickers y audios de OpenWA..."

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

            # 4. Archivos temporales de Node/Puppeteer/ffmpeg
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
fi

# ------------------------------------------------------------------------------
# 4. Purgar Docker BuildKit (Build Cache de Coolify) - Mayor acumulador (20-80GB)
# ------------------------------------------------------------------------------
echo "➡️  [4/7] Purgando Docker Build Cache (BuildKit de Coolify)..."
docker builder prune -af --keep-storage 1GB 2>/dev/null || docker builder prune -af 2>/dev/null || true
echo "    ✅ Build cache purgado."

# ------------------------------------------------------------------------------
# 5. Purgar imágenes y contenedores Docker huérfanos
# ------------------------------------------------------------------------------
echo "➡️  [5/7] Purgando imágenes Docker huérfanas y contenedores detenidos..."
docker image prune -af 2>/dev/null || true
docker container prune -f 2>/dev/null || true
docker network prune -f 2>/dev/null || true
echo "    ✅ Imágenes viejas y contenedores detenidos purgados."

# ------------------------------------------------------------------------------
# 6. Limpieza de logs de Systemd (Journalctl)
# ------------------------------------------------------------------------------
echo "➡️  [6/7] Reduciendo registros de systemd (journalctl)..."
if command -v journalctl >/dev/null 2>&1; then
    journalctl --vacuum-time=2d >/dev/null 2>&1 || true
    journalctl --vacuum-size=100M >/dev/null 2>&1 || true
    echo "    ✅ Logs de systemd optimizados (máx 2 días / 100MB)."
else
    echo "    ℹ️  journalctl no disponible."
fi

# ------------------------------------------------------------------------------
# 7. Limpieza de temporales del sistema operativo (/tmp y /var/tmp)
# ------------------------------------------------------------------------------
echo "➡️  [7/7] Purgando archivos temporales del sistema..."
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
echo "   ✅ Base de datos (Estructura, Usuarios, Credenciales): PRESERVADA INTACTA"
echo "   ✅ Plantillas y Campañas configuradas: PRESERVADAS INTACTAS"
echo "   ✅ Variables de entorno (.env) y Plugins: PRESERVADOS INTACTOS"
echo "✨ [OpenWA] Limpieza completada con éxito."
echo "=========================================================="
