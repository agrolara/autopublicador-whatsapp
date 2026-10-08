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
  ListPlus,
  History,
  Clock,
  Trash2,
  ShieldAlert,
  Image as ImageIcon,
  Upload,
  X,
  Tag,
  Calendar as CalendarIcon,
  Repeat,
  FolderPlus,
} from 'lucide-react';
import {
  contactApi,
  messageApi,
  contactCategoriesApi,
  type Contact,
  type ScheduledBroadcastItem,
  type ContactCategoryItem,
} from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSessionsQuery, useTemplatesQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../hooks/useToast';
import './Contacts.css';

type MainTab = 'contacts' | 'create_broadcast' | 'campaign_history';
type FilterType = 'all' | 'saved' | 'unsaved';

export function Contacts() {
  useDocumentTitle('Gestión de Contactos y Difusiones');
  const toast = useToast();

  const { data: sessions = [] } = useSessionsQuery();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<MainTab>('contacts');

  // Tab 1: Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Contact Categories state
  const [categories, setCategories] = useState<ContactCategoryItem[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [categoryNameInput, setCategoryNameInput] = useState<string>('');
  const [categoryColorInput, setCategoryColorInput] = useState<string>('#10b981');
  const [existingCategoryIdToAppend, setExistingCategoryIdToAppend] = useState<string>('');

  // Tab 2: Create Broadcast state
  const [campaignName, setCampaignName] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [attachedImage, setAttachedImage] = useState<{
    base64?: string;
    url?: string;
    mimetype?: string;
    name?: string;
  } | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [targetAudience, setTargetAudience] = useState<string>('selected');
  const [minDelay, setMinDelay] = useState<number>(4);
  const [maxDelay, setMaxDelay] = useState<number>(12);
  const [batchRestInterval, setBatchRestInterval] = useState<number>(30); // Pause after N msgs
  const [batchRestDuration, setBatchRestDuration] = useState<number>(3); // Pause duration in mins
  const [maxCap, setMaxCap] = useState<number>(5000);

  // Schedule options (with Calendar date picker)
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [frequency, setFrequency] = useState<'once' | 'daily' | 'twice_daily'>('once');

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

  // Tab 3: Campaign History state
  const [scheduledCampaigns, setScheduledCampaigns] = useState<ScheduledBroadcastItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);

  const { data: templates = [] } = useTemplatesQuery(selectedSessionId || 'default', true);

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      const ready = sessions.find(s => s.status === 'ready');
      setSelectedSessionId(ready ? ready.id : sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Load contacts
  const fetchContacts = async () => {
    if (!selectedSessionId) return;
    try {
      setLoadingContacts(true);
      const data = await contactApi.list(selectedSessionId);
      setContacts(data);
    } catch (err) {
      toast.error('Error cargando contactos', err instanceof Error ? err.message : 'Error desconocido');
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchCategories = async () => {
    if (!selectedSessionId) return;
    try {
      const data = await contactCategoriesApi.list(selectedSessionId);
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando categorías:', err);
      setCategories([]);
    }
  };

  useEffect(() => {
    void fetchContacts();
    void fetchCategories();
  }, [selectedSessionId]);

  // Load scheduled campaign history
  const fetchScheduledCampaigns = async () => {
    if (!selectedSessionId) return;
    try {
      setLoadingCampaigns(true);
      const items = await messageApi.getScheduledBroadcasts(selectedSessionId);
      setScheduledCampaigns(items);
    } catch (err) {
      console.error('Error loading scheduled campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'campaign_history') {
      void fetchScheduledCampaigns();
    }
  }, [activeTab, selectedSessionId]);

  // Filter & Search logic
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (filterType === 'saved' && !c.isMyContact) return false;
      if (filterType === 'unsaved' && c.isMyContact) return false;

      if (selectedCategoryFilter !== 'all') {
        const cat = categories.find(k => k.id === selectedCategoryFilter);
        if (cat && !cat.contactIds.includes(c.id)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.name?.toLowerCase().includes(q);
        const pushMatch = c.pushName?.toLowerCase().includes(q);
        const numberMatch = c.number?.includes(q) || c.id.includes(q);
        if (!nameMatch && !pushMatch && !numberMatch) return false;
      }
      return true;
    });
  }, [contacts, filterType, selectedCategoryFilter, searchQuery, categories]);

  const savedCount = useMemo(() => contacts.filter(c => c.isMyContact).length, [contacts]);
  const unsavedCount = useMemo(() => contacts.filter(c => !c.isMyContact).length, [contacts]);

  // Selection logic
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

  // Switch to Create Broadcast with currently selected contacts
  const handleStartCreateBroadcast = () => {
    if (selectedIds.size === 0) {
      setTargetAudience('all');
    } else {
      setTargetAudience('selected');
    }
    setActiveTab('create_broadcast');
  };

  // Target list for broadcast
  const targetContacts = useMemo(() => {
    if (targetAudience === 'selected') {
      return contacts.filter(c => selectedIds.has(c.id)).slice(0, maxCap);
    } else if (targetAudience === 'saved') {
      return contacts.filter(c => c.isMyContact).slice(0, maxCap);
    } else if (targetAudience === 'unsaved') {
      return contacts.filter(c => !c.isMyContact).slice(0, maxCap);
    } else if (targetAudience.startsWith('category_')) {
      const catId = targetAudience.replace('category_', '');
      const cat = categories.find(c => c.id === catId);
      if (cat) {
        return contacts.filter(c => cat.contactIds.includes(c.id)).slice(0, maxCap);
      }
      return [];
    } else {
      return contacts.slice(0, maxCap);
    }
  }, [contacts, selectedIds, targetAudience, categories, maxCap]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      const fullText = [tpl.header, tpl.body, tpl.footer].filter(Boolean).join('\n\n') || (tpl as any).content || (tpl as any).text || '';
      setMessageText(fullText);
      const rawMedia = tpl.mediaUrl || (Array.isArray(tpl.mediaUrls) && tpl.mediaUrls.length > 0 ? tpl.mediaUrls[0] : undefined);
      if (rawMedia) {
        if (typeof rawMedia === 'string' && rawMedia.startsWith('data:')) {
          const mimeMatch = rawMedia.match(/^data:([^;]+);base64,/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          setAttachedImage({
            base64: rawMedia,
            mimetype: mime,
            name: tpl.name ? `Plantilla: ${tpl.name}` : 'Imagen de plantilla',
          });
        } else {
          setAttachedImage({
            url: rawMedia,
            mimetype: 'image/jpeg',
            name: tpl.name ? `Plantilla: ${tpl.name}` : 'Imagen de plantilla',
          });
        }
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Formato inválido', 'Selecciona una imagen en formato PNG, JPG o WEBP.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({
        base64: reader.result as string,
        mimetype: file.type,
        name: file.name,
      });
      toast.success('Imagen lista', `Se adjuntó "${file.name}" a la campaña.`);
    };
    reader.readAsDataURL(file);
  };

  const insertVariable = (variableStr: string) => {
    setMessageText(prev => `${prev} ${variableStr}`);
  };

  // Helper function to resolve Spintax: {Hola|Buenas|Saludos}
  const parseSpintax = (text: string): string => {
    return text.replace(/\{([^{}]+)\}/g, (_, choices: string) => {
      const options = choices.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  };

  // Execute Live Broadcast
  const handleExecuteLiveBroadcast = async () => {
    if (!selectedSessionId || targetContacts.length === 0 || (!messageText.trim() && !attachedImage)) return;

    setIsBroadcasting(true);
    setIsPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;

    setBroadcastProgress({
      total: targetContacts.length,
      current: 0,
      success: 0,
      failed: 0,
      currentContactName: targetContacts[0]?.name || targetContacts[0]?.pushName || targetContacts[0]?.number,
    });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targetContacts.length; i++) {
      if (cancelRef.current) break;

      // Handle pause loop
      while (pauseRef.current && !cancelRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }

      if (cancelRef.current) break;

      const target = targetContacts[i];
      const displayName = target.name || target.pushName || target.number || 'Contacto';
      setBroadcastProgress(prev => ({
        ...prev,
        current: i + 1,
        currentContactName: displayName,
      }));

      // Interpolate variables & resolve Spintax
      let formattedMessage = messageText
        .replace(/\{\{nombre\}\}/gi, displayName)
        .replace(/\{\{name\}\}/gi, displayName)
        .replace(/\{\{numero\}\}/gi, target.number || '');

      formattedMessage = parseSpintax(formattedMessage);

      try {
        if (attachedImage && (attachedImage.base64 || attachedImage.url)) {
          const finalBase64 = attachedImage.base64 || (attachedImage.url?.startsWith('data:') ? attachedImage.url : undefined);
          const finalUrl = !attachedImage.url?.startsWith('data:') ? attachedImage.url : undefined;

          await messageApi.sendMedia(selectedSessionId, target.id, 'image', {
            base64: finalBase64,
            url: finalUrl,
            mimetype: attachedImage.mimetype || 'image/jpeg',
            caption: formattedMessage,
          });
        } else {
          await messageApi.sendText(selectedSessionId, target.id, formattedMessage);
        }
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

      // Check for Batch Rest Pause (e.g. pause 3 mins after every 30 messages)
      if ((i + 1) % batchRestInterval === 0 && i < targetContacts.length - 1 && !cancelRef.current) {
        toast.info(
          'Pausa de Lote Anti-Baneo',
          `Pausando por ${batchRestDuration} minuto(s) tras enviar ${i + 1} mensajes para proteger la cuenta.`,
        );
        await new Promise(r => setTimeout(r, batchRestDuration * 60 * 1000));
      } else if (i < targetContacts.length - 1 && !cancelRef.current) {
        // Random Jitter Delay
        const randomSec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        await new Promise(r => setTimeout(r, randomSec * 1000));
      }
    }

    setIsBroadcasting(false);
    toast.success('Difusión Finalizada', `Éxito: ${successCount}, Fallidos: ${failedCount}`);
    setActiveTab('campaign_history');
  };

  // Schedule Broadcast Campaign
  const handleSaveScheduledCampaign = async () => {
    if (!selectedSessionId || targetContacts.length === 0 || (!messageText.trim() && !attachedImage)) return;

    try {
      const recipientIds = targetContacts.map(c => c.id);
      const messages = recipientIds.map(chatId => {
        if (attachedImage && (attachedImage.base64 || attachedImage.url)) {
          const finalBase64 = attachedImage.base64 || (attachedImage.url?.startsWith('data:') ? attachedImage.url : undefined);
          const finalUrl = !attachedImage.url?.startsWith('data:') ? attachedImage.url : undefined;

          return {
            chatId,
            to: chatId,
            type: 'image' as const,
            content: {
              image: {
                base64: finalBase64,
                url: finalUrl,
                mimetype: attachedImage.mimetype || 'image/jpeg',
              },
              caption: messageText,
            },
            mediaUrl: finalUrl || finalBase64,
          };
        }
        return {
          chatId,
          to: chatId,
          type: 'text' as const,
          content: { text: messageText },
          message: { text: messageText },
        };
      });

      const fullScheduledTime = frequency === 'once'
        ? `${scheduledDate}T${scheduledTime}:00`
        : scheduledTime;

      await messageApi.createScheduledBroadcast(selectedSessionId, {
        name: campaignName.trim() || `Difusión ${new Date().toLocaleDateString()}`,
        scheduledTime: fullScheduledTime,
        frequency,
        startDate: scheduledDate,
        mediaUrls: attachedImage?.url ? [attachedImage.url] : undefined,
        payload: {
          messages: messages as any,
          options: {
            delayBetweenMessages: minDelay * 1000,
            randomizeDelay: true,
          },
        } as any,
      });

      toast.success('Campaña Programada', `La difusión se programó para el ${scheduledDate} a las ${scheduledTime} hrs.`);
      setActiveTab('campaign_history');
    } catch (err) {
      toast.error('Error al programar campaña', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleSaveCategory = async () => {
    if (existingCategoryIdToAppend) {
      const cat = categories.find(c => c.id === existingCategoryIdToAppend);
      if (!cat) return;
      try {
        await contactCategoriesApi.save(selectedSessionId, {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          contactIds: Array.from(selectedIds),
        });
        toast.success('Categoría actualizada', `Se agregaron ${selectedIds.size} contactos a "${cat.name}".`);
        setShowCategoryModal(false);
        setExistingCategoryIdToAppend('');
        void fetchCategories();
      } catch (err: any) {
        toast.error('Error al actualizar categoría', err?.message || 'Error desconocido');
      }
      return;
    }

    if (!categoryNameInput.trim()) {
      toast.error('Nombre requerido', 'Ingresa un nombre para la categoría (ej: Locales Sushi)');
      return;
    }

    try {
      await contactCategoriesApi.save(selectedSessionId, {
        name: categoryNameInput.trim(),
        color: categoryColorInput,
        contactIds: Array.from(selectedIds),
      });
      toast.success('Categoría Creada', `Categoría "${categoryNameInput}" guardada con ${selectedIds.size} contactos.`);
      setShowCategoryModal(false);
      setCategoryNameInput('');
      void fetchCategories();
    } catch (err: any) {
      toast.error('Error al guardar categoría', err?.message || 'Error desconocido');
    }
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la categoría "${name}"?`)) return;
    try {
      await contactCategoriesApi.delete(selectedSessionId, catId);
      toast.success('Categoría eliminada');
      if (selectedCategoryFilter === catId) setSelectedCategoryFilter('all');
      if (targetAudience === `category_${catId}`) setTargetAudience('all');
      void fetchCategories();
    } catch (err: any) {
      toast.error('Error al eliminar categoría', err?.message || 'Error desconocido');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!selectedSessionId) return;
    try {
      await messageApi.deleteScheduledBroadcast(selectedSessionId, id);
      toast.success('Campaña Eliminada');
      void fetchScheduledCampaigns();
    } catch (err) {
      toast.error('Error al eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  return (
    <div className="contacts-page">
      <PageHeader
        title="Gestión de Contactos y Difusiones"
        subtitle="Filtra tu agenda de contactos y crea campañas de difusión masiva con protección anti-baneo"
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

      {/* Main Sub-Tabs */}
      <div className="contacts-tabs">
        <button
          className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          <Users size={18} />
          📇 Lista de Contactos
        </button>
        <button
          className={`tab-btn ${activeTab === 'create_broadcast' ? 'active' : ''}`}
          onClick={() => setActiveTab('create_broadcast')}
        >
          <ListPlus size={18} />
          🚀 Crear Difusión
        </button>
        <button
          className={`tab-btn ${activeTab === 'campaign_history' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaign_history')}
        >
          <History size={18} />
          📊 Historial de Campañas
        </button>
      </div>

      {/* TAB 1: LISTA DE CONTACTOS */}
      {activeTab === 'contacts' && (
        <>
          <div className="contacts-toolbar">
            <div className="contacts-filters">
              <button
                className={`filter-btn ${filterType === 'all' && selectedCategoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setFilterType('all');
                  setSelectedCategoryFilter('all');
                }}
              >
                <Users size={16} />
                Todos ({contacts.length})
              </button>
              <button
                className={`filter-btn ${filterType === 'saved' ? 'active' : ''}`}
                onClick={() => setFilterType('saved')}
              >
                <UserCheck size={16} />
                Guardados ({savedCount})
              </button>
              <button
                className={`filter-btn ${filterType === 'unsaved' ? 'active' : ''}`}
                onClick={() => setFilterType('unsaved')}
              >
                <UserX size={16} />
                No Guardados ({unsavedCount})
              </button>

              {/* Category Filter Pills */}
              {categories.map(cat => {
                const count = contacts.filter(c => cat.contactIds.includes(c.id)).length;
                const isActive = selectedCategoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    className={`filter-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCategoryFilter(isActive ? 'all' : cat.id);
                      setFilterType('all');
                    }}
                    style={{
                      borderColor: isActive ? undefined : (cat.color || '#3b82f6'),
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: cat.color || '#3b82f6',
                        display: 'inline-block',
                      }}
                    />
                    {cat.name} ({count})
                  </button>
                );
              })}
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

          {selectedIds.size > 0 && (
            <div className="broadcast-bar">
              <div className="broadcast-bar-info">
                <CheckCircle2 size={20} style={{ color: '#25d366' }} />
                <span>{selectedIds.size} contacto(s) seleccionado(s)</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setCategoryNameInput('');
                    setExistingCategoryIdToAppend('');
                    setShowCategoryModal(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Tag size={16} />
                  Guardar en Categoría ({selectedIds.size})
                </button>
                <button className="btn-primary" onClick={handleStartCreateBroadcast}>
                  <Send size={16} />
                  🚀 Crear Difusión con Seleccionados ({selectedIds.size})
                </button>
              </div>
            </div>
          )}

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
                    <th>Categorías</th>
                    <th>PushName (WhatsApp)</th>
                    <th>Número de Teléfono</th>
                    <th>Estado de Agenda</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(c => {
                    const isSelected = selectedIds.has(c.id);
                    const displayName = c.name || c.pushName || c.number || 'Contacto';
                    const initial = displayName.charAt(0).toUpperCase();
                    const contactCats = categories.filter(cat => cat.contactIds.includes(c.id));

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
                        <td>
                          {contactCats.length === 0 ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {contactCats.map(cat => (
                                <span
                                  key={cat.id}
                                  className="category-pill"
                                  style={{
                                    backgroundColor: `${cat.color || '#3b82f6'}20`,
                                    borderColor: cat.color || '#3b82f6',
                                    color: cat.color || '#3b82f6',
                                  }}
                                >
                                  {cat.name}
                                </span>
                              ))}
                            </div>
                          )}
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
        </>
      )}

      {/* TAB 2: CREAR DIFUSIÓN */}
      {activeTab === 'create_broadcast' && (
        <div className="create-campaign-card">
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

              <div className="progress-bar-outer" style={{ margin: '1rem 0' }}>
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

              <div style={{ display: 'flex', gap: '1.5rem', margin: '0.75rem 0', fontSize: '0.875rem' }}>
                <span style={{ color: '#25d366' }}>✔ Éxito: {broadcastProgress.success}</span>
                <span style={{ color: '#ef4444' }}>❌ Errores: {broadcastProgress.failed}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    pauseRef.current = !pauseRef.current;
                    setIsPaused(pauseRef.current);
                  }}
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                  {isPaused ? 'Reanudar' : 'Pausar'}
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    cancelRef.current = true;
                    setIsBroadcasting(false);
                  }}
                >
                  <XCircle size={16} /> Cancelar Difusión
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Campaign Name */}
              <div>
                <label className="form-section-title">
                  <ListPlus size={18} /> Nombre de la Campaña de Difusión
                </label>
                <input
                  type="text"
                  placeholder="Ej: Promoción Fin de Semana Pizza 2x1..."
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
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

              {/* Target Audience */}
              <div>
                <label className="form-section-title">
                  <Users size={18} /> Audiencia Destino ({targetContacts.length} contactos seleccionados)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className={`filter-btn ${targetAudience === 'selected' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('selected')}
                  >
                    Contactos Seleccionados ({selectedIds.size})
                  </button>
                  <button
                    className={`filter-btn ${targetAudience === 'all' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('all')}
                  >
                    Todos los contactos ({contacts.length})
                  </button>
                  <button
                    className={`filter-btn ${targetAudience === 'saved' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('saved')}
                  >
                    Solo Guardados ({savedCount})
                  </button>
                  <button
                    className={`filter-btn ${targetAudience === 'unsaved' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('unsaved')}
                  >
                    Solo No Guardados ({unsavedCount})
                  </button>

                  {/* Custom Categories Buttons */}
                  {categories.map(cat => {
                    const count = contacts.filter(c => cat.contactIds.includes(c.id)).length;
                    const isActive = targetAudience === `category_${cat.id}`;
                    return (
                      <button
                        key={cat.id}
                        className={`filter-btn ${isActive ? 'active' : ''}`}
                        onClick={() => setTargetAudience(`category_${cat.id}`)}
                        style={{
                          borderColor: isActive ? undefined : (cat.color || '#3b82f6'),
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: cat.color || '#3b82f6',
                            display: 'inline-block',
                          }}
                        />
                        {cat.name} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Composer */}
              <div>
                <label className="form-section-title">
                  <Send size={18} /> Redactar Mensaje
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

              {/* Image Attachment in Campaign */}
              <div className="image-upload-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ImageIcon size={18} style={{ color: '#25d366' }} /> Adjuntar Imagen a la Difusión (Opcional)
                  </label>
                  {attachedImage && (
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => setAttachedImage(null)}
                    >
                      <Trash2 size={12} /> Quitar Imagen
                    </button>
                  )}
                </div>

                {attachedImage ? (
                  <div className="image-preview-card">
                    <img
                      src={attachedImage.base64 || attachedImage.url}
                      alt="Vista previa"
                      className="image-preview-thumbnail"
                    />
                    <div className="image-preview-info">
                      <strong style={{ color: 'var(--text-color)' }}>{attachedImage.name || 'Imagen adjunta'}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {attachedImage.base64 ? 'Cargada desde archivo local' : 'URL de imagen'}
                      </span>
                      <span style={{ color: '#25d366', fontSize: '0.75rem' }}>
                        ✔ Se enviará junto al mensaje como pie de foto (caption)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="image-remove-btn"
                      onClick={() => setAttachedImage(null)}
                      title="Eliminar imagen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <label
                      className="btn-secondary"
                      style={{
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <Upload size={16} />
                      Subir Imagen (PNG, JPG, WEBP)
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleImageUpload}
                      />
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      o pega una URL de imagen:
                    </span>
                    <input
                      type="text"
                      placeholder="https://ejemplo.com/foto.jpg"
                      value={imageUrlInput}
                      onChange={e => setImageUrlInput(e.target.value)}
                      onBlur={() => {
                        if (imageUrlInput.trim()) {
                          setAttachedImage({ url: imageUrlInput.trim(), name: 'Imagen URL' });
                          setImageUrlInput('');
                        }
                      }}
                      style={{
                        flex: '1',
                        minWidth: '220px',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Variables & Spintax Helpers */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variables dinámicas:</span>
                <button className="variable-tag" onClick={() => insertVariable('{{nombre}}')}>
                  <Sparkles size={12} /> {'{{nombre}}'}
                </button>
                <button className="variable-tag" onClick={() => insertVariable('{{numero}}')}>
                  <Sparkles size={12} /> {'{{numero}}'}
                </button>
                <button className="variable-tag" onClick={() => insertVariable('{Hola|Buenas tardes|Saludos}')}>
                  <Sparkles size={12} /> Spintax: {'{Hola|Buenas|Saludos}'}
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
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                      marginTop: '0.25rem',
                    }}
                  >
                    <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="">
                      Seleccionar plantilla guardada...
                    </option>
                    {templates.map(t => (
                      <option key={t.id} style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Anti-Spam Speed & Batch Settings */}
              <div>
                <label className="form-section-title">
                  <ShieldAlert size={18} style={{ color: '#25d366' }} /> Ajustes de Velocidad y Protección Anti-Baneo
                </label>
                <div className="delay-inputs">
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa Mínima (seg)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minDelay}
                      onChange={e => setMinDelay(parseInt(e.target.value, 10) || 4)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa Máxima (seg)</label>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={maxDelay}
                      onChange={e => setMaxDelay(parseInt(e.target.value, 10) || 10)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa de Lote (cada N msgs)</label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={batchRestInterval}
                      onChange={e => setBatchRestInterval(parseInt(e.target.value, 10) || 30)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duración Descanso Lote (min)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={batchRestDuration}
                      onChange={e => setBatchRestDuration(parseInt(e.target.value, 10) || 3)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Límite Máx Destinatarios (Cap)</label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={maxCap}
                      onChange={e => setMaxCap(parseInt(e.target.value, 10) || 5000)}
                    />
                  </div>
                </div>
              </div>

              {/* Schedule options */}
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <label className="form-section-title">
                  <Clock size={18} /> Programación del Envío
                </label>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={!isScheduled}
                      onChange={() => setIsScheduled(false)}
                    />
                    Enviar Inmediatamente
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={isScheduled}
                      onChange={() => setIsScheduled(true)}
                    />
                    Programar Fecha, Hora y Frecuencia
                  </label>
                </div>

                {isScheduled && (
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                        <CalendarIcon size={14} /> Fecha / Día (Calendario)
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setScheduledDate(e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                        <Clock size={14} /> Hora (HH:MM)
                      </label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={e => setScheduledTime(e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                        <Repeat size={14} /> Frecuencia
                      </label>
                      <select
                        value={frequency}
                        onChange={e => setFrequency(e.target.value as any)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                        }}
                      >
                        <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="once">Una sola vez</option>
                        <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="daily">Diario (Todos los días)</option>
                        <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="twice_daily">Cada 12 Horas</option>
                      </select>
                    </div>

                    <div style={{ flex: '1 1 100%', fontSize: '0.8rem', color: '#25d366', marginTop: '0.5rem' }}>
                      📅 Se programará para el día <strong>{scheduledDate}</strong> a las <strong>{scheduledTime} hrs</strong> ({frequency === 'once' ? 'envío único' : frequency === 'daily' ? 'repetir a diario' : 'cada 12 horas'}).
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button className="btn-secondary" onClick={() => setActiveTab('contacts')}>
                  Cancelar
                </button>
                {isScheduled ? (
                  <button
                    className="btn-primary"
                    onClick={handleSaveScheduledCampaign}
                    disabled={(!messageText.trim() && !attachedImage) || targetContacts.length === 0}
                  >
                    <Clock size={16} /> Guardar Difusión Programada
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={handleExecuteLiveBroadcast}
                    disabled={(!messageText.trim() && !attachedImage) || targetContacts.length === 0}
                  >
                    <Send size={16} /> Iniciar Difusión Inmediata ({targetContacts.length} destinatarios)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: HISTORIAL DE CAMPAÑAS */}
      {activeTab === 'campaign_history' && (
        <div className="campaigns-grid">
          {loadingCampaigns ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : scheduledCampaigns.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
              }}
            >
              <History size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
              <h3>No hay campañas guardadas en el historial</h3>
              <p>Crea tu primera campaña de difusión desde la solapa "🚀 Crear Difusión".</p>
            </div>
          ) : (
            scheduledCampaigns.map(c => (
              <div key={c.id} className="campaign-card">
                <div className="campaign-card-header">
                  <div>
                    <h3 style={{ margin: 0 }}>{c.name || `Difusión ${c.id}`}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Creado el: {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="contact-badge saved">
                      <Clock size={12} /> {c.scheduledTime} ({c.frequency})
                    </span>
                    <button
                      className="btn-danger"
                      style={{ padding: '0.35rem 0.6rem' }}
                      onClick={() => handleDeleteCampaign(c.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--text-color)' }}>
                  <strong>Mensaje:</strong>
                  <p style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '6px', margin: '0.25rem 0' }}>
                    {c.payload?.message?.text || '-'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Destinatarios: {c.payload?.recipients?.length || 0}</span>
                  <span>Delay: {c.payload?.minDelaySeconds ?? 4}s - {c.payload?.maxDelaySeconds ?? 10}s</span>
                  {c.lastRunAt && <span>Último envío: {new Date(c.lastRunAt).toLocaleString()}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Category Creation / Management Modal */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderPlus size={20} style={{ color: '#25d366' }} />
                Crear / Asignar Categoría de Contactos
              </h3>
              <button
                className="btn-secondary"
                style={{ border: 'none', padding: '0.25rem 0.5rem' }}
                onClick={() => setShowCategoryModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Asigna los <strong>{selectedIds.size}</strong> contactos seleccionados a una categoría para crear campañas de difusión dirigidas (ej: Locales Sushi, Pizzerías, VIPs).
            </p>

            {categories.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Opción 1: Agregar a una Categoría Existente
                </label>
                <select
                  value={existingCategoryIdToAppend}
                  onChange={e => {
                    setExistingCategoryIdToAppend(e.target.value);
                    if (e.target.value) setCategoryNameInput('');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                  }}
                >
                  <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="">
                    -- Selecciona una categoría existente --
                  </option>
                  {categories.map(cat => (
                    <option key={cat.id} style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value={cat.id}>
                      {cat.name} ({cat.contactIds.length} contactos actuales)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                {categories.length > 0 ? 'Opción 2: O Crear Nueva Categoría' : 'Nombre de la Nueva Categoría:'}
              </label>
              <input
                type="text"
                placeholder="Ej: Sushi, Locales Sushi, Pizzerías, Proveedores..."
                value={categoryNameInput}
                disabled={Boolean(existingCategoryIdToAppend)}
                onChange={e => setCategoryNameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  opacity: existingCategoryIdToAppend ? 0.5 : 1,
                }}
              />
            </div>

            {!existingCategoryIdToAppend && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Color del Distintivo:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCategoryColorInput(color)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: categoryColorInput === color ? '3px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                        boxShadow: categoryColorInput === color ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={() => setShowCategoryModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveCategory}
                disabled={!existingCategoryIdToAppend && !categoryNameInput.trim()}
              >
                Guardar Categoría ({selectedIds.size} contactos)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
