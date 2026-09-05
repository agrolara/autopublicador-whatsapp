import { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Edit3,
  Copy,
  Users,
  FileText,
  Sparkles,
  Layers,
  Info,
  CalendarDays,
  Repeat
} from 'lucide-react';
import { messageApi, groupTagsApi, type ScheduledBroadcastItem, type GroupTagItem } from '../services/api';
import { useSessionsQuery, useTemplatesQuery, useSessionGroupsQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';

export function CalendarPage() {
  const { data: sessions = [] } = useSessionsQuery();
  const [session, setSession] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [schedules, setSchedules] = useState<ScheduledBroadcastItem[]>([]);
  const [groupTags, setGroupTags] = useState<GroupTagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  // Queries
  const { data: templates = [] } = useTemplatesQuery(session || 'default', true);
  const { data: groups = [] } = useSessionGroupsQuery(session || 'default', true);

  // Create / Edit / Duplicate Modal State
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'duplicate' | 'view'>('create');
  const [showModal, setShowModal] = useState(false);
  const [activeItem, setActiveItem] = useState<ScheduledBroadcastItem | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('10:00');
  const [formFrequency, setFormFrequency] = useState<'once' | 'daily' | 'twice_daily'>('once');
  const [formText, setFormText] = useState('');
  const [formMessageType, setFormMessageType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text');
  const [formMediaUrl, setFormMediaUrl] = useState('');
  const [formMediaUrls, setFormMediaUrls] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<'active' | 'paused'>('active');
  const [formEndDate, setFormEndDate] = useState('');
  const [formPostToStatus, setFormPostToStatus] = useState(false);
  const [formRecipients, setFormRecipients] = useState<string[]>([]);
  const [manualRecipientsInput, setManualRecipientsInput] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string>('');

  useEffect(() => {
    if (sessions.length > 0 && !session) {
      const ready = sessions.find(s => s.status === 'ready');
      setSession(ready ? ready.id : sessions[0].id);
    }
  }, [sessions, session]);

  const loadData = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [scheds, tags] = await Promise.all([
        messageApi.getScheduledBroadcasts(session).catch(() => []),
        groupTagsApi.list(session).catch(() => []),
      ]);
      setSchedules(Array.isArray(scheds) ? scheds : []);
      setGroupTags(Array.isArray(tags) ? tags : []);
    } catch {
      setSchedules([]);
      setGroupTags([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [session]);

  const showNotification = (type: 'success' | 'info' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

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

  // Determine if a schedule belongs to a specific calendar date
  const getSchedulesForDate = (date: Date) => {
    const formattedDate = date.toISOString().split('T')[0];
    return schedules.filter(s => {
      if (!s) return false;
      const rawTime = s.scheduledTime || (s as any).scheduledAt || '';
      if (s.frequency === 'daily' || s.frequency === 'twice_daily') {
        return true; // Recurring daily shows every day
      }
      if (rawTime.includes('T')) {
        return rawTime.startsWith(formattedDate);
      }
      // If only HH:MM was provided on a 'once' frequency, compare creation date
      const createdDate = s.createdAt ? s.createdAt.split('T')[0] : '';
      return createdDate === formattedDate;
    });
  };

  // Helper to extract text, media and recipients from payload
  const getItemDetails = (item: ScheduledBroadcastItem) => {
    const timeOnly = (item.scheduledTime || '').includes('T')
      ? item.scheduledTime.split('T')[1]?.substring(0, 5)
      : item.scheduledTime || '10:00';

    let dateOnly = (item.scheduledTime || '').includes('T')
      ? item.scheduledTime.split('T')[0]
      : item.createdAt ? item.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];

    const firstMsg = item.payload?.messages?.[0];
    let text = (firstMsg as any)?.content?.text
      || (firstMsg as any)?.content?.caption
      || (firstMsg as any)?.message?.text
      || (firstMsg as any)?.message?.caption
      || (item.payload as any)?.text
      || (item as any)?.text
      || '';

    const mediaType = (firstMsg as any)?.type || (firstMsg?.content?.image ? 'image' : firstMsg?.content?.video ? 'video' : 'text');

    // Extract all media URLs (for multi-photo campaigns)
    let mediaUrls: string[] = Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0 ? item.mediaUrls : [];
    if (mediaUrls.length === 0 && Array.isArray(item.payload?.messages)) {
      const firstChatId = (item.payload.messages[0] as any)?.chatId || (item.payload.messages[0] as any)?.to;
      const firstChatMsgs = item.payload.messages.filter((m: any) => ((m as any).chatId || (m as any).to) === firstChatId);
      mediaUrls = firstChatMsgs
        .map((m: any) => m.content?.image?.url || m.content?.video?.url || (m as any).mediaUrl)
        .filter(Boolean);
    }
    const mediaUrl = mediaUrls[0] || (firstMsg as any)?.content?.[mediaType]?.url || (firstMsg as any)?.mediaUrl || '';

    // Deduplicate recipients (in multi-photo campaigns there are multiple messages per recipient)
    let recipients: string[] = [];
    if (Array.isArray(item.payload?.messages)) {
      recipients = Array.from(new Set(
        item.payload.messages
          .map(m => (m as any).chatId || (m as any).to)
          .filter(Boolean)
      ));
    } else if (Array.isArray((item.payload as any)?.recipients)) {
      recipients = Array.from(new Set((item.payload as any).recipients));
    }

    return { timeOnly, dateOnly, text, recipients, mediaType, mediaUrl, mediaUrls };
  };

  // Open Create Modal for specific date
  const handleOpenCreateModal = (date?: Date) => {
    const targetDateStr = date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    setModalMode('create');
    setActiveItem(null);
    setFormName('');
    setFormDate(targetDateStr);
    setFormTime('10:00');
    setFormFrequency('once');
    setFormStatus('active');
    setFormEndDate('');
    setFormPostToStatus(false);
    setFormText('');
    setFormMessageType('text');
    setFormMediaUrl('');
    setFormMediaUrls([]);
    setFormRecipients([]);
    setManualRecipientsInput('');
    setSelectedTagId('');
    setShowModal(true);
  };

  // Open View/Manage Modal
  const handleOpenItemModal = (item: ScheduledBroadcastItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveItem(item);
    const { timeOnly, dateOnly, text, recipients, mediaType, mediaUrl, mediaUrls } = getItemDetails(item);
    setFormName(item.name || `Publicación (${timeOnly})`);
    setFormDate(dateOnly);
    setFormTime(timeOnly);
    setFormFrequency(item.frequency || 'once');
    setFormStatus(item.status || 'active');
    setFormEndDate(item.endDate || '');
    setFormPostToStatus(item.postToStatus ?? false);
    setFormText(text);
    setFormMessageType(mediaType as any || 'text');
    setFormMediaUrl(mediaUrl || '');
    setFormMediaUrls(mediaUrls || []);
    setFormRecipients(recipients);
    setManualRecipientsInput(recipients.join('\n'));
    setModalMode('view');
    setShowModal(true);
  };

  // Toggle active / paused on active item
  const handleToggleActiveItem = async () => {
    if (!activeItem || !session) return;
    try {
      await messageApi.toggleScheduledBroadcast(session, activeItem.id);
      const nextStatus = activeItem.status === 'paused' ? 'active' : 'paused';
      setActiveItem({ ...activeItem, status: nextStatus });
      setFormStatus(nextStatus);
      showNotification('success', nextStatus === 'active' ? '▶️ Campaña reanudada con éxito.' : '⏸️ Campaña pausada.');
      loadData();
    } catch (err: any) {
      showNotification('error', `Error al cambiar estado: ${err?.message}`);
    }
  };

  // Switch to Edit Mode
  const handleStartEdit = () => {
    setModalMode('edit');
  };

  // Switch to Duplicate Mode
  const handleStartDuplicate = () => {
    setModalMode('duplicate');
    setFormName(`Copia de ${formName}`);
    // Default duplicate to tomorrow
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    setFormDate(nextDay.toISOString().split('T')[0]);
  };

  // Handle Delete
  const handleDeleteItem = async () => {
    if (!activeItem || !session) return;
    if (!window.confirm(`¿Estás seguro de eliminar la publicación programada "${activeItem.name || 'Seleccionada'}"?`)) return;

    try {
      await messageApi.deleteScheduledBroadcast(session, activeItem.id);
      setShowModal(false);
      void loadData();
      showNotification('info', 'Publicación programada eliminada.');
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message || 'Error desconocido'}`);
    }
  };

  // Handle Save (Create, Edit, or Duplicate)
  const handleSaveForm = async () => {
    if (!session) return;
    if (!formText.trim()) {
      alert('Por favor escribe el mensaje a enviar.');
      return;
    }

    const recipientList = Array.from(
      new Set([
        ...formRecipients,
        ...manualRecipientsInput.split('\n').map(s => s.trim()).filter(Boolean),
      ])
    );

    if (recipientList.length === 0) {
      alert('Debes seleccionar o ingresar al menos 1 grupo o contacto de destino.');
      return;
    }

    const fullScheduledTime = formFrequency === 'once'
      ? `${formDate}T${formTime}:00`
      : formTime;

    const messages: any[] = [];
    const campaignMediaUrls = formMediaUrls.length > 0 ? formMediaUrls : (formMediaUrl ? [formMediaUrl] : []);

    for (const target of recipientList) {
      if (formMessageType === 'image' && campaignMediaUrls.length > 0) {
        // First image with text caption
        messages.push({
          chatId: target,
          to: target,
          type: 'image',
          content: {
            image: { url: campaignMediaUrls[0] },
            ...(formText.trim() ? { caption: formText.trim() } : {}),
          },
          mediaUrl: campaignMediaUrls[0],
          caption: formText.trim(),
        });
        // Additional images (photos 2 to N)
        for (let i = 1; i < campaignMediaUrls.length; i++) {
          messages.push({
            chatId: target,
            to: target,
            type: 'image',
            content: {
              image: { url: campaignMediaUrls[i] },
            },
            mediaUrl: campaignMediaUrls[i],
          });
        }
      } else if (formMessageType && formMessageType !== 'text' && campaignMediaUrls.length > 0) {
        messages.push({
          chatId: target,
          to: target,
          type: formMessageType,
          content: {
            [formMessageType]: { url: campaignMediaUrls[0] },
            caption: formText.trim(),
          },
          mediaUrl: campaignMediaUrls[0],
          caption: formText.trim(),
        });
      } else {
        messages.push({
          chatId: target,
          to: target,
          type: 'text' as const,
          content: { text: formText.trim() },
          message: { text: formText.trim() },
        });
      }
    }

    const payload = {
      messages,
      options: { delayBetweenMessages: 8000 },
    };

    try {
      if (modalMode === 'edit' && activeItem) {
        await messageApi.updateScheduledBroadcast(session, activeItem.id, {
          name: formName.trim() || `Envío Masivo (${formTime})`,
          scheduledTime: fullScheduledTime,
          frequency: formFrequency,
          status: formStatus,
          endDate: formEndDate || '',
          postToStatus: formPostToStatus,
          mediaUrls: campaignMediaUrls.length > 0 ? campaignMediaUrls : undefined,
          payload,
        });
        showNotification('success', '✨ Publicación programada actualizada correctamente.');
      } else {
        await messageApi.createScheduledBroadcast(session, {
          name: formName.trim() || `Envío Masivo (${formTime})`,
          scheduledTime: fullScheduledTime,
          frequency: formFrequency,
          status: formStatus,
          endDate: formEndDate || undefined,
          postToStatus: formPostToStatus,
          mediaUrls: campaignMediaUrls.length > 0 ? campaignMediaUrls : undefined,
          payload,
        });
        showNotification('success', modalMode === 'duplicate'
          ? '📋 Publicación duplicada con éxito para la nueva fecha.'
          : '✨ Publicación agendada exitosamente en el calendario.');
      }

      setShowModal(false);
      void loadData();
    } catch (err: any) {
      alert(`Error al guardar: ${err?.message || 'Error desconocido'}`);
    }
  };

  // Load from Template helper
  const handleSelectTemplate = (templateId: string) => {
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      const fullText = [tpl.header, tpl.body, tpl.footer].filter(Boolean).join('\n\n') || (tpl as any).content || '';
      setFormText(fullText);
      if (!formName) setFormName(tpl.name);
      if (tpl.mediaType && tpl.mediaType !== 'text') {
        setFormMessageType(tpl.mediaType as any);
        const urls = Array.isArray((tpl as any).mediaUrls) && (tpl as any).mediaUrls.length > 0
          ? (tpl as any).mediaUrls
          : (tpl.mediaUrl ? [tpl.mediaUrl] : []);
        setFormMediaUrls(urls);
        setFormMediaUrl(urls[0] || tpl.mediaUrl || '');
      } else {
        setFormMessageType('text');
        setFormMediaUrl('');
        setFormMediaUrls([]);
      }
    }
  };

  // Group Category Selection Helper
  const handleSelectCategory = (tagId: string) => {
    setSelectedTagId(tagId);
    if (!tagId) return;
    if (tagId === '__ALL_GROUPS__') {
      const allGroupIds = groups.map(g => g.id);
      setFormRecipients(allGroupIds);
      setManualRecipientsInput(allGroupIds.join('\n'));
      return;
    }
    const tag = groupTags.find(t => t.id === tagId);
    if (tag) {
      setFormRecipients(tag.groupIds);
      setManualRecipientsInput(tag.groupIds.join('\n'));
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="📅 Calendario Visual de Publicaciones"
        description="Visualiza, agenda, edita y duplica todas tus campañas masivas en un calendario mensual interactivo."
      />

      {/* Toolbar Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'var(--card-bg, #ffffff)',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #e2e8f0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-color, #334155)' }}>
            Sesión:
          </label>
          <select
            value={session}
            onChange={e => setSession(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              fontSize: '0.88rem',
              fontWeight: 600,
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id} ({s.status})</option>
            ))}
          </select>

          <button
            onClick={() => handleOpenCreateModal()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> + Nueva Publicación
          </button>
        </div>

        {/* Month Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={prevMonth}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: '1.15rem', fontWeight: 700, minWidth: '190px', textAlign: 'center', color: 'var(--text-color, #1e293b)' }}>
            {monthNames[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={todayMonth}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #ffffff)',
              color: 'var(--text-color, #334155)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toast && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '8px',
          background: toast.type === 'success' ? '#dcfce7' : '#e0f2fe',
          color: toast.type === 'success' ? '#15803d' : '#0369a1',
          marginBottom: '16px',
          fontWeight: 600,
          fontSize: '0.9rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}>
          {toast.message}
        </div>
      )}

      {/* Calendar Grid Container */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        borderRadius: '14px',
        border: '1px solid var(--border-color, #e2e8f0)',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      }}>
        {/* Days Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'var(--bg-secondary, #f8fafc)',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
        }}>
          {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(day => (
            <div key={day} style={{ padding: '12px', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Days Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', autoRows: 'minmax(135px, auto)' }}>
          {calendarDays.map((date, idx) => {
            if (!date) {
              return (
                <div
                  key={`empty_${idx}`}
                  style={{
                    background: 'var(--bg-secondary, #f8fafc)',
                    borderRight: '1px solid var(--border-color, #e2e8f0)',
                    borderBottom: '1px solid var(--border-color, #e2e8f0)',
                    opacity: 0.6,
                  }}
                />
              );
            }
            const isToday = new Date().toDateString() === date.toDateString();
            const daySchedules = getSchedulesForDate(date);

            return (
              <div
                key={date.toISOString()}
                onClick={() => handleOpenCreateModal(date)}
                style={{
                  borderRight: '1px solid var(--border-color, #e2e8f0)',
                  borderBottom: '1px solid var(--border-color, #e2e8f0)',
                  padding: '8px',
                  background: isToday ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '0.88rem',
                    fontWeight: isToday ? 800 : 600,
                    width: '26px',
                    height: '26px',
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
                    <span style={{
                      fontSize: '0.72rem',
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 700,
                    }}>
                      {daySchedules.length} {daySchedules.length === 1 ? 'campaña' : 'campañas'}
                    </span>
                  )}
                </div>

                {/* Scheduled Items list on this day */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexGrow: 1 }}>
                  {daySchedules.map(item => {
                    const { timeOnly, text, recipients } = getItemDetails(item);
                    const isDaily = item.frequency === 'daily' || item.frequency === 'twice_daily';
                    const displayName = item.name || text.substring(0, 24) || 'Envío Masivo';

                    return (
                      <div
                        key={`${item.id}_${date.getDate()}`}
                        onClick={(e) => handleOpenItemModal(item, e)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: isDaily ? 'rgba(16, 185, 129, 0.12)' : 'rgba(37, 99, 235, 0.1)',
                          color: isDaily ? '#065f46' : '#1e40af',
                          border: `1px solid ${isDaily ? '#6ee7b7' : '#93c5fd'}`,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                        title={`Haz clic para ver, editar o duplicar\nHora: ${timeOnly}\nDestinatarios: ${recipients.length}\nMensaje: ${text}`}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>⏰ {timeOnly}</span>
                          {isDaily && <span style={{ fontSize: '0.65rem', background: '#10b981', color: '#fff', padding: '0 4px', borderRadius: '4px' }}>Diario</span>}
                        </div>
                        <div style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-color, #1e293b)',
                          fontWeight: 700,
                        }}>
                          {displayName}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #64748b)', opacity: 0.85 }}>
                          👥 {recipients.length} grupos/contactos
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: View, Edit, Duplicate, or Create */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            color: 'var(--text-color, #1e293b)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {modalMode === 'view' && <>👁️ Publicación Programada</>}
                  {modalMode === 'edit' && <>✏️ Editar Publicación Programada</>}
                  {modalMode === 'duplicate' && <>📋 Duplicar Publicación a Otra Fecha</>}
                  {modalMode === 'create' && <>🗓️ Agendar Nueva Publicación Masiva</>}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginTop: '4px', marginBottom: 0 }}>
                  {modalMode === 'view' ? 'Revisa todos los detalles, modifica o duplica esta publicación para otro día.' : 'Configura la fecha, hora, contenido y destinatarios de tu campaña.'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted, #64748b)',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* View Mode Details */}
            {modalMode === 'view' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  background: 'var(--bg-secondary, #f8fafc)',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Tema / Nombre:</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-color, #1e293b)' }}>{formName}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Fecha:</span>
                      <div style={{ fontWeight: 600 }}>{formDate}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Hora de Envío:</span>
                      <div style={{ fontWeight: 600 }}>⏰ {formTime} hrs</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Frecuencia:</span>
                      <div style={{ fontWeight: 600 }}>
                        {formFrequency === 'daily' ? '🔄 Diario' : formFrequency === 'twice_daily' ? '🔄 2 veces al día' : '🎯 Única vez'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Destinatarios ({formRecipients.length}):</span>
                    <div style={{
                      maxHeight: '80px',
                      overflowY: 'auto',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      background: 'var(--card-bg, #ffffff)',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      marginTop: '4px',
                    }}>
                      {formRecipients.join(', ') || 'Sin destinatarios'}
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color, #334155)' }}>💬 Mensaje / Plantilla:</span>
                  <div style={{
                    background: 'var(--bg-secondary, #f8fafc)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.88rem',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    marginTop: '6px',
                  }}>
                    {formText}
                  </div>
                </div>

                {/* Attached Images in View Mode */}
                {(formMediaUrls.length > 0 || formMediaUrl) && (
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color, #334155)' }}>
                      🖼️ Imágenes Adjuntas ({(formMediaUrls.length > 0 ? formMediaUrls : [formMediaUrl]).length}):
                    </span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {(formMediaUrls.length > 0 ? formMediaUrls : [formMediaUrl]).map((url, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                          <img src={url} alt={`Adjunto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', padding: '1px 4px', borderRadius: '4px' }}>
                            #{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions Toolbar in View Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '14px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <button
                    onClick={handleDeleteItem}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleToggleActiveItem}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: formStatus === 'paused' ? '1px solid #86efac' : '1px solid #fcd34d',
                        background: formStatus === 'paused' ? '#f0fdf4' : '#fef3c7',
                        color: formStatus === 'paused' ? '#166534' : '#92400e',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      {formStatus === 'paused' ? '▶️ Reanudar' : '⏸️ Pausar'}
                    </button>
                    <button
                      onClick={handleStartDuplicate}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #f8fafc)',
                        color: 'var(--text-color, #334155)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      <Copy size={16} /> Copiar a Otra Fecha
                    </button>
                    <button
                      onClick={handleStartEdit}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#2563eb',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      <Edit3 size={16} /> Editar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Create / Edit / Duplicate Form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Campaign Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    🏷️ Nombre / Título de la Difusión:
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Ej: Promo Pizza Familiar, Mensaje Quilicura"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      background: 'var(--bg-secondary, #ffffff)',
                      color: 'var(--text-color, #334155)',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>

                {/* Date & Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      📅 Fecha:
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #ffffff)',
                        color: 'var(--text-color, #334155)',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      ⏰ Hora:
                    </label>
                    <input
                      type="time"
                      value={formTime}
                      onChange={e => setFormTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #ffffff)',
                        color: 'var(--text-color, #334155)',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                      }}
                    />
                  </div>
                </div>

                {/* Frequency & Status & End Date */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      🔄 Frecuencia:
                    </label>
                    <select
                      value={formFrequency}
                      onChange={e => setFormFrequency(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #ffffff)',
                        color: 'var(--text-color, #334155)',
                        fontSize: '0.88rem',
                      }}
                    >
                      <option value="once">Única vez</option>
                      <option value="daily">Diario (Todos los días)</option>
                      <option value="twice_daily">2 veces al día (cada 12h)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Estado:
                    </label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #ffffff)',
                        color: 'var(--text-color, #334155)',
                        fontSize: '0.88rem',
                      }}
                    >
                      <option value="active">🟢 Activo</option>
                      <option value="paused">⏸️ Pausado</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      📅 Fecha Límite (Opcional):
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={e => setFormEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #ffffff)',
                        color: 'var(--text-color, #334155)',
                        fontSize: '0.88rem',
                      }}
                    />
                  </div>
                </div>

                {/* WhatsApp Status Toggle */}
                <div
                  style={{
                    background: formPostToStatus ? '#eff6ff' : 'var(--bg-secondary, #f8fafc)',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: formPostToStatus ? '1px solid #93c5fd' : '1px solid var(--border-color, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  onClick={() => setFormPostToStatus(!formPostToStatus)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: formPostToStatus ? '#1e40af' : 'var(--text-color, #334155)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📲 Publicar también en Mis Estados de WhatsApp (Historias 24 hrs)
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                      Sube automáticamente el contenido multimedia / texto a tu historia de WhatsApp a la misma hora.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formPostToStatus}
                    onChange={e => setFormPostToStatus(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
                    onClick={e => e.stopPropagation()}
                  />
                </div>

                {/* Templates Selector */}
                {templates.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      📝 Cargar desde Plantilla Guardada:
                    </label>
                    <select
                      onChange={e => handleSelectTemplate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        background: 'var(--bg-secondary, #ffffff)',
                        color: 'var(--text-color, #334155)',
                        fontSize: '0.88rem',
                      }}
                    >
                      <option value="">-- Seleccionar una plantilla... --</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Message Text with Spintax */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      💬 Mensaje (Soporta Spintax):
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormText(prev => `${prev} {Hola|Buenas tardes|Saludos}`)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      <Sparkles size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Insertar Spintax
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={formText}
                    onChange={e => setFormText(e.target.value)}
                    placeholder="Escribe tu mensaje o promoción aquí..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      background: 'var(--bg-secondary, #ffffff)',
                      color: 'var(--text-color, #334155)',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>

                {/* Attached Images Preview in Form Mode */}
                {formMessageType === 'image' && (formMediaUrls.length > 0 || formMediaUrl) && (
                  <div style={{ padding: '10px 12px', background: 'var(--bg-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-color, #475569)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🖼️ Imágenes que se enviarán ({(formMediaUrls.length > 0 ? formMediaUrls : [formMediaUrl]).length} foto{(formMediaUrls.length > 0 ? formMediaUrls : [formMediaUrl]).length > 1 ? 's' : ''}):
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(formMediaUrls.length > 0 ? formMediaUrls : [formMediaUrl]).map((url, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                          <img src={url} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', padding: '1px 4px', borderRadius: '4px' }}>
                            #{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category / Groups Quick Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    🏷️ Asignar Grupos por Categoría:
                  </label>
                  <select
                    value={selectedTagId}
                    onChange={e => handleSelectCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      background: 'var(--bg-secondary, #ffffff)',
                      color: 'var(--text-color, #334155)',
                      fontSize: '0.88rem',
                    }}
                  >
                    <option value="">-- Seleccionar categoría de grupos... --</option>
                    <option value="__ALL_GROUPS__">📢 Todos los Grupos ({groups.length} grupos)</option>
                    {groupTags.map(tag => (
                      <option key={tag.id} value={tag.id}>🏷️ {tag.name} ({tag.groupIds.length} grupos)</option>
                    ))}
                  </select>
                </div>

                {/* Manual Recipients Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    👥 Destinatarios ({manualRecipientsInput.split('\n').filter(Boolean).length} seleccionados):
                  </label>
                  <textarea
                    rows={3}
                    value={manualRecipientsInput}
                    onChange={e => setManualRecipientsInput(e.target.value)}
                    placeholder="120363045678901234@g.us&#10;56912345678"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      background: 'var(--bg-secondary, #ffffff)',
                      color: 'var(--text-color, #334155)',
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', paddingTop: '14px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <button
                    onClick={() => {
                      if (modalMode === 'edit' || modalMode === 'duplicate') {
                        setModalMode('view');
                      } else {
                        setShowModal(false);
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
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
                    onClick={handleSaveForm}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {modalMode === 'edit' ? 'Guardar Cambios' : modalMode === 'duplicate' ? 'Duplicar a Esta Fecha' : 'Agendar Publicación'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
