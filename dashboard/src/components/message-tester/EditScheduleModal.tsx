import React, { useState } from 'react';
import { Link, Calendar } from 'lucide-react';
import { WaLinkModal } from './WaLinkModal';

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
  editSchedDaysOfWeek: number[];
  setEditSchedDaysOfWeek: (v: number[]) => void;
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

const DAYS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sáb' },
  { id: 0, label: 'Dom' },
];

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
  editSchedDaysOfWeek = [0, 1, 2, 3, 4, 5, 6],
  setEditSchedDaysOfWeek,
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
  const [showWaLink, setShowWaLink] = useState(false);

  if (!isOpen) return null;

  const toggleDay = (dayId: number) => {
    if (editSchedDaysOfWeek.includes(dayId)) {
      // Don't allow empty if user unchecks all
      if (editSchedDaysOfWeek.length === 1) return;
      setEditSchedDaysOfWeek(editSchedDaysOfWeek.filter(d => d !== dayId));
    } else {
      setEditSchedDaysOfWeek([...editSchedDaysOfWeek, dayId]);
    }
  };

  const handleInsertWaLink = (url: string) => {
    setEditSchedContent(editSchedContent ? `${editSchedContent}\n\n${url}` : url);
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '540px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
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

          {/* Days of week selector */}
          <div className="form-group" style={{ marginBottom: '14px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                <Calendar size={14} color="#6366f1" /> Días de Ejecución:
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setEditSchedDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}
                  style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setEditSchedDaysOfWeek([1, 2, 3, 4, 5])}
                  style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Lun-Vie
                </button>
                <button
                  type="button"
                  onClick={() => setEditSchedDaysOfWeek([0, 6])}
                  style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Finde
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
              {DAYS.map(d => {
                const active = editSchedDaysOfWeek.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      border: active ? '1px solid #6366f1' : '1px solid #cbd5e1',
                      background: active ? '#6366f1' : '#ffffff',
                      color: active ? '#ffffff' : '#475569',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
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
                <option value="daily">Una vez al día a esta hora</option>
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
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowWaLink(true)}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid #86efac',
                    background: '#f0fdf4',
                    color: '#166534',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Link size={12} /> Link wa.me
                </button>
                {templates.length > 0 && (
                  <select
                    style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    onChange={e => {
                      const found = templates.find(t => t.id === e.target.value);
                      if (found) {
                        const fullText = [found.header, found.body, found.footer].filter(Boolean).join('\n\n');
                        setEditSchedContent(fullText);
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>-- Plantillas --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
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

      <WaLinkModal
        isOpen={showWaLink}
        onClose={() => setShowWaLink(false)}
        onInsert={handleInsertWaLink}
      />
    </>
  );
};
