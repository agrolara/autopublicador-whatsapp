import React from 'react';
import { X, Check, Image as ImageIcon, Plus } from 'lucide-react';

export interface SavedImageItem {
  id: string;
  name: string;
  base64: string;
  mimetype: string;
  filename: string;
}

export interface SavedGallerySectionProps {
  savedImages: SavedImageItem[];
  selectedImages?: SavedImageItem[];
  onToggleSelectImage?: (item: SavedImageItem) => void;
  onSelectImage?: (item: SavedImageItem) => void;
  onDeleteImage: (id: string, e: React.MouseEvent) => void;
  onSaveCurrentImage: () => void;
  hasCurrentMedia: boolean;
  onRemoveSelectedImage?: (id: string) => void;
}

export const SavedGallerySection: React.FC<SavedGallerySectionProps> = ({
  savedImages,
  selectedImages = [],
  onToggleSelectImage,
  onSelectImage,
  onDeleteImage,
  onSaveCurrentImage,
  hasCurrentMedia,
  onRemoveSelectedImage,
}) => {
  const selectedIds = new Set(selectedImages.map(img => img.id));

  const handleImageClick = (img: SavedImageItem) => {
    if (onToggleSelectImage) {
      onToggleSelectImage(img);
    } else if (onSelectImage) {
      onSelectImage(img);
    }
  };

  return (
    <div style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ImageIcon size={16} color="#6366f1" /> Galería de Imágenes Frecuentes ({savedImages.length})
          {selectedImages.length > 0 && (
            <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.72rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 700 }}>
              {selectedImages.length} de 5 seleccionadas
            </span>
          )}
        </span>
        {hasCurrentMedia && (
          <button
            type="button"
            onClick={onSaveCurrentImage}
            style={{
              fontSize: '0.75rem',
              padding: '4px 10px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            💾 Guardar Imagen Actual
          </button>
        )}
      </div>

      {savedImages.length === 0 ? (
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
          No tienes imágenes guardadas aún. Sube una imagen y haz clic en "Guardar Imagen Actual" para reutilizarla rápidamente.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
            {savedImages.map(img => {
              const isSelected = selectedIds.has(img.id);
              const selectedIndex = selectedImages.findIndex(s => s.id === img.id);

              return (
                <div
                  key={img.id}
                  onClick={() => handleImageClick(img)}
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    width: '78px',
                    height: '78px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #6366f1' : '1px solid #cbd5e1',
                    boxShadow: isSelected ? '0 0 0 2px rgba(99, 102, 241, 0.25)' : 'none',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: '#fff',
                    transition: 'all 0.15s ease',
                  }}
                  title={isSelected ? `Deseleccionar (${selectedIndex + 1})` : `Seleccionar (hasta 5): ${img.name}`}
                >
                  <img
                    src={`data:${img.mimetype};base64,${img.base64}`}
                    alt={img.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {/* Selection Badge */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        background: '#6366f1',
                        color: '#fff',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      }}
                    >
                      {selectedIndex + 1}
                    </div>
                  )}

                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      insetInline: 0,
                      background: 'rgba(15, 23, 42, 0.78)',
                      color: '#fff',
                      fontSize: '0.62rem',
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
                      width: '18px',
                      height: '18px',
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
              );
            })}
          </div>

          {/* Selected multi-image strip */}
          {selectedImages.length > 0 && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                📸 Secuencia de imágenes a enviar ({selectedImages.length} fotos):
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedImages.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#6366f1' }}>#{idx + 1}</span>
                    <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.name}
                    </span>
                    {onRemoveSelectedImage && (
                      <button
                        type="button"
                        onClick={() => onRemoveSelectedImage(img.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#ef4444',
                          padding: '0 2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
