import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  XCircle,
  Sparkles,
} from 'lucide-react';
import {
  contactApi,
  messageApi,
  type Contact,
  type Session,
} from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSessionsQuery, useTemplatesQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../hooks/useToast';
import './Contacts.css';

type FilterType = 'all' | 'saved' | 'unsaved';

export function Contacts() {
  const { t } = useTranslation();
  const toast = useToast();
  useDocumentTitle('Gestión de Contactos y Difusiones');

  const { data: sessions = [], isLoading: loadingSessions } = useSessionsQuery();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Broadcast modal & sending state
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);
  const [messageText, setMessageText] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [minDelay, setMinDelay] = useState<number>(3);
  const [maxDelay, setMaxDelay] = useState<number>(8);
  const [maxCap, setMaxCap] = useState<number>(100);

  // Live broadcast progress
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{
    total: number;
    current: number;
    success: number;
    failed: number;
    currentContactName?: string;
  }>({ total: 0, current: 0, success: 0, failed: 0 });

  const cancelRef = useRef<boolean>(false);
  const pauseRef = useRef<boolean>(false);

  const { data: templates = [] } = useTemplatesQuery(selectedSessionId || 'default', true);

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      const ready = sessions.find(s => s.status === 'ready');
      setSelectedSessionId(ready ? ready.id : sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Load contacts when active session changes
  useEffect(() => {
    if (!selectedSessionId) return;

    let active = true;
    const fetchContacts = async () => {
      try {
        setLoadingContacts(true);
        const data = await contactApi.list(selectedSessionId);
        if (active) {
          setContacts(data);
          setSelectedIds(new Set());
        }
      } catch (err) {
        if (active) {
          toast.error('Error cargando contactos', err instanceof Error ? err.message : 'Error desconocido');
          setContacts([]);
        }
      } finally {
        if (active) setLoadingContacts(false);
      }
    };

    void fetchContacts();
    return () => {
      active = false;
    };
  }, [selectedSessionId, toast]);

  // Filter & Search logic
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      // Agenda filter
      if (filterType === 'saved' && !c.isMyContact) return false;
      if (filterType === 'unsaved' && c.isMyContact) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.name?.toLowerCase().includes(q);
        const pushMatch = c.pushName?.toLowerCase().includes(q);
        const numberMatch = c.number?.includes(q) || c.id.includes(q);
        if (!nameMatch && !pushMatch && !numberMatch) return false;
      }

      return true;
    });
  }, [contacts, filterType, searchQuery]);

  const savedCount = useMemo(() => contacts.filter(c => c.isMyContact).length, [contacts]);
  const unsavedCount = useMemo(() => contacts.filter(c => !c.isMyContact).length, [contacts]);

  // Checkbox Selection logic
  const isAllFilteredSelected = useMemo(() => {
    if (filteredContacts.length === 0) return false;
    return filteredContacts.every(c => selectedIds.has(c.id));
  }, [filteredContacts, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const next = new Set(selectedIds);
      filteredContacts.forEach(c => next.delete(c.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredContacts.forEach(c => next.add(c.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      setMessageText(tpl.content);
    }
  };

  const insertVariable = (variableStr: string) => {
    setMessageText(prev => `${prev} ${variableStr}`);
  };

  // Start Broadcast Process
  const handleStartBroadcast = async () => {
    if (!selectedSessionId || selectedIds.size === 0 || !messageText.trim()) return;

    const targets = contacts.filter(c => selectedIds.has(c.id)).slice(0, maxCap);
    if (targets.length === 0) return;

    setIsBroadcasting(true);
    setIsPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;

    setBroadcastProgress({
      total: targets.length,
      current: 0,
      success: 0,
      failed: 0,
      currentContactName: targets[0]?.name || targets[0]?.pushName || targets[0]?.number,
    });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;

      // Handle pause loop
      while (pauseRef.current && !cancelRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }

      if (cancelRef.current) break;

      const target = targets[i];
      const displayName = target.name || target.pushName || target.number || 'Contacto';
      setBroadcastProgress(prev => ({
        ...prev,
        current: i + 1,
        currentContactName: displayName,
      }));

      // Interpolate variables
      const formattedMessage = messageText
        .replace(/\{\{nombre\}\}/gi, displayName)
        .replace(/\{\{name\}\}/gi, displayName)
        .replace(/\{\{numero\}\}/gi, target.number || '');

      try {
        await messageApi.sendText(selectedSessionId, target.id, formattedMessage);
        successCount++;
      } catch (err) {
        console.error(`Error sending broadcast to ${target.id}:`, err);
        failedCount++;
      }

      setBroadcastProgress(prev => ({
        ...prev,
        success: successCount,
        failed: failedCount,
      }));

      // Random Delay between minDelay and maxDelay seconds (unless it's the last message)
      if (i < targets.length - 1 && !cancelRef.current) {
        const randomSec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        await new Promise(r => setTimeout(r, randomSec * 1000));
      }
    }

    setIsBroadcasting(false);
    toast.success('Difusión finalizada', `Éxito: ${successCount}, Fallidos: ${failedCount}`);
  };

  const handleCancelBroadcast = () => {
    cancelRef.current = true;
    setIsBroadcasting(false);
  };

  const handleTogglePauseBroadcast = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  };

  return (
    <div className="contacts-page">
      <PageHeader
        title="Gestión de Contactos y Difusiones"
        subtitle="Administra contactos de tu WhatsApp, filtra guardados vs desconocidos y realiza difusiones seguras"
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Sesión:</label>
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-color)',
              }}
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id} ({s.status})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Toolbar & Filters */}
      <div className="contacts-toolbar">
        <div className="contacts-filters">
          <button
            className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            <Users size={16} />
            Todos los contactos
            <span className="filter-count">{contacts.length}</span>
          </button>
          <button
            className={`filter-btn ${filterType === 'saved' ? 'active' : ''}`}
            onClick={() => setFilterType('saved')}
          >
            <UserCheck size={16} />
            Guardados en Agenda
            <span className="filter-count">{savedCount}</span>
          </button>
          <button
            className={`filter-btn ${filterType === 'unsaved' ? 'active' : ''}`}
            onClick={() => setFilterType('unsaved')}
          >
            <UserX size={16} />
            No Guardados / Desconocidos
            <span className="filter-count">{unsavedCount}</span>
          </button>
        </div>

        <div className="contacts-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por nombre o número..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Selected Action Bar */}
      {selectedIds.size > 0 && (
        <div className="broadcast-bar">
          <div className="broadcast-bar-info">
            <CheckCircle2 size={20} style={{ color: '#25d366' }} />
            <span>{selectedIds.size} contacto(s) seleccionado(s)</span>
          </div>
          <button className="btn-primary" onClick={() => setShowBroadcastModal(true)}>
            <Send size={16} />
            🚀 Crear Difusión con Seleccionados ({Math.min(selectedIds.size, maxCap)})
          </button>
        </div>
      )}

      {/* Contacts Table */}
      <div className="contacts-table-container">
        {loadingContacts ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Users size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
            <h3>No se encontraron contactos</h3>
            <p>Intenta cambiar los filtros de búsqueda o seleccionar otra sesión.</p>
          </div>
        ) : (
          <table className="contacts-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input type="checkbox" checked={isAllFilteredSelected} onChange={toggleSelectAll} />
                </th>
                <th>Contacto</th>
                <th>WhatsApp PushName</th>
                <th>Teléfono / Número</th>
                <th>Estado de Agenda</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map(c => {
                const isSelected = selectedIds.has(c.id);
                const displayName = c.name || c.pushName || c.number || 'Contacto';
                const initial = displayName.charAt(0).toUpperCase();

                return (
                  <tr key={c.id} style={{ background: isSelected ? 'rgba(37, 211, 102, 0.05)' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)} />
                    </td>
                    <td>
                      <div className="avatar-cell">
                        <div className="contact-avatar">
                          {c.profilePicUrl ? <img src={c.profilePicUrl} alt={displayName} /> : initial}
                        </div>
                        <div>
                          <strong>{c.name || 'Sin nombre guardado'}</strong>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.pushName || '-'}</td>
                    <td>
                      <code>{c.number || c.id.split('@')[0]}</code>
                    </td>
                    <td>
                      {c.isMyContact ? (
                        <span className="contact-badge saved">
                          <UserCheck size={12} /> Guardado
                        </span>
                      ) : (
                        <span className="contact-badge unsaved">
                          <UserX size={12} /> Desconocido
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Broadcast Composer Modal */}
      {showBroadcastModal && (
        <Modal
          open
          onClose={() => {
            if (!isBroadcasting) setShowBroadcastModal(false);
          }}
          title="🚀 Enviar Difusión Masiva Personalizada"
          closeLabel="Cerrar"
          footer={
            !isBroadcasting ? (
              <>
                <button className="btn-secondary" onClick={() => setShowBroadcastModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleStartBroadcast}
                  disabled={!messageText.trim() || selectedIds.size === 0}
                >
                  <Send size={16} />
                  Iniciar Difusión ({Math.min(selectedIds.size, maxCap)} destinatarios)
                </button>
              </>
            ) : undefined
          }
        >
          <div className="broadcast-modal-content">
            {isBroadcasting ? (
              <div className="progress-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>
                    {isPaused ? '⏸️ Difusión Pausada' : '🔄 Enviando mensajes de difusión...'}
                  </strong>
                  <span>
                    {broadcastProgress.current} / {broadcastProgress.total}
                  </span>
                </div>

                <div className="progress-bar-outer">
                  <div
                    className="progress-bar-inner"
                    style={{
                      width: `${(broadcastProgress.current / (broadcastProgress.total || 1)) * 100}%`,
                    }}
                  />
                </div>

                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Destinatario actual: <strong>{broadcastProgress.currentContactName}</strong>
                </p>

                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                  <span style={{ color: '#25d366' }}>✔ Éxito: {broadcastProgress.success}</span>
                  <span style={{ color: '#ef4444' }}>❌ Errores: {broadcastProgress.failed}</span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className="btn-secondary" onClick={handleTogglePauseBroadcast}>
                    {isPaused ? <Play size={16} /> : <Pause size={16} />}
                    {isPaused ? 'Reanudar' : 'Pausar'}
                  </button>
                  <button className="btn-danger" onClick={handleCancelBroadcast}>
                    <XCircle size={16} /> Cancelar Difusión
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label style={{ fontWeight: 600, marginBottom: '0.375rem', display: 'block' }}>
                    Mensaje de la Difusión
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Escribe tu mensaje aquí..."
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-color)',
                    }}
                  />
                </div>

                {/* Variables and Templates */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variables dinámicas:</span>
                  <button className="variable-tag" onClick={() => insertVariable('{{nombre}}')}>
                    <Sparkles size={12} /> {'{{nombre}}'}
                  </button>
                  <button className="variable-tag" onClick={() => insertVariable('{{numero}}')}>
                    <Sparkles size={12} /> {'{{numero}}'}
                  </button>
                </div>

                {templates.length > 0 && (
                  <div>
                    <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cargar desde Plantilla:</label>
                    <select
                      value={selectedTemplateId}
                      onChange={e => handleTemplateChange(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-color)',
                        marginTop: '0.25rem',
                      }}
                    >
                      <option value="">Seleccionar plantilla...</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="delay-inputs">
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa Mínima (seg)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minDelay}
                      onChange={e => setMinDelay(parseInt(e.target.value, 10) || 3)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa Máxima (seg)</label>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={maxDelay}
                      onChange={e => setMaxDelay(parseInt(e.target.value, 10) || 8)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Límite Máx Destinatarios</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={maxCap}
                      onChange={e => setMaxCap(parseInt(e.target.value, 10) || 100)}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.375rem' }}>
                  <AlertCircle size={14} style={{ color: 'var(--primary-color)' }} />
                  <span>
                    Los envíos incluirán una pausa aleatoria entre {minDelay}s y {maxDelay}s por cada mensaje para proteger tu cuenta de WhatsApp.
                  </span>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
