import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { messageApi, type ScheduledBroadcastItem } from '../services/api';
import { useSessionsQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';

export function CalendarPage() {
  const { data: sessions = [] } = useSessionsQuery();
  const [session, setSession] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [schedules, setSchedules] = useState<ScheduledBroadcastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [modalTime, setModalTime] = useState('10:00');
  const [modalText, setModalText] = useState('');
  const [modalRecipients, setModalRecipients] = useState('');

  useEffect(() => {
    if (sessions.length > 0 && !session) {
      const ready = sessions.find(s => s.status === 'ready');
      setSession(ready ? ready.id : sessions[0].id);
    }
  }, [sessions, session]);

  const loadSchedules = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const items = await messageApi.getScheduledBroadcasts(session);
      setSchedules(Array.isArray(items) ? items : []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedules();
  }, [session]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const todayMonth = () => setCurrentDate(new Date());

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(new Date(year, month, d));
  }

  const getSchedulesForDate = (date: Date) => {
    const formatted = date.toISOString().split('T')[0];
    return Array.isArray(schedules)
      ? schedules.filter(s => {
          const timeStr = s?.scheduledTime || (s as any)?.scheduledAt || '';
          return typeof timeStr === 'string' && timeStr.startsWith(formatted);
        })
      : [];
  };

  const handleOpenDayModal = (date: Date) => {
    const formatted = date.toISOString().split('T')[0];
    setSelectedDateStr(formatted);
    setModalTime('10:00');
    setModalText('');
    setModalRecipients('');
    setShowModal(true);
  };

  const handleSaveSchedule = async () => {
    if (!modalText.trim() || !modalRecipients.trim()) {
      alert('Ingresa el texto del mensaje y la lista de destinatarios.');
      return;
    }
    const fullDateTime = `${selectedDateStr}T${modalTime}:00`;

    try {
      await messageApi.createScheduledBroadcast(session, {
        name: `Envío ${selectedDateStr} ${modalTime}`,
        scheduledTime: fullDateTime,
        frequency: 'once',
        payload: {
          recipients: modalRecipients.split('\n').map(s => s.trim()).filter(Boolean),
          text: modalText.trim(),
        },
      });
      setShowModal(false);
      void loadSchedules();
      setToast({ type: 'success', message: `✨ Publicación agendada para el ${selectedDateStr} a las ${modalTime}` });
    } catch (e: any) {
      alert(`Error al agendar: ${e?.message || 'Error desconocido'}`);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="📅 Calendario Visual de Publicaciones"
        description="Visualiza, agenda y gestiona todas tus campañas masivas en un calendario mensual interactivo."
      />

      {/* Toolbar Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-color, #334155)' }}>Sesión de WhatsApp:</label>
          <select
            value={session}
            onChange={e => setSession(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              fontSize: '0.88rem'
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
        </div>

        {/* Month Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={prevMonth}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, minWidth: '180px', textAlign: 'center', color: 'var(--text-color, #1e293b)' }}>
            {monthNames[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={todayMonth}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toast && (
        <div style={{
          padding: '10px 16px',
          borderRadius: '8px',
          background: toast.type === 'success' ? '#dcfce7' : '#e0f2fe',
          color: toast.type === 'success' ? '#15803d' : '#0369a1',
          marginBottom: '16px',
          fontWeight: 600,
          fontSize: '0.88rem'
        }}>
          {toast.message}
        </div>
      )}

      {/* Calendar Grid Container */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #e2e8f0)',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      }}>
        {/* Days Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
            <div key={day} style={{ padding: '10px', textAlign: 'center', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Days Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', autoRows: 'minmax(120px, auto)' }}>
          {calendarDays.map((date, idx) => {
            if (!date) {
              return <div key={`empty_${idx}`} style={{ background: 'var(--bg-secondary, #f1f5f9)', borderRight: '1px solid var(--border-color, #e2e8f0)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }} />;
            }
            const isToday = new Date().toDateString() === date.toDateString();
            const daySchedules = getSchedulesForDate(date);

            return (
              <div
                key={date.toISOString()}
                onClick={() => handleOpenDayModal(date)}
                style={{
                  borderRight: '1px solid var(--border-color, #e2e8f0)',
                  borderBottom: '1px solid var(--border-color, #e2e8f0)',
                  padding: '8px',
                  background: isToday ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: isToday ? 700 : 600,
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isToday ? '#2563eb' : 'transparent',
                    color: isToday ? '#ffffff' : 'var(--text-color, #334155)',
                  }}>
                    {date.getDate()}
                  </span>
                  {daySchedules.length > 0 && (
                    <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '10px', fontWeight: 600 }}>
                      {daySchedules.length} envíos
                    </span>
                  )}
                </div>

                {/* Scheduled Items list on this day */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {daySchedules.map(item => {
                    const timeStr = (item.scheduledTime || (item as any).scheduledAt || '').split('T')[1]?.substring(0, 5) || '10:00';
                    const textPreview = item.name || item.payload?.text || item.payload?.caption || (item as any).text || 'Mensaje programado';
                    const recipientsCount = item.payload?.recipients?.length || (item as any).recipients?.length || 0;

                    return (
                      <div
                        key={item.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`¿Deseas cancelar/eliminar este envío programado del ${timeStr}?`)) {
                            await messageApi.deleteScheduledBroadcast(session, item.id);
                            void loadSchedules();
                            setToast({ type: 'info', message: 'Envío cancelado.' });
                          }
                        }}
                        style={{
                          fontSize: '0.74rem',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          background: '#e0f2fe',
                          color: '#0369a1',
                          border: '1px solid #7dd3fc',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`${timeStr} - ${textPreview}`}
                      >
                        ⏱️ {timeStr} ({recipientsCount} grp) - {textPreview}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal for Scheduling New Broadcast */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            color: 'var(--text-color, #1e293b)'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
              🗓️ Agendar Publicación Masiva
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginBottom: '16px' }}>
              Fecha seleccionada: <strong>{selectedDateStr}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  ⏰ Hora de Envío:
                </label>
                <input
                  type="time"
                  value={modalTime}
                  onChange={e => setModalTime(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-secondary, #ffffff)',
                    color: 'var(--text-color, #334155)',
                    width: '140px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  💬 Mensaje a Enviar (Soporta Spintax {'{Hola|Buenas}'}):
                </label>
                <textarea
                  rows={4}
                  value={modalText}
                  onChange={e => setModalText(e.target.value)}
                  placeholder="Escribe tu oferta o mensaje promocional..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-secondary, #ffffff)',
                    color: 'var(--text-color, #334155)',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  👥 Destinatarios (1 número o JID por línea):
                </label>
                <textarea
                  rows={4}
                  value={modalRecipients}
                  onChange={e => setModalRecipients(e.target.value)}
                  placeholder="56912345678&#10;120363045678901234@g.us&#10;56987654321"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-secondary, #ffffff)',
                    color: 'var(--text-color, #334155)',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-color, #475569)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSchedule}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Agendar Envío
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
