import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart2,
  Plus,
  RefreshCw,
  Clock,
  Users,
  MessageSquare,
  Download,
  Trash2,
  Calendar,
  CheckCircle,
  Bell,
  Search,
  AlertCircle,
  Sparkles,
  PauseCircle,
  PlayCircle,
  Loader2,
  X,
  ExternalLink,
  Folder,
  Phone,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  pollsApi,
  sessionApi,
  groupTagsApi,
  type PollItem,
  type CreatePollPayload,
  type PollVoteItem,
  type GroupTagItem,
} from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSessionsQuery } from '../hooks/queries';
import { useToast } from '../hooks/useToast';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import './Polls.css';

interface GroupItem {
  id: string;
  name: string;
}

interface ConsolidatedGroupInfo {
  pollId: string;
  chatId: string;
  chatName: string;
  votesCount: number;
  status: string;
  lastCitedAt?: string | null;
}

interface ConsolidatedCampaign {
  question: string;
  sessionId: string;
  options: string[];
  totalVotes: number;
  otherResponsesCount: number;
  groupCount: number;
  groups: ConsolidatedGroupInfo[];
  optionResults: { option: string; votes: number; percentage: number }[];
  citationEnabled: boolean;
  baseTime: string;
  citationTimes: string[];
  endDate?: string | null;
  latestCreatedAt: string;
  pollIds: string[];
  allVotes: PollVoteItem[];
}

export function Polls() {
  useDocumentTitle('Encuestas WhatsApp | OpenWA');
  const { addToast } = useToast();
  const { data: sessions = [], isLoading: loadingSessions } = useSessionsQuery();

  const [polls, setPolls] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [viewMode, setViewMode] = useState<'consolidated' | 'individual'>('consolidated');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [citingCampaignKey, setCitingCampaignKey] = useState<string | null>(null);
  const [deletingCampaignKey, setDeletingCampaignKey] = useState<string | null>(null);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<PollItem | null>(null);
  const [detailTab, setDetailTab] = useState<'voters' | 'suggestions'>('voters');

  // Action loading states
  const [citingPollId, setCitingPollId] = useState<string | null>(null);
  const [togglingPollId, setTogglingPollId] = useState<string | null>(null);
  const [deletingPollId, setDeletingPollId] = useState<string | null>(null);
  const [submittingPoll, setSubmittingPoll] = useState(false);

  // Create form state
  const [newSessionId, setNewSessionId] = useState('');
  const [chatType, setChatType] = useState<'group' | 'category' | 'personal'>('group');
  const [availableGroups, setAvailableGroups] = useState<GroupItem[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupJid, setSelectedGroupJid] = useState('');
  const [chatName, setChatName] = useState('');
  const [groupSearchInModal, setGroupSearchInModal] = useState('');

  // Category / Group Tags state
  const [groupTags, setGroupTags] = useState<GroupTagItem[]>([]);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [sendToAllInTag, setSendToAllInTag] = useState(true);

  // Personal Phone state
  const [personalPhone, setPersonalPhone] = useState('');
  const [personalName, setPersonalName] = useState('');

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['Opción 1', 'Opción 2', 'Otras']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [otherKeyword, setOtherKeyword] = useState('otras');

  // Citation schedule form state
  const [citationEnabled, setCitationEnabled] = useState(true);
  const [baseTime, setBaseTime] = useState('10:00');
  const [citationTimes, setCitationTimes] = useState<string[]>([]);
  const [endDate, setEndDate] = useState('');
  const [reminderMessage, setReminderMessage] = useState(
    '📢 ¡Recordatorio! Recuerda participar y dejar tu voto en la encuesta de arriba ☝️'
  );

  // Fetch polls
  const fetchPolls = useCallback(async () => {
    try {
      setLoading(true);
      const data = await pollsApi.list(selectedSessionFilter || undefined);
      setPolls(data);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al cargar encuestas',
        message: err?.message || 'No se pudieron obtener las encuestas',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedSessionFilter, addToast]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Load groups and categories when session changes in creation modal
  useEffect(() => {
    if (!newSessionId) {
      setAvailableGroups([]);
      setGroupTags([]);
      return;
    }
    let active = true;
    setLoadingGroups(true);
    Promise.all([
      sessionApi.getGroups(newSessionId).catch(() => []),
      groupTagsApi.list(newSessionId).catch(() => []),
    ])
      .then(([groups, tags]) => {
        if (!active) return;
        setAvailableGroups(groups || []);
        setGroupTags(tags || []);
        if (groups && groups.length > 0 && !selectedGroupJid) {
          setSelectedGroupJid(groups[0].id);
          setChatName(groups[0].name || groups[0].id);
        }
        if (tags && tags.length > 0 && !selectedTagId) {
          setSelectedTagId(tags[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        setAvailableGroups([]);
        setGroupTags([]);
      })
      .finally(() => {
        if (active) setLoadingGroups(false);
      });
    return () => {
      active = false;
    };
  }, [newSessionId]);

  // Default first session for create modal
  useEffect(() => {
    if (sessions.length > 0 && !newSessionId) {
      const readySession = sessions.find(s => s.status === 'ready') || sessions[0];
      setNewSessionId(readySession.id);
    }
  }, [sessions, newSessionId]);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = polls.length;
    const totalVotes = polls.reduce((sum, p) => sum + (p.totalVotes || 0), 0);
    const activeCitations = polls.filter(p => p.citationEnabled && p.status === 'active').length;
    const totalOtherSuggestions = polls.reduce((sum, p) => sum + (p.otherResponsesCount || 0), 0);
    return { total, totalVotes, activeCitations, totalOtherSuggestions };
  }, [polls]);

  // Filtered polls
  const filteredPolls = useMemo(() => {
    return polls.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchQuestion = p.question.toLowerCase().includes(q);
        const matchChat = (p.chatName || p.chatId).toLowerCase().includes(q);
        if (!matchQuestion && !matchChat) return false;
      }
      return true;
    });
  }, [polls, statusFilter, searchQuery]);

  // Consolidated Campaigns Memo
  const consolidatedCampaigns = useMemo(() => {
    const map = new Map<string, ConsolidatedCampaign>();

    for (const poll of filteredPolls) {
      const qKey = poll.question.trim().toLowerCase();
      let camp = map.get(qKey);
      if (!camp) {
        camp = {
          question: poll.question.trim(),
          sessionId: poll.sessionId,
          options: [...poll.options],
          totalVotes: 0,
          otherResponsesCount: 0,
          groupCount: 0,
          groups: [],
          optionResults: poll.options.map(opt => ({ option: opt, votes: 0, percentage: 0 })),
          citationEnabled: poll.citationEnabled,
          baseTime: poll.baseTime,
          citationTimes: poll.citationTimes || [],
          endDate: poll.endDate,
          latestCreatedAt: poll.createdAt,
          pollIds: [],
          allVotes: [],
        };
        map.set(qKey, camp);
      }

      camp.groupCount++;
      camp.pollIds.push(poll.id);
      camp.totalVotes += poll.totalVotes || 0;
      camp.otherResponsesCount += poll.otherResponsesCount || 0;
      if (poll.citationEnabled) camp.citationEnabled = true;

      camp.groups.push({
        pollId: poll.id,
        chatId: poll.chatId,
        chatName: poll.chatName || poll.chatId.replace('@g.us', ''),
        votesCount: poll.totalVotes || 0,
        status: poll.status,
        lastCitedAt: poll.lastCitedAt,
      });

      // Aggregate option results
      for (const optRes of poll.optionResults || []) {
        const found = camp.optionResults.find(
          o => o.option.toLowerCase() === optRes.option.toLowerCase(),
        );
        if (found) {
          found.votes += optRes.votes;
        }
      }

      if (poll.votes && poll.votes.length > 0) {
        camp.allVotes.push(...poll.votes);
      }
    }

    // Recalculate consolidated percentages
    for (const camp of map.values()) {
      for (const opt of camp.optionResults) {
        opt.percentage = camp.totalVotes > 0 ? Math.round((opt.votes / camp.totalVotes) * 100) : 0;
      }
    }

    return Array.from(map.values());
  }, [filteredPolls]);

  const toggleCampaignExpand = (qKey: string) => {
    setExpandedCampaigns(prev => ({ ...prev, [qKey]: !prev[qKey] }));
  };

  const handleCiteCampaign = async (camp: ConsolidatedCampaign) => {
    try {
      setCitingCampaignKey(camp.question);
      let count = 0;
      for (const pId of camp.pollIds) {
        await pollsApi.cite(pId).catch(() => undefined);
        count++;
        if (camp.pollIds.length > 1) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
      addToast({
        type: 'success',
        title: 'Citas masivas enviadas',
        message: `Se enviaron recordatorios a los ${count} grupos de la campaña.`,
      });
      fetchPolls();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error al citar campaña', message: err?.message });
    } finally {
      setCitingCampaignKey(null);
    }
  };

  const handleDeleteCampaign = async (camp: ConsolidatedCampaign) => {
    if (!window.confirm(`¿Estás seguro de eliminar la encuesta consolidada en los ${camp.groupCount} grupos?`)) return;
    try {
      setDeletingCampaignKey(camp.question);
      for (const pId of camp.pollIds) {
        await pollsApi.delete(pId).catch(() => undefined);
      }
      addToast({
        type: 'success',
        title: 'Campaña eliminada',
        message: `Se eliminaron las encuestas de los ${camp.groupCount} grupos.`,
      });
      fetchPolls();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error al eliminar campaña', message: err?.message });
    } finally {
      setDeletingCampaignKey(null);
    }
  };

  const handleOpenCampaignDetail = (camp: ConsolidatedCampaign) => {
    const syntheticDetail: PollItem = {
      id: camp.pollIds[0] || 'consolidated',
      sessionId: camp.sessionId,
      chatId: 'consolidated',
      chatName: `Campaña Consolidada (${camp.groupCount} grupos)`,
      messageId: 'consolidated',
      question: camp.question,
      options: camp.options,
      allowMultipleAnswers: false,
      status: 'active',
      citationEnabled: camp.citationEnabled,
      baseTime: camp.baseTime,
      citationTimes: camp.citationTimes,
      endDate: camp.endDate || null,
      reminderMessage: '',
      lastCitedAt: null,
      totalVotes: camp.totalVotes,
      optionResults: camp.optionResults,
      otherResponsesCount: camp.otherResponsesCount,
      votes: camp.allVotes,
      createdAt: camp.latestCreatedAt,
      updatedAt: camp.latestCreatedAt,
    };
    setSelectedPoll(syntheticDetail);
    setDetailTab(camp.otherResponsesCount > 0 ? 'suggestions' : 'voters');
    setDetailModalOpen(true);
  };

  // Handle immediate citation
  const handleCiteNow = async (pollId: string) => {
    try {
      setCitingPollId(pollId);
      const res = await pollsApi.cite(pollId);
      addToast({
        type: 'success',
        title: 'Encuesta citada con éxito',
        message: res.message || 'Se envió la cita interactiva en WhatsApp',
      });
      fetchPolls();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al citar encuesta',
        message: err?.message || 'No se pudo enviar la cita',
      });
    } finally {
      setCitingPollId(null);
    }
  };

  // Toggle citation enable/disable
  const handleToggleCitation = async (poll: PollItem) => {
    try {
      setTogglingPollId(poll.id);
      const newEnabled = !poll.citationEnabled;
      await pollsApi.update(poll.id, { citationEnabled: newEnabled });
      addToast({
        type: 'success',
        title: newEnabled ? 'Citas automáticas activadas' : 'Citas automáticas pausadas',
        message: newEnabled
          ? `La encuesta se citará diariamente a las ${poll.baseTime}`
          : 'Se detuvieron los recordatorios programados',
      });
      fetchPolls();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al actualizar citas',
        message: err?.message || 'No se pudo cambiar el estado de citas',
      });
    } finally {
      setTogglingPollId(null);
    }
  };

  // Delete poll
  const handleDeletePoll = async (pollId: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta encuesta del registro de OpenWA?')) return;
    try {
      setDeletingPollId(pollId);
      await pollsApi.delete(pollId);
      addToast({
        type: 'success',
        title: 'Encuesta eliminada',
      });
      fetchPolls();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al eliminar',
        message: err?.message || 'No se pudo eliminar la encuesta',
      });
    } finally {
      setDeletingPollId(null);
    }
  };

  // View poll details
  const handleOpenDetail = async (poll: PollItem) => {
    try {
      const fullPoll = await pollsApi.getById(poll.id);
      setSelectedPoll(fullPoll);
      setDetailTab(fullPoll.otherResponsesCount > 0 ? 'suggestions' : 'voters');
      setDetailModalOpen(true);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al cargar detalles',
        message: err?.message,
      });
    }
  };

  // Create poll submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionId) {
      addToast({ type: 'warning', title: 'Selecciona una sesión de WhatsApp' });
      return;
    }

    if (!question.trim()) {
      addToast({ type: 'warning', title: 'Escribe la pregunta de la encuesta' });
      return;
    }

    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      addToast({ type: 'warning', title: 'Debes ingresar al menos 2 opciones' });
      return;
    }

    // Determine target destinations
    interface DestTarget {
      chatId: string;
      chatName?: string;
    }
    const targets: DestTarget[] = [];

    if (chatType === 'category') {
      const tag = groupTags.find(t => t.id === selectedTagId);
      if (!tag || tag.groupIds.length === 0) {
        addToast({ type: 'warning', title: 'La categoría seleccionada no tiene grupos asociados' });
        return;
      }
      if (sendToAllInTag) {
        for (const gid of tag.groupIds) {
          const gInfo = availableGroups.find(g => g.id === gid);
          targets.push({ chatId: gid, chatName: gInfo?.name || tag.name });
        }
      } else {
        if (!selectedGroupJid) {
          addToast({ type: 'warning', title: 'Selecciona un grupo de la categoría' });
          return;
        }
        const gInfo = availableGroups.find(g => g.id === selectedGroupJid);
        targets.push({ chatId: selectedGroupJid, chatName: gInfo?.name || chatName });
      }
    } else if (chatType === 'group') {
      if (!selectedGroupJid.trim()) {
        addToast({ type: 'warning', title: 'Selecciona un grupo de destino' });
        return;
      }
      const gInfo = availableGroups.find(g => g.id === selectedGroupJid);
      targets.push({ chatId: selectedGroupJid.trim(), chatName: gInfo?.name || chatName });
    } else if (chatType === 'personal') {
      const cleanDigits = personalPhone.replace(/\D/g, '');
      if (!cleanDigits || cleanDigits.length < 8) {
        addToast({ type: 'warning', title: 'Ingresa un número personal válido con código de país (ej: 569...)' });
        return;
      }
      targets.push({
        chatId: `${cleanDigits}@c.us`,
        chatName: personalName.trim() || undefined,
      });
    }

    if (targets.length === 0) {
      addToast({ type: 'warning', title: 'Indica al menos un destino para la encuesta' });
      return;
    }

    try {
      setSubmittingPoll(true);
      let successCount = 0;
      const failedTargets: { name: string; error: string }[] = [];

      for (let i = 0; i < targets.length; i++) {
        const tgt = targets[i];
        const payload: CreatePollPayload = {
          sessionId: newSessionId,
          chatId: tgt.chatId,
          chatName: tgt.chatName,
          question: question.trim(),
          options: cleanOptions,
          allowMultipleAnswers: allowMultiple,
          otherOptionKeyword: otherKeyword.trim() || 'otras',
          citationEnabled,
          baseTime: citationEnabled ? baseTime : undefined,
          citationTimes: citationEnabled ? citationTimes : undefined,
          endDate: citationEnabled && endDate ? new Date(endDate).toISOString() : undefined,
          reminderMessage: citationEnabled && reminderMessage.trim() ? reminderMessage.trim() : undefined,
        };

        try {
          await pollsApi.create(payload);
          successCount++;
        } catch (err: any) {
          failedTargets.push({
            name: tgt.chatName || tgt.chatId,
            error: err?.message || 'Error al publicar',
          });
        }

        // Polite delay of 600ms between multiple group broadcasts to protect WhatsApp session
        if (targets.length > 1 && i < targets.length - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      if (successCount > 0) {
        if (failedTargets.length === 0) {
          addToast({
            type: 'success',
            title: targets.length > 1 ? `¡${successCount} encuestas publicadas!` : '¡Encuesta creada y publicada!',
            message: targets.length > 1
              ? `Se crearon ${successCount} encuestas para los grupos de la categoría seleccionada.`
              : `La encuesta nativa ya está visible en ${targets[0].chatName || targets[0].chatId}.`,
          });
        } else {
          addToast({
            type: 'warning',
            title: `Publicación parcial: ${successCount} de ${targets.length}`,
            message: `Se publicaron ${successCount} encuestas con éxito. En ${failedTargets.length} grupo(s) no se pudo publicar (el bot no pertenece al grupo o no tiene permisos de envío).`,
          });
        }
        setCreateModalOpen(false);
        // Reset form
        setQuestion('');
        setOptions(['Opción 1', 'Opción 2', 'Otras']);
        setCitationTimes([]);
        setPersonalPhone('');
        setPersonalName('');
        fetchPolls();
      } else {
        const firstErr = failedTargets[0]?.error || 'No se pudo publicar la encuesta en el destino seleccionado';
        addToast({
          type: 'error',
          title: 'Error al crear encuesta',
          message: firstErr,
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al crear encuesta',
        message: err?.message || 'No se pudo enviar la encuesta a WhatsApp',
      });
    } finally {
      setSubmittingPoll(false);
    }
  };

  // Option helper handlers
  const handleAddOption = () => {
    if (options.length >= 12) {
      addToast({ type: 'warning', title: 'Máximo 12 opciones permitidas en WhatsApp' });
      return;
    }
    setOptions(prev => [...prev, `Opción ${prev.length + 1}`]);
  };

  const handleUpdateOption = (index: number, val: string) => {
    setOptions(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      addToast({ type: 'warning', title: 'Una encuesta requiere al menos 2 opciones' });
      return;
    }
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  // Extra citation time helper
  const handleAddCitationTime = () => {
    if (citationTimes.length >= 2) {
      addToast({
        type: 'warning',
        title: 'Límite alcanzado',
        message: 'Máximo 2 horarios adicionales permitidos por día (3 citas diarias en total).',
      });
      return;
    }
    const defaultNewTime = citationTimes.length === 0 ? '14:00' : '19:00';
    setCitationTimes(prev => [...prev, defaultNewTime]);
  };

  const handleUpdateCitationTime = (index: number, val: string) => {
    setCitationTimes(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleRemoveCitationTime = (index: number) => {
    setCitationTimes(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="polls-container">
      <PageHeader
        title="📊 Encuestas de WhatsApp"
        subtitle="Encuestas nativas de WhatsApp con Alternativa A para respuestas de 'Otras', citas y recordatorios automáticos recurrentes."
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="poll-btn"
              onClick={fetchPolls}
              disabled={loading}
              title="Actualizar votos"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refrescar
            </button>
            <button
              className="poll-btn poll-btn-primary"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={16} />
              Nueva Encuesta
            </button>
          </div>
        }
      />

      {/* Metric Cards */}
      <div className="polls-metrics-grid">
        <div className="poll-metric-card">
          <div className="poll-metric-icon blue">
            <BarChart2 size={24} />
          </div>
          <div className="poll-metric-info">
            <span className="poll-metric-value">{metrics.total}</span>
            <span className="poll-metric-label">Total de Encuestas</span>
          </div>
        </div>

        <div className="poll-metric-card">
          <div className="poll-metric-icon green">
            <Users size={24} />
          </div>
          <div className="poll-metric-info">
            <span className="poll-metric-value">{metrics.totalVotes}</span>
            <span className="poll-metric-label">Votos Registrados</span>
          </div>
        </div>

        <div className="poll-metric-card">
          <div className="poll-metric-icon amber">
            <Clock size={24} />
          </div>
          <div className="poll-metric-info">
            <span className="poll-metric-value">{metrics.activeCitations}</span>
            <span className="poll-metric-label">Citas Automáticas Activas</span>
          </div>
        </div>

        <div className="poll-metric-card">
          <div className="poll-metric-icon purple">
            <MessageSquare size={24} />
          </div>
          <div className="poll-metric-info">
            <span className="poll-metric-value">{metrics.totalOtherSuggestions}</span>
            <span className="poll-metric-label">Sugerencias 'Otras' Recibidas</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="polls-filter-bar">
        <div className="polls-filters-left">
          <div className="poll-search-input-wrap">
            <Search size={16} className="poll-search-icon" />
            <input
              type="text"
              placeholder="Buscar por pregunta o grupo..."
              className="poll-search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="poll-select"
            value={selectedSessionFilter}
            onChange={e => setSelectedSessionFilter(e.target.value)}
          >
            <option value="">Todas las sesiones</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || s.id} ({s.status})
              </option>
            ))}
          </select>

          <select
            className="poll-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="closed">Cerradas</option>
          </select>
        </div>

        {/* View Mode Switcher */}
        <div className="polls-view-switcher">
          <button
            type="button"
            className={`view-switcher-btn ${viewMode === 'consolidated' ? 'active' : ''}`}
            onClick={() => setViewMode('consolidated')}
            title="Ver resultados consolidados por campaña/pregunta"
          >
            <Layers size={14} /> Consolidado ({consolidatedCampaigns.length})
          </button>
          <button
            type="button"
            className={`view-switcher-btn ${viewMode === 'individual' ? 'active' : ''}`}
            onClick={() => setViewMode('individual')}
            title="Ver tarjetas individuales por cada grupo"
          >
            <BarChart2 size={14} /> Por Grupos ({filteredPolls.length})
          </button>
        </div>
      </div>

      {/* Polls Grid */}
      {loading && polls.length === 0 ? (
        <div className="polls-empty-state">
          <Loader2 size={40} className="spin polls-empty-icon" />
          <p className="polls-empty-title">Cargando encuestas de WhatsApp...</p>
        </div>
      ) : filteredPolls.length === 0 ? (
        <div className="polls-empty-state">
          <BarChart2 className="polls-empty-icon" />
          <h3 className="polls-empty-title">No hay encuestas para mostrar</h3>
          <p className="polls-empty-desc">
            Crea tu primera encuesta nativa de WhatsApp para difundirla en tus grupos y capturar votos y sugerencias por escrito automáticamente.
          </p>
          <button
            className="poll-btn poll-btn-primary"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={16} /> Crear Primera Encuesta
          </button>
        </div>
      ) : viewMode === 'consolidated' ? (
        <div className="polls-grid">
          {consolidatedCampaigns.map(camp => (
            <div key={camp.question} className="poll-card poll-campaign-card">
              <div className="poll-card-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="poll-campaign-badge">
                      <Layers size={13} /> Campaña Consolidada
                    </span>
                    <span className="poll-groups-badge">
                      👥 {camp.groupCount} {camp.groupCount === 1 ? 'grupo' : 'grupos'}
                    </span>
                  </div>
                  <h4 className="poll-card-question" style={{ marginTop: '6px' }}>{camp.question}</h4>
                </div>
                <span className="poll-status-pill active">Activa</span>
              </div>

              <div className="poll-meta-row">
                <span className="poll-meta-item">
                  🗳️ <strong>{camp.totalVotes}</strong> {camp.totalVotes === 1 ? 'voto total' : 'votos totales'}
                </span>
                <span>•</span>
                <span className="poll-meta-item">
                  💬 <strong>{camp.otherResponsesCount}</strong> sugerencias
                </span>
                <span>•</span>
                <span className="poll-meta-item">
                  🏷️ {camp.groupCount} {camp.groupCount === 1 ? 'destino' : 'destinos'}
                </span>
              </div>

              {/* Citation Schedule Banner */}
              {camp.citationEnabled ? (
                <div className="poll-citation-banner">
                  <div className="poll-citation-title">
                    <Clock size={14} />
                    <span>Citas programadas:</span>
                    <span className="poll-citation-hours">
                      {camp.baseTime}
                      {camp.citationTimes && camp.citationTimes.length > 0
                        ? `, ${camp.citationTimes.join(', ')}`
                        : ''}
                    </span>
                  </div>
                  {camp.endDate ? (
                    <span style={{ fontSize: '0.75rem' }}>
                      📅 Hasta: {new Date(camp.endDate).toLocaleDateString()}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem' }}>📅 Sin fecha de caducidad</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  ⏸️ Citas automáticas desactivadas
                </div>
              )}

              {/* Consolidated Options Progress Bars */}
              <div className="poll-options-preview">
                {camp.optionResults.map(opt => {
                  const isOther = opt.option.toLowerCase().includes('otra');
                  return (
                    <div key={opt.option} className="poll-option-row">
                      <div className="poll-option-header">
                        <span className="poll-option-text">
                          {opt.option}
                          {isOther && <span className="badge-other">Alternativa A</span>}
                        </span>
                        <span className="poll-option-pct">
                          {opt.votes} ({opt.percentage}%)
                        </span>
                      </div>
                      <div className="poll-progress-bg">
                        <div
                          className={`poll-progress-fill ${isOther ? 'other' : ''}`}
                          style={{ width: `${opt.percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Collapsible Groups List */}
              <div>
                <button
                  type="button"
                  className="campaign-groups-toggle"
                  onClick={() => toggleCampaignExpand(camp.question)}
                >
                  {expandedCampaigns[camp.question] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>
                    {expandedCampaigns[camp.question]
                      ? 'Ocultar lista de grupos'
                      : `Ver desglose de los ${camp.groupCount} grupos`}
                  </span>
                </button>

                {expandedCampaigns[camp.question] && (
                  <div className="campaign-groups-grid">
                    {camp.groups.map(g => (
                      <div key={g.pollId} className="campaign-group-chip">
                        <span className="campaign-group-chip-name" title={g.chatName}>
                          👥 {g.chatName}
                        </span>
                        <span className="campaign-group-chip-votes">
                          {g.votesCount} {g.votesCount === 1 ? 'voto' : 'votos'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="poll-actions-bar" style={{ marginTop: '1.25rem' }}>
                <button
                  className="poll-action-btn secondary"
                  onClick={() => handleOpenCampaignDetail(camp)}
                >
                  <Users size={14} /> Ver Votantes ({camp.totalVotes})
                </button>
                <button
                  className="poll-action-btn primary"
                  disabled={citingCampaignKey === camp.question}
                  onClick={() => handleCiteCampaign(camp)}
                  title="Citar encuesta ahora en todos los grupos de la campaña"
                >
                  {citingCampaignKey === camp.question ? (
                    <>
                      <Loader2 size={14} className="spin" /> Citando {camp.groupCount} grupos...
                    </>
                  ) : (
                    <>
                      <Bell size={14} /> Citar en todos ({camp.groupCount})
                    </>
                  )}
                </button>
                <button
                  className="poll-action-btn danger"
                  disabled={deletingCampaignKey === camp.question}
                  onClick={() => handleDeleteCampaign(camp)}
                  title="Eliminar encuesta de todos los grupos"
                >
                  <Trash2 size={14} /> Eliminar Campaña
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="polls-grid">
          {filteredPolls.map(poll => {
            const hasOtherResponses = poll.otherResponsesCount > 0;
            return (
              <div key={poll.id} className="poll-card">
                <div className="poll-card-header">
                  <h4 className="poll-card-question">{poll.question}</h4>
                  <span className={`poll-status-pill ${poll.status}`}>
                    {poll.status === 'active' ? 'Activa' : 'Cerrada'}
                  </span>
                </div>

                <div className="poll-meta-row">
                  <span className="poll-meta-item">
                    👥 {poll.chatName || poll.chatId.replace('@g.us', ' (Grupo)')}
                  </span>
                  <span>•</span>
                  <span className="poll-meta-item">
                    🗳️ {poll.totalVotes} {poll.totalVotes === 1 ? 'voto' : 'votos'}
                  </span>
                  {poll.allowMultipleAnswers && (
                    <>
                      <span>•</span>
                      <span className="poll-meta-item">Múltiple</span>
                    </>
                  )}
                </div>

                {/* Citation Schedule Banner */}
                {poll.citationEnabled ? (
                  <div className="poll-citation-banner">
                    <div className="poll-citation-title">
                      <Clock size={14} />
                      <span>Citas programadas:</span>
                      <span className="poll-citation-hours">
                        {poll.baseTime}
                        {poll.citationTimes && poll.citationTimes.length > 0
                          ? `, ${poll.citationTimes.join(', ')}`
                          : ''}
                      </span>
                    </div>
                    {poll.endDate ? (
                      <span style={{ fontSize: '0.75rem' }}>
                        📅 Hasta: {new Date(poll.endDate).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem' }}>📅 Sin fecha de caducidad</span>
                    )}
                    {poll.lastCitedAt && (
                      <span style={{ fontSize: '0.72rem', color: '#b45309' }}>
                        Última cita: {new Date(poll.lastCitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    ⏸️ Citas automáticas desactivadas
                  </div>
                )}

                {/* Options Progress Bars */}
                <div className="poll-options-preview">
                  {poll.optionResults.map(opt => {
                    const isOther = opt.option.toLowerCase().includes('otra');
                    return (
                      <div key={opt.option} className="poll-option-row">
                        <div className="poll-option-header">
                          <span className="poll-option-text">
                            {opt.option}
                            {isOther && <span className="badge-other">Alternativa A</span>}
                          </span>
                          <span className="poll-option-pct">
                            {opt.votes} ({opt.percentage}%)
                          </span>
                        </div>
                        <div className="poll-progress-bg">
                          <div
                            className={`poll-progress-fill ${isOther ? 'other' : ''}`}
                            style={{ width: `${opt.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Other Suggestions Callout */}
                {hasOtherResponses && (
                  <div
                    className="poll-other-suggestions-callout"
                    onClick={() => handleOpenDetail(poll)}
                    style={{ cursor: 'pointer' }}
                  >
                    <MessageSquare size={15} />
                    <span>
                      {poll.otherResponsesCount} {poll.otherResponsesCount === 1 ? 'sugerencia escrita recibida' : 'sugerencias escritas recibidas'}
                    </span>
                    <ExternalLink size={13} style={{ marginLeft: 'auto' }} />
                  </div>
                )}

                {/* Card Actions */}
                <div className="poll-card-actions">
                  <button
                    className="poll-btn"
                    onClick={() => handleOpenDetail(poll)}
                    title="Ver detalle y votantes"
                  >
                    <Users size={14} />
                    Votantes ({poll.totalVotes})
                  </button>

                  <button
                    className="poll-btn poll-btn-cite"
                    onClick={() => handleCiteNow(poll.id)}
                    disabled={citingPollId === poll.id}
                    title="Citar la encuesta ahora en WhatsApp"
                  >
                    {citingPollId === poll.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Bell size={14} />
                    )}
                    Citar Ahora
                  </button>

                  <button
                    className="poll-btn"
                    onClick={() => handleToggleCitation(poll)}
                    disabled={togglingPollId === poll.id}
                    title={poll.citationEnabled ? 'Pausar citas' : 'Activar citas'}
                  >
                    {poll.citationEnabled ? (
                      <>
                        <PauseCircle size={14} /> Pausar
                      </>
                    ) : (
                      <>
                        <PlayCircle size={14} /> Citar Auto
                      </>
                    )}
                  </button>

                  <a
                    href={pollsApi.exportCsvUrl(poll.id)}
                    download
                    className="poll-btn"
                    title="Descargar reporte en CSV"
                  >
                    <Download size={14} /> CSV
                  </a>

                  <button
                    className="poll-btn poll-btn-danger"
                    onClick={() => handleDeletePoll(poll.id)}
                    disabled={deletingPollId === poll.id}
                    title="Eliminar encuesta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL: Voters & 'Otras' Suggestions */}
      {selectedPoll && (
        <Modal
          open={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart2 size={20} color="#2563eb" />
              <span>{selectedPoll.question}</span>
            </div>
          }
          subheader={
            <div className="poll-tabs-header">
              <button
                className={`poll-tab-btn ${detailTab === 'voters' ? 'active' : ''}`}
                onClick={() => setDetailTab('voters')}
              >
                <Users size={16} />
                Votantes Registrados
                <span className="poll-tab-badge">{selectedPoll.votes?.length || 0}</span>
              </button>
              <button
                className={`poll-tab-btn ${detailTab === 'suggestions' ? 'active' : ''}`}
                onClick={() => setDetailTab('suggestions')}
              >
                <MessageSquare size={16} />
                Sugerencias de 'Otras' (Alternativa A)
                <span className="poll-tab-badge">{selectedPoll.otherResponsesCount}</span>
              </button>
            </div>
          }
        >
          {detailTab === 'voters' ? (
            <div className="poll-table-container">
              {!selectedPoll.votes || selectedPoll.votes.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Aún no hay votos registrados para esta encuesta.
                </div>
              ) : (
                <table className="poll-data-table">
                  <thead>
                    <tr>
                      <th>Contacto / Nombre</th>
                      <th>Teléfono</th>
                      <th>Opción Elegida</th>
                      <th>Fecha / Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPoll.votes.map(v => (
                      <tr key={v.id}>
                        <td>
                          <strong>{v.voterName || 'Anónimo'}</strong>
                        </td>
                        <td>{v.voterPhone ? `+${v.voterPhone}` : v.voterJid}</td>
                        <td>
                          {v.selectedOptions.join(', ')}
                          {v.hasOther && <span className="badge-other" style={{ marginLeft: '0.4rem' }}>Otras</span>}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {new Date(v.votedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="poll-suggestions-list">
              {(!selectedPoll.votes ||
                selectedPoll.votes.filter(v => v.customText).length === 0) ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <MessageSquare size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                  <p>Aún no hay respuestas abiertas para la opción "Otras".</p>
                  <p style={{ fontSize: '0.8rem' }}>
                    Cuando un participante elija "Otras", el bot le solicitará su sugerencia y aparecerá aquí automáticamente.
                  </p>
                </div>
              ) : (
                selectedPoll.votes
                  .filter(v => v.customText)
                  .map(v => (
                    <div key={v.id} className="poll-suggestion-card">
                      <div className="poll-suggestion-header">
                        <div className="poll-suggestion-author">
                          <span>👤 {v.voterName || 'Contacto'}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            ({v.voterPhone ? `+${v.voterPhone}` : v.voterJid})
                          </span>
                        </div>
                        <span className="poll-suggestion-time">
                          {v.customTextReceivedAt
                            ? new Date(v.customTextReceivedAt).toLocaleString()
                            : new Date(v.votedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="poll-suggestion-body">
                        💬 "{v.customText}"
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </Modal>
      )}

      {/* CREATE POLL MODAL */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Crear Nueva Encuesta Nativa en WhatsApp"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="poll-btn"
              onClick={() => setCreateModalOpen(false)}
              disabled={submittingPoll}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="poll-btn poll-btn-primary"
              onClick={handleCreateSubmit}
              disabled={submittingPoll}
            >
              {submittingPoll ? (
                <>
                  <Loader2 size={16} className="spin" /> Enviando a WhatsApp...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Crear y Publicar Encuesta
                </>
              )}
            </button>
          </div>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          {/* WhatsApp Session Selector */}
          <div className="poll-form-group">
            <label className="poll-form-label">Sesión de WhatsApp Emisora *</label>
            <select
              className="poll-form-select"
              value={newSessionId}
              onChange={e => setNewSessionId(e.target.value)}
              required
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id} ({s.status})
                </option>
              ))}
            </select>
          </div>

          {/* Destination Selector */}
          <div className="poll-form-group">
            <label className="poll-form-label">Destino de la Encuesta *</label>

            {/* Segmented Controller */}
            <div className="dest-segmented-control">
              <button
                type="button"
                className={`dest-segment-btn ${chatType === 'group' ? 'active' : ''}`}
                onClick={() => setChatType('group')}
              >
                <Users size={15} />
                Grupo Individual
              </button>
              <button
                type="button"
                className={`dest-segment-btn ${chatType === 'category' ? 'active' : ''}`}
                onClick={() => setChatType('category')}
              >
                <Folder size={15} />
                Categoría de Grupos {groupTags.length > 0 && `(${groupTags.length})`}
              </button>
              <button
                type="button"
                className={`dest-segment-btn ${chatType === 'personal' ? 'active' : ''}`}
                onClick={() => setChatType('personal')}
              >
                <Phone size={15} />
                Número Personal
              </button>
            </div>

            {/* Content for Group Individual */}
            {chatType === 'group' && (
              <div>
                {loadingGroups ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <Loader2 size={14} className="spin" /> Cargando grupos de WhatsApp...
                  </div>
                ) : availableGroups.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="poll-form-input"
                      placeholder="Filtrar grupos por nombre..."
                      value={groupSearchInModal}
                      onChange={e => setGroupSearchInModal(e.target.value)}
                    />
                    <select
                      className="poll-form-select"
                      value={selectedGroupJid}
                      onChange={e => {
                        setSelectedGroupJid(e.target.value);
                        const grp = availableGroups.find(g => g.id === e.target.value);
                        if (grp) setChatName(grp.name);
                      }}
                    >
                      {availableGroups
                        .filter(
                          g =>
                            !groupSearchInModal.trim() ||
                            g.name?.toLowerCase().includes(groupSearchInModal.toLowerCase()),
                        )
                        .map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.id})
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    No se detectaron grupos en esta sesión activa.
                  </div>
                )}
              </div>
            )}

            {/* Content for Group Category */}
            {chatType === 'category' && (
              <div>
                {groupTags.length === 0 ? (
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'rgba(245, 158, 11, 0.08)',
                      borderRadius: '8px',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      fontSize: '0.85rem',
                      color: '#b45309',
                    }}
                  >
                    ℹ️ Aún no has configurado categorías de grupos para esta sesión. Puedes crear categorías (ej: "Ventas Santiago", "Inmobiliarias") desde el menú de <strong>Grupos</strong> o el <strong>Probador de Mensajes</strong>.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      Selecciona la categoría a difundir:
                    </div>
                    <div className="category-pills-wrap">
                      {groupTags.map(tag => {
                        const isSelected = selectedTagId === tag.id;
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            className={`category-pill-item ${isSelected ? 'active' : ''}`}
                            onClick={() => setSelectedTagId(tag.id)}
                          >
                            <span className="category-dot" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                            <span>{tag.name}</span>
                            <span className="category-count-badge">
                              {tag.groupIds?.length || 0} {tag.groupIds?.length === 1 ? 'grupo' : 'grupos'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedTagId && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.75rem',
                          background: 'var(--bg-surface-secondary, #f8fafc)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, #e2e8f0)',
                        }}
                      >
                        <label
                          style={{
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sendToAllInTag}
                            onChange={e => setSendToAllInTag(e.target.checked)}
                          />
                          <span>
                            Publicar la encuesta en <strong>todos los grupos</strong> de esta categoría (
                            {groupTags.find(t => t.id === selectedTagId)?.groupIds?.length || 0} grupos)
                          </span>
                        </label>

                        {!sendToAllInTag && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Elegir grupo específico dentro de la categoría:
                            </label>
                            <select
                              className="poll-form-select"
                              style={{ marginTop: '0.25rem' }}
                              value={selectedGroupJid}
                              onChange={e => {
                                setSelectedGroupJid(e.target.value);
                                const grp = availableGroups.find(g => g.id === e.target.value);
                                if (grp) setChatName(grp.name);
                              }}
                            >
                              {availableGroups
                                .filter(g =>
                                  groupTags.find(t => t.id === selectedTagId)?.groupIds?.includes(g.id),
                                )
                                .map(g => (
                                  <option key={g.id} value={g.id}>
                                    {g.name} ({g.id})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Content for Personal Phone */}
            {chatType === 'personal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div>
                  <input
                    type="text"
                    className="poll-form-input"
                    placeholder="Número de teléfono personal (Ej: 56993005959 o +56 9 9300 5959)"
                    value={personalPhone}
                    onChange={e => setPersonalPhone(e.target.value)}
                    required
                  />
                  {personalPhone.trim() && (
                    <div className="poll-phone-preview">
                      <CheckCircle size={14} />
                      <span>
                        Destino normalizado WhatsApp: <strong>{personalPhone.replace(/\D/g, '')}@c.us</strong>
                      </span>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  className="poll-form-input"
                  placeholder="Nombre del contacto (opcional para identificar en las estadísticas)"
                  value={personalName}
                  onChange={e => setPersonalName(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Question Title */}
          <div className="poll-form-group">
            <label className="poll-form-label">Pregunta de la Encuesta *</label>
            <input
              type="text"
              className="poll-form-input"
              placeholder="Ej: ¿Qué día prefieres para la reunión mensual?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              required
            />
          </div>

          {/* Options */}
          <div className="poll-form-group">
            <label className="poll-form-label">Opciones de Respuesta (2 a 12) *</label>
            <span className="poll-form-hint">
              Tip: Deja una opción como "Otras" para capturar sugerencias por escrito automáticamente (Alternativa A).
            </span>

            {options.map((opt, idx) => (
              <div key={idx} className="poll-option-input-row">
                <input
                  type="text"
                  className="poll-form-input"
                  value={opt}
                  onChange={e => handleUpdateOption(idx, e.target.value)}
                  placeholder={`Opción ${idx + 1}`}
                  required
                />
                <button
                  type="button"
                  className="poll-btn poll-btn-danger"
                  onClick={() => handleRemoveOption(idx)}
                  disabled={options.length <= 2}
                  title="Eliminar opción"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            <button
              type="button"
              className="poll-btn"
              onClick={handleAddOption}
              disabled={options.length >= 12}
              style={{ marginTop: '0.25rem', width: 'fit-content' }}
            >
              <Plus size={14} /> Agregar otra opción
            </button>
          </div>

          {/* Allow multiple options */}
          <div className="poll-form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={e => setAllowMultiple(e.target.checked)}
              />
              Permitir que los contactos elijan múltiples opciones
            </label>
          </div>

          {/* Citation / Quoting Automation Section */}
          <div className="poll-citation-box-create">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#1e3a8a',
                marginBottom: '0.75rem',
              }}
            >
              <input
                type="checkbox"
                checked={citationEnabled}
                onChange={e => setCitationEnabled(e.target.checked)}
              />
              <Clock size={16} />
              Citar la encuesta automáticamente (Recordatorios diarios)
            </label>

            {citationEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <span className="poll-form-hint">
                  El bot citará la encuesta original mediante una burbuja nativa interactiva en WhatsApp.
                </span>

                {/* Base Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                      Horario Base Diario (ej: 10:00) *
                    </label>
                    <input
                      type="time"
                      className="poll-form-input"
                      value={baseTime}
                      onChange={e => setBaseTime(e.target.value)}
                      required={citationEnabled}
                      style={{ width: '130px' }}
                    />
                  </div>

                  {/* End Date */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                      Fecha límite de citas (Opcional)
                    </label>
                    <input
                      type="date"
                      className="poll-form-input"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{ width: '160px' }}
                    />
                  </div>
                </div>

                {/* Extra Citation Times (Max 2 extra) */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                    Horarios adicionales del día para citar la encuesta (Máximo 2 adicionales):
                  </label>

                  <div className="poll-citation-times-list">
                    {citationTimes.map((ct, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="time"
                          className="poll-form-input"
                          value={ct}
                          onChange={e => handleUpdateCitationTime(idx, e.target.value)}
                          style={{ width: '120px' }}
                        />
                        <button
                          type="button"
                          className="poll-btn poll-btn-danger"
                          onClick={() => handleRemoveCitationTime(idx)}
                          style={{ padding: '0.45rem' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}

                    {citationTimes.length < 2 && (
                      <button
                        type="button"
                        className="poll-btn"
                        onClick={handleAddCitationTime}
                        style={{ fontSize: '0.78rem' }}
                      >
                        <Plus size={13} /> Agregar otro horario ({citationTimes.length + 1}/2)
                      </button>
                    )}
                  </div>
                </div>

                {/* Custom Reminder Message */}
                <div className="poll-form-group" style={{ marginBottom: 0 }}>
                  <label className="poll-form-label">Mensaje Recordatorio al Citar</label>
                  <textarea
                    rows={2}
                    className="poll-form-textarea"
                    value={reminderMessage}
                    onChange={e => setReminderMessage(e.target.value)}
                    placeholder="Texto que acompañará a la cita de la encuesta"
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
