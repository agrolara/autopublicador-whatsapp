import React from 'react';

export interface EditScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editSchedName: string;
  setEditSchedName: (v: string) => void;
  editSchedTime: string;
  setEditSchedTime: (v: string) => void;
  editSchedStatus: 'active' | 'paused';
  setEditSchedStatus: (v: 'active' | 'paused') => void;
  editSchedFrequency: 'daily' | 'twice_daily' | 'once';
  setEditSchedFrequency: (v: 'daily' | 'twice_daily' | 'once') => void;
  editSchedEndDate: string;
  setEditSchedEndDate: (v: string) => void;
  editSchedPostToStatus: boolean;
  setEditSchedPostToStatus: (v: boolean) => void;
  editSchedContent: string;
  setEditSchedContent: (v: string) => void;
  editSchedRecipients: string;
  setEditSchedRecipients: (v: string) => void;
  templates: Array<{ id: string; name: string; header?: string; body?: string; footer?: string }>;
  onSave: () => void;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({
  isOpen,
  onClose,
  editSchedName,
  setEditSchedName,
  editSchedTime,
  setEditSchedTime,
  editSchedStatus,
  setEditSchedStatus,
  editSchedFrequency,
  setEditSchedFrequency,
  editSchedEndDate,
  setEditSchedEndDate,
  editSchedPostToStatus,
  setEditSchedPostToStatus,
  editSchedContent,
  setEditSchedContent,
  editSchedRecipients,
  setEditSchedRecipients,
  templates,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '520px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✏️ Editar Campaña Programada
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
          >
            ✕
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
            Nombre de la Campaña:
          </label>
          <input
            type="text"
            value={editSchedName}
            onChange={e => setEditSchedName(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              ⏰ Hora de Envío (HH:MM):
            </label>
            <input
              type="time"
              value={editSchedTime}
              onChange={e => setEditSchedTime(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600, fontSize: '1rem' }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Estado:
            </label>
            <select
              value={editSchedStatus}
              onChange={e => setEditSchedStatus(e.target.value as any)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="active">🟢 Activo (Enviando)</option>
              <option value="paused">⏸️ Pausado (Detenido)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Frecuencia:
            </label>
            <select
              value={editSchedFrequency}
              onChange={e => setEditSchedFrequency(e.target.value as any)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="twice_daily">Cada 12 Horas (2 veces al día)</option>
              <option value="daily">Todos los días a esta hora</option>
              <option value="once">Una sola vez</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              📅 Fecha Límite (Opcional):
            </label>
            <input
              type="date"
              value={editSchedEndDate}
              onChange={e => setEditSchedEndDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '12px', background: editSchedPostToStatus ? '#eff6ff' : '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: editSchedPostToStatus ? '1px solid #93c5fd' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setEditSchedPostToStatus(!editSchedPostToStatus)}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: editSchedPostToStatus ? '#1e40af' : '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📲 Publicar también en Mis Estados de WhatsApp
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Sube el contenido multimedia / texto a tu historia de WhatsApp a esta hora.
            </span>
          </div>
          <input
            type="checkbox"
            checked={editSchedPostToStatus}
            onChange={e => setEditSchedPostToStatus(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
            onClick={e => e.stopPropagation()}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', margin: 0 }}>
              Mensaje / Texto:
            </label>
            {templates.length > 0 && (
              <select
                style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                onChange={e => {
                  const found = templates.find(t => t.id === e.target.value);
                  if (found) {
                    const fullText = [found.header, found.body, found.footer].filter(Boolean).join('\n\n');
                    setEditSchedContent(fullText);
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>-- Cargar desde plantilla guardada --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <textarea
            value={editSchedContent}
            onChange={e => setEditSchedContent(e.target.value)}
            rows={4}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            placeholder="Escribe el mensaje de la campaña..."
          />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
            Destinatarios ({editSchedRecipients.split('\n').filter(Boolean).length} grupos/chats):
          </label>
          <textarea
            value={editSchedRecipients}
            onChange={e => setEditSchedRecipients(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontFamily: 'monospace' }}
            placeholder="Uno por línea..."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            💾 Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};
