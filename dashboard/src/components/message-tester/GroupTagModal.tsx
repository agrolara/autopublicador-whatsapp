import React from 'react';
import { type GroupTagItem, groupTagsApi } from '../../services/api';

export interface GroupTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: string;
  editingTagId: string | null;
  newTagName: string;
  setNewTagName: (v: string) => void;
  newTagColor: string;
  setNewTagColor: (v: string) => void;
  selectedGroupIdsForTag: Set<string>;
  setSelectedGroupIdsForTag: (v: Set<string>) => void;
  groups: Array<{ id: string; name?: string }>;
  groupTags: GroupTagItem[];
  groupSearchQuery: string;
  setGroupSearchQuery: (v: string) => void;
  onSaved: (name: string, count: number) => void;
}

export const GroupTagModal: React.FC<GroupTagModalProps> = ({
  isOpen,
  onClose,
  session,
  editingTagId,
  newTagName,
  setNewTagName,
  newTagColor,
  setNewTagColor,
  selectedGroupIdsForTag,
  setSelectedGroupIdsForTag,
  groups,
  groupTags,
  groupSearchQuery,
  setGroupSearchQuery,
  onSaved,
}) => {
  if (!isOpen) return null;

  const handleSave = async () => {
    if (!newTagName.trim()) {
      alert('Ingresa un nombre para la categoría.');
      return;
    }
    if (selectedGroupIdsForTag.size === 0) {
      alert('Selecciona al menos 1 grupo para agregar a esta categoría.');
      return;
    }
    const tagPayload = {
      ...(editingTagId ? { id: editingTagId } : {}),
      name: newTagName.trim(),
      color: newTagColor,
      groupIds: Array.from(selectedGroupIdsForTag),
    };
    await groupTagsApi.save(session, tagPayload);
    onSaved(newTagName.trim(), selectedGroupIdsForTag.size);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-primary, #ffffff)', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '540px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'var(--text-main, #0f172a)' }}>
          🏷️ {editingTagId ? 'Editar Categoría de Grupos' : 'Crear Nueva Categoría de Grupos'}
        </h3>
        <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0 0 16px 0' }}>
          Selecciona los grupos de tu WhatsApp que pertenecerán a esta categoría ({selectedGroupIdsForTag.size} seleccionados).
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Nombre de la Categoría:</label>
          <input
            type="text"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            placeholder="ej: Ventas Santiago, Inmobiliaria, Oferta Pro"
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Color de Identificación:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['#10b981', '#0284c7', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444'].map(color => (
              <div
                key={color}
                onClick={() => setNewTagColor(color)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: color,
                  cursor: 'pointer',
                  border: newTagColor === color ? '3px solid #0f172a' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.83rem', fontWeight: 600, color: '#334155', margin: 0 }}>
              Grupos de tu WhatsApp ({selectedGroupIdsForTag.size} de {groups.length}):
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setSelectedGroupIdsForTag(new Set(groups.map(g => g.id)))}
                style={{ fontSize: '0.75rem', background: '#e2e8f0', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroupIdsForTag(new Set())}
                style={{ fontSize: '0.75rem', background: '#e2e8f0', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
              >
                Desmarcar
              </button>
            </div>
          </div>

          <input
            type="text"
            value={groupSearchQuery}
            onChange={e => setGroupSearchQuery(e.target.value)}
            placeholder="🔍 Buscar grupo por nombre..."
            style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '8px' }}
          />

          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fafafa', padding: '6px' }}>
            {groups.length === 0 ? (
              <p style={{ margin: '8px', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
                Sincronizando chats de WhatsApp... Aguarda unos segundos.
              </p>
            ) : (
              groups
                .filter(g => (g.name || g.id).toLowerCase().includes(groupSearchQuery.toLowerCase()))
                .map(g => {
                  const isChecked = selectedGroupIdsForTag.has(g.id);
                  const otherCategory = groupTags.find(t => t.id !== editingTagId && t.groupIds.includes(g.id));
                  return (
                    <label
                      key={g.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: isChecked ? '#e0f2fe' : 'transparent',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: '0.82rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          const next = new Set(selectedGroupIdsForTag);
                          if (e.target.checked) next.add(g.id);
                          else next.delete(g.id);
                          setSelectedGroupIdsForTag(next);
                        }}
                      />
                      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#0f172a' }}>{g.name || '👥 Grupo WhatsApp'}</strong>
                        <span style={{ fontSize: '0.74rem', color: '#64748b', marginLeft: '6px' }}>({g.id})</span>
                      </div>
                      {otherCategory && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', background: otherCategory.color || '#94a3b8', color: '#fff', fontWeight: 600 }}>
                          {otherCategory.name}
                        </span>
                      )}
                    </label>
                  );
                })
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '6px 12px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{ padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            Guardar Categoría
          </button>
        </div>
      </div>
    </div>
  );
};
