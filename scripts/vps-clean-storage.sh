#!/usr/bin/env bash
# ==============================================================================
# OpenWA - VPS Automated Storage & Cache Cleaner
# Libera espacio de forma segura sin desvincular sesiones de WhatsApp ni borrar BD.
# ==============================================================================

set -eo pipefail

echo "=========================================================="
echo "🧹 [OpenWA] Iniciando limpieza profunda de almacenamiento"
echo "🕒 Fecha: $(date)"
echo "=========================================================="

echo "📊 Espacio en disco ANTES de la limpieza:"
df -h / | awk 'NR==1 || NR==2'
echo ""

# 1. Truncar logs acumulados de contenedores Docker mayores a 20MB
echo "➡️  [1/5] Truncando logs masivos de contenedores Docker..."
if [ -d "/var/lib/docker/containers" ]; then
    find /var/lib/docker/containers/ -name "*-json.log" -type f -size +20M -exec truncate -s 0 {} \; 2>/dev/null || true
    echo "    ✅ Logs de Docker truncados."
else
    echo "    ℹ️  No se encontró /var/lib/docker/containers (verificar permisos o ruta)."
fi

# 2. Limpieza de caché de Chromium en sesiones de OpenWA (SIN perder vinculación)
# Preserva IndexedDB y Local Storage (donde residen las llaves de WhatsApp).
echo "➡️  [2/5] Limpiando caché de navegación de Chromium en sesiones de WhatsApp..."
OPENWA_CONTAINER=$(docker ps --filter "name=openwa-api" --format "{{.ID}}" | head -n 1)
if [ -n "$OPENWA_CONTAINER" ]; then
    docker exec "$OPENWA_CONTAINER" bash -c '
        rm -rf /app/data/sessions/*/Default/Cache/* \
               /app/data/sessions/*/Default/Code\ Cache/* \
               /app/data/sessions/*/Default/Service\ Worker/CacheStorage/* \
               /app/data/sessions/*/Default/GPUCache/* 2>/dev/null || true
        # Limpiar archivos temporales de upload con más de 2 días
        find /app/data/uploads -type f -mtime +2 -delete 2>/dev/null || true
    ' || true
    echo "    ✅ Caché temporal de Chromium y subidas viejas vaciadas."
else
    echo "    ℹ️  Contenedor openwa-api no está en ejecución actualmente; omitiendo caché de navegador."
fi

# 3. Purgar Build Cache de Docker / Coolify (BuildKit)
echo "➡️  [3/5] Purgando Docker Build Cache (BuildKit)..."
docker builder prune -af --keep-storage 2GB 2>/dev/null || docker builder prune -af 2>/dev/null || true
echo "    ✅ Build cache purgado."

# 4. Purgar imágenes de Docker huérfanas o no utilizadas
echo "➡️  [4/5] Purgando imágenes Docker huérfanas y no utilizadas..."
docker image prune -af 2>/dev/null || true
docker container prune -f 2>/dev/null || true
echo "    ✅ Imágenes y contenedores detenidos purgados."

# 5. Limpieza de archivos de log y temporales del sistema operativo (/tmp y /var/tmp)
echo "➡️  [5/5] Purgando archivos temporales del sistema..."
find /tmp -type f -atime +3 -delete 2>/dev/null || true
find /var/tmp -type f -atime +3 -delete 2>/dev/null || true
echo "    ✅ Temporales del sistema limpios."

echo ""
echo "=========================================================="
echo "📊 Espacio en disco DESPUÉS de la limpieza:"
df -h / | awk 'NR==1 || NR==2'
echo "✨ [OpenWA] Limpieza completada con éxito."
echo "=========================================================="
