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
      setSession(sessions[0].id);
    }
  }, [sessions, session]);

  const loadSchedules = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const items = await messageApi.getScheduledBroadcasts(session);
      setSchedules(items);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
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
    return schedules.filter(s => s.scheduledAt.startsWith(formatted));
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
      await messageApi.scheduleBroadcast(session, {
        recipients: modalRecipients.split('\n').map(s => s.trim()).filter(Boolean),
        text: modalText.trim(),
        scheduledAt: fullDateTime,
      });
      setShowModal(false);
      loadSchedules();
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
          <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>Sesión de WhatsApp:</label>
          <select
            value={session}
            onChange={e => setSession(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '4px 8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }} title="Mes Anterior">
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: '1rem', fontWeight: 700, minWidth: '160px', textAlign: 'center', color: '#0f172a' }}>
            {monthNames[month]} {year}
          </span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }} title="Mes Siguiente">
            <ChevronRight size={20} />
          </button>
          <button onClick={todayMonth} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            Hoy
          </button>
        </div>
      </div>

      {/* Calendar Month Grid */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {/* Days Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
            <div key={day} style={{ padding: '12px 0' }}>{day}</div>
          ))}
        </div>

        {/* Days Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', autoRows: 'minmax(120px, auto)' }}>
          {calendarDays.map((date, idx) => {
            if (!date) {
              return <div key={`empty_${idx}`} style={{ background: '#f1f5f9', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }} />;
            }
            const isToday = new Date().toDateString() === date.toDateString();
            const daySchedules = getSchedulesForDate(date);

            return (
              <div
                key={date.toISOString()}
                onClick={() => handleOpenDayModal(date)}
                style={{
                  borderRight: '1px solid #e2e8f0',
                  borderBottom: '1px solid #e2e8f0',
                  padding: '8px',
                  background: isToday ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: isToday ? 700 : 600,
                    color: isToday ? '#2563eb' : '#334155',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isToday ? '#2563eb' : 'transparent',
                    color: isToday ? '#ffffff' : '#334155',
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
                    const isCompleted = item.status === 'completed';
                    const isFailed = item.status === 'failed';
                    const timeStr = item.scheduledAt.split('T')[1]?.substring(0, 5) || '10:00';

                    return (
                      <div
                        key={item.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`¿Deseas cancelar/eliminar este envío programado del ${timeStr}?`)) {
                            await messageApi.deleteScheduledBroadcast(session, item.id);
                            loadSchedules();
                            setToast({ type: 'info', message: 'Envío cancelado.' });
                          }
                        }}
                        style={{
                          fontSize: '0.74rem',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          background: isCompleted ? '#dcfce7' : isFailed ? '#fee2e2' : '#e0f2fe',
                          color: isCompleted ? '#15803d' : isFailed ? '#b91c1c' : '#0369a1',
                          border: '1px solid',
                          borderColor: isCompleted ? '#86efac' : isFailed ? '#fca5a5' : '#7dd3fc',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`${timeStr} - ${item.text}`}
                      >
                        {isCompleted ? '✅' : isFailed ? '❌' : '⏱️'} {timeStr} ({item.recipients.length} grp) - {item.text}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '520px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#0f172a' }}>
              📅 Agendar Publicación Masiva para el {selectedDateStr}
            </h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Hora de Envió (HH:MM):</label>
              <input
                type="time"
                value={modalTime}
                onChange={e => setModalTime(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Mensaje a Publicar:</label>
              <textarea
                rows={4}
                value={modalText}
                onChange={e => setModalText(e.target.value)}
                placeholder="Escribe el texto de tu anuncio de oferta o publicación..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Destinatarios / JIDs de Grupos (uno por línea):
              </label>
              <textarea
                rows={3}
                value={modalRecipients}
                onChange={e => setModalRecipients(e.target.value)}
                placeholder="120363040673899979@g.us..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveSchedule}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Agendar Publicación
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 20px',
          borderRadius: '8px',
          color: '#fff',
          background: toast.type === 'error' ? '#ef4444' : '#16a34a',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          fontWeight: 500,
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
