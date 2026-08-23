import React from 'react';

export interface SavedImageItem {
  id: string;
  name: string;
  base64: string;
  mimetype: string;
  filename: string;
}

export interface SavedGallerySectionProps {
  savedImages: SavedImageItem[];
  onSelectImage: (item: SavedImageItem) => void;
  onDeleteImage: (id: string, e: React.MouseEvent) => void;
  onSaveCurrentImage: () => void;
  hasCurrentMedia: boolean;
}

export const SavedGallerySection: React.FC<SavedGallerySectionProps> = ({
  savedImages,
  onSelectImage,
  onDeleteImage,
  onSaveCurrentImage,
  hasCurrentMedia,
}) => {
  return (
    <div style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
          🖼️ Galería de Imágenes Frecuentes ({savedImages.length})
        </span>
        {hasCurrentMedia && (
          <button
            type="button"
            onClick={onSaveCurrentImage}
            style={{
              fontSize: '0.75rem',
              padding: '3px 8px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            💾 Guardar Imagen Actual
          </button>
        )}
      </div>

      {savedImages.length === 0 ? (
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
          No tienes imágenes guardadas aún. Sube una imagen y haz clic en "Guardar Imagen Actual" para reutilizarla rápidamente.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
          {savedImages.map(img => (
            <div
              key={img.id}
              onClick={() => onSelectImage(img)}
              style={{
                position: 'relative',
                flexShrink: 0,
                width: '74px',
                height: '74px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                overflow: 'hidden',
                cursor: 'pointer',
                background: '#fff',
              }}
              title={`Usar: ${img.name}`}
            >
              <img
                src={`data:${img.mimetype};base64,${img.base64}`}
                alt={img.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  insetInline: 0,
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#fff',
                  fontSize: '0.65rem',
                  padding: '2px 4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textAlign: 'center',
                }}
              >
                {img.name}
              </div>
              <button
                type="button"
                onClick={e => onDeleteImage(img.id, e)}
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.9)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.65rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Eliminar de guardados"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
