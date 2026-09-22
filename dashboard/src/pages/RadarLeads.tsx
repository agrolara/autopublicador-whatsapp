import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Search,
  ExternalLink,
  MessageSquare,
  Smartphone,
  Users,
  Sliders,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Info,
  ShieldCheck,
  Check,
  Send,
  Zap,
  Eye,
  EyeOff,
  Bot,
} from 'lucide-react';
import {
  radarApi,
  sessionApi,
  type RadarSettings,
  type RadarClient,
  type RadarGroupItem,
  type Session,
  type TestRadarResult,
  type GroupFilterMode,
} from '../services/api';
import './RadarLeads.css';

const DEFAULT_TYPESAFE_API_KEY =
  'apikey_2199a480d31c3450450c8efa2ecc4c6d9d0d_6c18d62803e10160629944a9079e8ffcf825fa1f40caba0ebeea8e1fcfd57e5b';

const DEFAULT_TEMPLATE = `🚨 *¡NUEVO LEAD DETECTADO EN RADAR!* 🚨

📂 *Rubro:* {rubro}
👥 *Grupo:* {grupo}
👤 *Comprador:* +{comprador_telefono}
💬 *Mensaje:*
"{mensaje_comprador}"

📲 *Hablarle directo por WhatsApp:*
{enlace_whatsapp}`;

export function RadarLeads() {
  const [settings, setSettings] = useState<RadarSettings | null>(null);
  const [clients, setClients] = useState<RadarClient[]>([]);
  const [availableGroups, setAvailableGroups] = useState<RadarGroupItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'clients' | 'settings' | 'test'>('clients');

  // Master switch loading state
  const [isTogglingMaster, setIsTogglingMaster] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Client Modal State
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<RadarClient | null>(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    rubroKey: '',
    targetPhone: '',
    senderSessionId: '',
    localKeywords: '',
    jevPromptCriteria: '',
    useAiFilter: true,
    alertTemplate: DEFAULT_TEMPLATE,
    active: true,
  });
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Settings State Form
  const [settingsForm, setSettingsForm] = useState({
    minTextLength: 8,
    ignoreMediaWithoutCaption: true,
    groupFilterMode: 'ALL' as GroupFilterMode,
    groupCategoryKeywords: '',
    whitelistedGroupIds: [] as string[],
    activeScanningSessions: [] as string[],
    dedupWindowSeconds: 30,
    aiSemanticEnabled: true,
    aiProvider: 'typesafe',
    typesafeApiKey: '',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Simulator / Test State
  const [testText, setTestText] = useState('Hola vecinos, ¿alguien vende pizzas familiares o empanadas con delivery ahora?');
  const [testGroupName, setTestGroupName] = useState('Vecinos Quilicura - Valle Lo Campino');
  const [testBuyerPhone, setTestBuyerPhone] = useState('56987654321');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestRadarResult | null>(null);

  // Search filter
  const [clientSearch, setClientSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast / Status Message
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [fetchedSettings, fetchedClients, fetchedGroups, fetchedSessions] = await Promise.all([
        radarApi.getSettings().catch(() => null),
        radarApi.getClients().catch(() => []),
        radarApi.getGroups().catch(() => []),
        sessionApi.list().catch(() => []),
      ]);

      if (fetchedSettings) {
        setSettings(fetchedSettings);
        setSettingsForm({
          minTextLength: fetchedSettings.minTextLength,
          ignoreMediaWithoutCaption: fetchedSettings.ignoreMediaWithoutCaption,
          groupFilterMode: fetchedSettings.groupFilterMode,
          groupCategoryKeywords: fetchedSettings.groupCategoryKeywords,
          whitelistedGroupIds: safeParseJson(fetchedSettings.whitelistedGroupIds),
          activeScanningSessions: safeParseJson(fetchedSettings.activeScanningSessions),
          dedupWindowSeconds: fetchedSettings.dedupWindowSeconds,
          aiSemanticEnabled: fetchedSettings.aiSemanticEnabled ?? true,
          aiProvider: fetchedSettings.aiProvider || 'typesafe',
          typesafeApiKey: fetchedSettings.typesafeApiKey || '',
        });
      }
      setClients(fetchedClients);
      setAvailableGroups(fetchedGroups);
      setSessions(fetchedSessions);
    } catch {
      showToast('error', 'Error al cargar los datos del Radar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const safeParseJson = (str: string | undefined): string[] => {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Toggle Master Switch ON/OFF
  const handleToggleMaster = async () => {
    if (!settings) return;
    setIsTogglingMaster(true);
    const newEnabled = !settings.enabled;
    try {
      const updated = await radarApi.updateSettings({ enabled: newEnabled });
      setSettings(updated);
      showToast(
        newEnabled ? 'success' : 'info',
        newEnabled
          ? '¡Radar de Leads ACTIVADO! Monitoreando grupos en tiempo real.'
          : 'Radar de Leads PAUSADO. Escaneo detenido.',
      );
    } catch {
      showToast('error', 'No se pudo cambiar el estado maestro del Radar.');
    } finally {
      setIsTogglingMaster(false);
    }
  };

  // Open Client Modal (New or Edit)
  const handleOpenClientModal = (client?: RadarClient) => {
    if (client) {
      setEditingClient(client);
      setClientForm({
        name: client.name,
        rubroKey: client.rubroKey,
        targetPhone: client.targetPhone,
        senderSessionId: client.senderSessionId || '',
        localKeywords: client.localKeywords,
        jevPromptCriteria: client.jevPromptCriteria || '',
        useAiFilter: client.useAiFilter !== false,
        alertTemplate: client.alertTemplate || DEFAULT_TEMPLATE,
        active: client.active,
      });
    } else {
      setEditingClient(null);
      setClientForm({
        name: '',
        rubroKey: '',
        targetPhone: '',
        senderSessionId: sessions.length > 0 ? sessions[0].id : '',
        localKeywords: '',
        jevPromptCriteria: '',
        useAiFilter: true,
        alertTemplate: DEFAULT_TEMPLATE,
        active: true,
      });
    }
    setIsClientModalOpen(true);
  };

  // Save Client
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.name.trim() || !clientForm.rubroKey.trim() || !clientForm.targetPhone.trim() || !clientForm.localKeywords.trim()) {
      showToast('error', 'Por favor completa todos los campos obligatorios.');
      return;
    }

    setIsSavingClient(true);
    try {
      if (editingClient) {
        const updated = await radarApi.updateClient(editingClient.id, clientForm);
        setClients(prev => prev.map(c => (c.id === updated.id ? updated : c)));
        showToast('success', `Cliente "${updated.name}" actualizado.`);
      } else {
        const created = await radarApi.createClient(clientForm);
        setClients(prev => [created, ...prev]);
        showToast('success', `Cliente "${created.name}" agregado exitosamente.`);
      }
      setIsClientModalOpen(false);
    } catch {
      showToast('error', 'Error al guardar el cliente.');
    } finally {
      setIsSavingClient(false);
    }
  };

  // Toggle Client Active
  const handleToggleClientActive = async (client: RadarClient) => {
    try {
      const updated = await radarApi.toggleClient(client.id);
      setClients(prev => prev.map(c => (c.id === updated.id ? updated : c)));
      showToast('info', `Cliente "${client.name}" ${updated.active ? 'activado' : 'pausado'}.`);
    } catch {
      showToast('error', 'No se pudo cambiar el estado del cliente.');
    }
  };

  // Delete Client
  const handleDeleteClient = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar al cliente "${name}"?`)) return;
    try {
      await radarApi.deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
      showToast('success', `Cliente "${name}" eliminado.`);
    } catch {
      showToast('error', 'Error al eliminar el cliente.');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const updated = await radarApi.updateSettings({
        minTextLength: Number(settingsForm.minTextLength),
        ignoreMediaWithoutCaption: settingsForm.ignoreMediaWithoutCaption,
        groupFilterMode: settingsForm.groupFilterMode,
        groupCategoryKeywords: settingsForm.groupCategoryKeywords,
        whitelistedGroupIds: settingsForm.whitelistedGroupIds,
        activeScanningSessions: settingsForm.activeScanningSessions,
        dedupWindowSeconds: Number(settingsForm.dedupWindowSeconds),
        aiSemanticEnabled: settingsForm.aiSemanticEnabled,
        aiProvider: settingsForm.aiProvider,
        typesafeApiKey: settingsForm.typesafeApiKey,
      });
      setSettings(updated);
      showToast('success', 'Configuración del Radar guardada correctamente.');
    } catch {
      showToast('error', 'Error al guardar la configuración.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Run Simulator Test
  const handleRunSimulator = async () => {
    if (!testText.trim()) return;
    setIsTesting(true);
    try {
      const res = await radarApi.testEvaluate({
        text: testText,
        groupName: testGroupName,
        senderPhone: testBuyerPhone,
      });
      setTestResult(res);
      if (res.matched) {
        showToast('success', `¡Coincidencia detectada! ${res.results.length} alerta(s) generadas.`);
      } else {
        showToast('info', 'Ningún cliente activo coincidió con las palabras clave del mensaje.');
      }
    } catch {
      showToast('error', 'Error al ejecutar la simulación.');
    } finally {
      setIsTesting(false);
    }
  };

  // Insert tag helper in template textarea
  const handleInsertTag = (tag: string) => {
    setClientForm(prev => ({
      ...prev,
      alertTemplate: prev.alertTemplate + tag,
    }));
  };

  // Copy to clipboard
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered Clients
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.rubroKey.toLowerCase().includes(q) ||
        c.targetPhone.includes(q) ||
        c.localKeywords.toLowerCase().includes(q),
    );
  }, [clients, clientSearch]);

  // Filtered Groups for Whitelist
  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return availableGroups;
    const q = groupSearch.toLowerCase();
    return availableGroups.filter(
      g => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q),
    );
  }, [availableGroups, groupSearch]);

  const connectedSessions = useMemo(() => {
    return sessions.filter(s => s.status === 'authenticated' || s.status === 'connected' || s.status === 'ready');
  }, [sessions]);

  return (
    <div className="radar-leads-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`radar-toast ${toast.type}`}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'error' && <AlertTriangle size={18} />}
          {toast.type === 'info' && <Info size={18} />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header & Master Switch Banner */}
      <div className="radar-header-banner">
        <div className="radar-header-info">
          <div className="radar-title-row">
            <div className={`radar-icon-orb ${settings?.enabled ? 'pulsing' : ''}`}>
              <Radio size={28} />
            </div>
            <div>
              <h1 className="radar-title">Radar de Leads</h1>
              <p className="radar-subtitle">
                Escaneo inteligente de grupos de WhatsApp para detección inmediata de oportunidades de compra y despacho de alertas directas.
              </p>
            </div>
          </div>

          <div className="radar-stats-chips">
            <div className="stat-chip">
              <Users size={15} />
              <span>
                <strong>{clients.filter(c => c.active).length}</strong>/{clients.length} Clientes activos
              </span>
            </div>
            <div className="stat-chip">
              <Smartphone size={15} />
              <span>
                <strong>{connectedSessions.length}</strong> Sesiones conectadas
              </span>
            </div>
            <div className="stat-chip">
              <MessageSquare size={15} />
              <span>
                <strong>{availableGroups.length}</strong> Grupos detectados
              </span>
            </div>
          </div>
        </div>

        {/* Big Master Toggle Button */}
        <div className="radar-master-toggle-card">
          <span className="toggle-label">INTERRUPTOR GENERAL</span>
          <button
            type="button"
            className={`radar-master-btn ${settings?.enabled ? 'active' : 'paused'}`}
            onClick={handleToggleMaster}
            disabled={isTogglingMaster}
          >
            <div className="radar-btn-ping" />
            <div className="radar-btn-content">
              <Zap size={22} className={settings?.enabled ? 'icon-glow' : ''} />
              <div className="radar-btn-texts">
                <span className="master-status-text">
                  {settings?.enabled ? 'RADAR ACTIVO' : 'RADAR PAUSADO'}
                </span>
                <span className="master-sub-text">
                  {settings?.enabled ? 'Monitoreando 0 ms' : 'Clic para encender'}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="radar-tabs-bar">
        <button
          className={`radar-tab-btn ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          <Users size={18} />
          <span>Clientes y Rubros</span>
          <span className="tab-counter">{clients.length}</span>
        </button>
        <button
          className={`radar-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Sliders size={18} />
          <span>Configuración del Radar</span>
        </button>
        <button
          className={`radar-tab-btn ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => setActiveTab('test')}
        >
          <Sparkles size={18} />
          <span>Simulador de Prueba</span>
          <span className="tab-badge-beta">TEST</span>
        </button>
      </div>

      {/* TAB 1: CLIENTS & RUBROS */}
      {activeTab === 'clients' && (
        <div className="radar-tab-content">
          <div className="radar-toolbar">
            <div className="radar-search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar por cliente, rubro, teléfono o palabras clave..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="radar-primary-btn"
              onClick={() => handleOpenClientModal()}
            >
              <Plus size={18} />
              <span>Nuevo Cliente / Rubro</span>
            </button>
          </div>

          {loading ? (
            <div className="radar-empty-state">
              <RefreshCw size={32} className="spinning" />
              <p>Cargando clientes y configuración del radar...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="radar-empty-state">
              <Users size={48} />
              <h3>No hay clientes configurados</h3>
              <p>
                Agrega clientes o rubros comerciales (ej. Pizzería, Fletes, Abogados, Clases) para que el radar
                alerte inmediatamente cuando un comprador pida sus servicios en los grupos.
              </p>
              <button
                type="button"
                className="radar-primary-btn"
                onClick={() => handleOpenClientModal()}
              >
                <Plus size={18} />
                <span>Crear Primer Cliente</span>
              </button>
            </div>
          ) : (
            <div className="radar-clients-grid">
              {filteredClients.map(client => (
                <div key={client.id} className={`radar-client-card ${client.active ? '' : 'paused'}`}>
                  <div className="client-card-header">
                    <div>
                      <span className="client-rubro-badge">{client.rubroKey}</span>
                      <h3 className="client-name">{client.name}</h3>
                    </div>
                    <button
                      type="button"
                      className={`client-toggle-switch ${client.active ? 'on' : 'off'}`}
                      onClick={() => handleToggleClientActive(client)}
                      title={client.active ? 'Pausar cliente' : 'Activar cliente'}
                    >
                      <div className="switch-thumb" />
                    </button>
                  </div>

                  <div className="client-details-list">
                    <div className="client-detail-item">
                      <Smartphone size={15} />
                      <span>Destino: <strong>+{client.targetPhone}</strong></span>
                      <a
                        href={`https://wa.me/${client.targetPhone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="external-wa-btn"
                        title="Abrir chat en WhatsApp"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    {client.senderSessionId && (
                      <div className="client-detail-item">
                        <Send size={15} />
                        <span>Sesión emisora: <code>{client.senderSessionId}</code></span>
                      </div>
                    )}
                  </div>

                  <div className="client-keywords-section">
                    <span className="keywords-label">Palabras clave ({client.localKeywords.split(',').length}):</span>
                    <div className="client-keyword-chips">
                      {client.localKeywords
                        .split(',')
                        .map(kw => kw.trim())
                        .filter(Boolean)
                        .map((kw, i) => (
                          <span key={i} className="kw-chip">
                            {kw}
                          </span>
                        ))}
                    </div>
                  </div>

                  {client.jevPromptCriteria && (
                    <div className={`client-criteria-box ${client.useAiFilter !== false ? 'ai-active' : 'ai-inactive'}`}>
                      {client.useAiFilter !== false ? (
                        <>
                          <Sparkles size={14} className="sparkle-ai-icon" />
                          <div className="criteria-content">
                            <span className="criteria-badge">✨ Filtro IA TypeSafe Activo</span>
                            <span className="criteria-text">"{client.jevPromptCriteria}"</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Info size={14} />
                          <div className="criteria-content">
                            <span className="criteria-badge-off">⚪ Filtro IA Inactivo (Solo palabras clave)</span>
                            <span className="criteria-text">"{client.jevPromptCriteria}"</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="client-card-actions">
                    <button
                      type="button"
                      className="radar-btn-action test"
                      onClick={() => {
                        setTestText(`Hola, alguien vende ${client.localKeywords.split(',')[0]?.trim() || 'algo'} por acá?`);
                        setActiveTab('test');
                      }}
                      title="Probar este cliente en el simulador"
                    >
                      <Play size={14} />
                      <span>Probar</span>
                    </button>
                    <div className="card-right-actions">
                      <button
                        type="button"
                        className="radar-btn-action edit"
                        onClick={() => handleOpenClientModal(client)}
                        title="Editar cliente"
                      >
                        <Pencil size={14} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        className="radar-btn-action danger"
                        onClick={() => handleDeleteClient(client.id, client.name)}
                        title="Eliminar cliente"
                      >
                        <Trash2 size={14} />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RADAR SETTINGS */}
      {activeTab === 'settings' && (
        <div className="radar-tab-content">
          <form onSubmit={handleSaveSettings} className="radar-settings-form">
            <div className="settings-section-card">
              <div className="section-card-title">
                <Smartphone size={20} />
                <div>
                  <h3>Sesiones de WhatsApp que Escanean</h3>
                  <p>Selecciona qué sesiones autorizadas escucharán y filtrarán mensajes en los grupos.</p>
                </div>
              </div>

              <div className="sessions-checkboxes-grid">
                {sessions.length === 0 ? (
                  <p className="no-items-note">No hay sesiones creadas en OpenWA.</p>
                ) : (
                  sessions.map(s => {
                    const isChecked = settingsForm.activeScanningSessions.includes(s.id);
                    return (
                      <label key={s.id} className={`session-check-item ${isChecked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSettingsForm(prev => ({
                                ...prev,
                                activeScanningSessions: [...prev.activeScanningSessions, s.id],
                              }));
                            } else {
                              setSettingsForm(prev => ({
                                ...prev,
                                activeScanningSessions: prev.activeScanningSessions.filter(id => id !== s.id),
                              }));
                            }
                          }}
                        />
                        <div className="session-check-info">
                          <span className="session-check-name">{s.name || s.id}</span>
                          <span className={`session-check-status ${s.status}`}>{s.status}</span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <small className="field-tip">
                Si no seleccionas ninguna sesión, el radar escaneará en <strong>todas</strong> las sesiones conectadas.
              </small>
            </div>

            <div className="settings-section-card">
              <div className="section-card-title">
                <Sliders size={20} />
                <div>
                  <h3>Modo de Filtrado de Grupos</h3>
                  <p>Define el alcance de los grupos que serán analizados para descartar tráfico no deseado.</p>
                </div>
              </div>

              <div className="filter-modes-cards">
                <label className={`filter-mode-card ${settingsForm.groupFilterMode === 'ALL' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="groupFilterMode"
                    value="ALL"
                    checked={settingsForm.groupFilterMode === 'ALL'}
                    onChange={() => setSettingsForm(prev => ({ ...prev, groupFilterMode: 'ALL' }))}
                  />
                  <div className="mode-card-header">
                    <strong>Todos los grupos</strong>
                  </div>
                  <p>Escanea todos los grupos de WhatsApp en los que participen las sesiones sin restricciones.</p>
                </label>

                <label className={`filter-mode-card ${settingsForm.groupFilterMode === 'CATEGORY' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="groupFilterMode"
                    value="CATEGORY"
                    checked={settingsForm.groupFilterMode === 'CATEGORY'}
                    onChange={() => setSettingsForm(prev => ({ ...prev, groupFilterMode: 'CATEGORY' }))}
                  />
                  <div className="mode-card-header">
                    <strong>Filtrar por Categoría / Ubicación</strong>
                  </div>
                  <p>Solo procesa mensajes de grupos cuyo nombre contenga palabras clave (ej: comuna o sector).</p>
                </label>

                <label className={`filter-mode-card ${settingsForm.groupFilterMode === 'WHITELIST' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="groupFilterMode"
                    value="WHITELIST"
                    checked={settingsForm.groupFilterMode === 'WHITELIST'}
                    onChange={() => setSettingsForm(prev => ({ ...prev, groupFilterMode: 'WHITELIST' }))}
                  />
                  <div className="mode-card-header">
                    <strong>Lista Blanca Específica</strong>
                  </div>
                  <p>Solo procesa mensajes de grupos elegidos manualmente de una lista autorizada.</p>
                </label>
              </div>

              {/* Category Keywords Field */}
              {settingsForm.groupFilterMode === 'CATEGORY' && (
                <div className="sub-settings-field">
                  <label className="form-label">
                    Palabras clave en el nombre del grupo (separadas por comas)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="quilicura, valle lo campino, valle grande, batuco"
                    value={settingsForm.groupCategoryKeywords}
                    onChange={e => setSettingsForm(prev => ({ ...prev, groupCategoryKeywords: e.target.value }))}
                  />
                  <small className="field-tip">
                    El radar ignorará cualquier grupo cuyo título no contenga al menos una de estas palabras (ignora tildes y mayúsculas).
                  </small>
                </div>
              )}

              {/* Whitelist Picker */}
              {settingsForm.groupFilterMode === 'WHITELIST' && (
                <div className="sub-settings-field">
                  <label className="form-label">
                    Seleccionar grupos autorizados ({settingsForm.whitelistedGroupIds.length} seleccionados)
                  </label>
                  <div className="whitelist-search-box">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Buscar grupos detectados..."
                      value={groupSearch}
                      onChange={e => setGroupSearch(e.target.value)}
                    />
                  </div>

                  <div className="whitelist-groups-list">
                    {filteredGroups.length === 0 ? (
                      <p className="no-items-note">No se encontraron grupos en las sesiones activas.</p>
                    ) : (
                      filteredGroups.map(g => {
                        const isSelected = settingsForm.whitelistedGroupIds.includes(g.id);
                        return (
                          <label key={g.id} className={`whitelist-group-item ${isSelected ? 'selected' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSettingsForm(prev => ({
                                    ...prev,
                                    whitelistedGroupIds: [...prev.whitelistedGroupIds, g.id],
                                  }));
                                } else {
                                  setSettingsForm(prev => ({
                                    ...prev,
                                    whitelistedGroupIds: prev.whitelistedGroupIds.filter(id => id !== g.id),
                                  }));
                                }
                              }}
                            />
                            <div className="whitelist-group-info">
                              <span className="whitelist-group-name">{g.name}</span>
                              <span className="whitelist-group-jid">{g.id}</span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-section-card">
              <div className="section-card-title">
                <ShieldCheck size={20} />
                <div>
                  <h3>Reglas de Descarte en 0 ms y Deduplicación</h3>
                  <p>Optimizaciones de memoria para no procesar mensajes basura ni duplicados.</p>
                </div>
              </div>

              <div className="settings-grid-cols">
                <div className="form-group">
                  <label className="form-label">Longitud mínima de texto (caracteres)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="form-input"
                    value={settingsForm.minTextLength}
                    onChange={e => setSettingsForm(prev => ({ ...prev, minTextLength: Number(e.target.value) }))}
                  />
                  <small className="field-tip">Mensajes como "ok", "hola", "?" menores a esta longitud son descartados en 0 ms.</small>
                </div>

                <div className="form-group">
                  <label className="form-label">Ventana de Deduplicación (segundos)</label>
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    className="form-input"
                    value={settingsForm.dedupWindowSeconds}
                    onChange={e => setSettingsForm(prev => ({ ...prev, dedupWindowSeconds: Number(e.target.value) }))}
                  />
                  <small className="field-tip">
                    Si 2 o más sesiones están en el mismo grupo, evita enviar alertas repetidas al cliente.
                  </small>
                </div>
              </div>

              <div className="checkbox-field-row">
                <label className="checkbox-custom-label">
                  <input
                    type="checkbox"
                    checked={settingsForm.ignoreMediaWithoutCaption}
                    onChange={e => setSettingsForm(prev => ({ ...prev, ignoreMediaWithoutCaption: e.target.checked }))}
                  />
                  <span>Descartar multimedia (fotos, stickers, audios) sin texto descriptivo</span>
                </label>
              </div>
            </div>

            {/* AI Semantic Filter Section */}
            <div className="settings-section-card">
              <div className="section-card-title">
                <Sparkles size={20} className="text-primary" />
                <div>
                  <h3>Inteligencia Artificial Semántica (Filtro Anti-Vendedores / Intención de Compra)</h3>
                  <p>Evalúa mensajes sospechosos para verificar intención de compra y descartar vendedores o spam.</p>
                </div>
              </div>

              <div className="toggle-row-card">
                <div>
                  <strong>Habilitar Validación Semántica con IA</strong>
                  <p>Si está activado, los clientes con reglas evaluarán la intención de compra antes de disparar la alerta.</p>
                </div>
                <button
                  type="button"
                  className={`client-toggle-switch ${settingsForm.aiSemanticEnabled ? 'on' : ''}`}
                  onClick={() => setSettingsForm(prev => ({ ...prev, aiSemanticEnabled: !prev.aiSemanticEnabled }))}
                >
                  <span className="toggle-slider" />
                </button>
              </div>

              {settingsForm.aiSemanticEnabled && (
                <div className="ai-settings-subgrid">
                  <div className="form-group">
                    <label className="form-label">Motor de Inteligencia Artificial</label>
                    <select
                      className="form-select"
                      value={settingsForm.aiProvider}
                      onChange={e => setSettingsForm(prev => ({ ...prev, aiProvider: e.target.value }))}
                    >
                      <option value="typesafe">⚡ TypeSafe AI (System One: jev-latest) - Ultrarrápido y Determinista</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">TypeSafe API Key</label>
                    <div className="api-key-input-wrapper">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        className="form-input"
                        placeholder="apikey_..."
                        value={settingsForm.typesafeApiKey}
                        onChange={e => setSettingsForm(prev => ({ ...prev, typesafeApiKey: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="radar-btn-icon-sm"
                        onClick={() => setShowApiKey(!showApiKey)}
                        title={showApiKey ? 'Ocultar API Key' : 'Mostrar API Key'}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        type="button"
                        className="radar-btn-outline small"
                        onClick={() => setSettingsForm(prev => ({ ...prev, typesafeApiKey: DEFAULT_TYPESAFE_API_KEY }))}
                        title="Restaurar API Key por defecto"
                      >
                        Restaurar Default
                      </button>
                    </div>
                    <small className="field-tip">
                      Utiliza tu clave de TypeSafe para el modelo <code>jev-latest</code>. Si se deja en blanco, usa la llave predeterminada del servidor.
                    </small>
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions-bar">
              <button
                type="submit"
                className="radar-primary-btn"
                disabled={isSavingSettings}
              >
                {isSavingSettings ? <RefreshCw size={18} className="spinning" /> : <Check size={18} />}
                <span>Guardar Configuración</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: SIMULATOR / TESTER */}
      {activeTab === 'test' && (
        <div className="radar-tab-content">
          <div className="simulator-grid">
            <div className="simulator-input-card">
              <div className="section-card-title">
                <Play size={20} />
                <div>
                  <h3>Simulador de Mensajes en Vivo</h3>
                  <p>Prueba un mensaje entrante simulado para verificar qué clientes se activan y cómo llega la alerta.</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre del Grupo Simulado</label>
                <input
                  type="text"
                  className="form-input"
                  value={testGroupName}
                  onChange={e => setTestGroupName(e.target.value)}
                  placeholder="Ej: Vecinos Quilicura"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Teléfono Simulado del Comprador</label>
                <input
                  type="text"
                  className="form-input"
                  value={testBuyerPhone}
                  onChange={e => setTestBuyerPhone(e.target.value)}
                  placeholder="Ej: 56987654321"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mensaje del Comprador</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  placeholder="Escribe el texto que una persona enviaría en el grupo..."
                />
              </div>

              <button
                type="button"
                className="radar-primary-btn full-width"
                onClick={handleRunSimulator}
                disabled={isTesting || !testText.trim()}
              >
                {isTesting ? <RefreshCw size={18} className="spinning" /> : <Play size={18} />}
                <span>Evaluar Mensaje en Radar</span>
              </button>
            </div>

            <div className="simulator-results-card">
              <h3>Resultado de la Evaluación</h3>
              {!testResult ? (
                <div className="sim-empty-state">
                  <Sparkles size={36} />
                  <p>Presiona <strong>"Evaluar Mensaje en Radar"</strong> para ver los clientes que coincidirán y la alerta generada.</p>
                </div>
              ) : !testResult.matched ? (
                <div className="sim-no-match-box">
                  <AlertTriangle size={24} />
                  <h4>Sin Coincidencias</h4>
                  <p>El mensaje no activó ninguna palabra clave de los clientes activos.</p>
                </div>
              ) : (
                <div className="sim-results-list">
                  <div className="sim-match-header">
                    <CheckCircle2 size={20} className="success-icon" />
                    <span>¡Se activaron <strong>{testResult.results.length}</strong> alerta(s)!</span>
                  </div>

                  {testResult.results.map((res, idx) => (
                    <div key={idx} className="sim-result-card">
                      <div className="sim-card-top">
                        <span className="sim-client-name">{res.clientName}</span>
                        <span className="sim-matched-badge">Keyword: "{res.matchedKeyword}"</span>
                      </div>
                      <div className="sim-target-phone">
                        Destino: <strong>+{res.targetPhone}</strong>
                      </div>

                      {res.aiEvaluation?.evaluated && (
                        <div className={`sim-ai-evaluation-box ${res.aiEvaluation.passed ? 'passed' : 'rejected'}`}>
                          {res.aiEvaluation.passed ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <AlertTriangle size={16} />
                          )}
                          <div className="sim-ai-eval-text">
                            <strong>{res.aiEvaluation.passed ? '✅ Aprobado por IA' : '❌ Descartado por IA'} (Confianza: {(res.aiEvaluation.score * 100).toFixed(0)}%)</strong>
                            <p>{res.aiEvaluation.reason}</p>
                            {!res.aiEvaluation.passed && (
                              <small className="ai-reject-note">⚠️ En producción, esta alerta se descartará en silencio y NO llegará a WhatsApp.</small>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="sim-preview-bubble">
                        <div className="bubble-header">
                          <MessageSquare size={13} />
                          <span>Vista previa del mensaje enviado a WhatsApp:</span>
                        </div>
                        <pre className="bubble-text">{res.formattedAlert}</pre>
                        <div className="bubble-actions">
                          <button
                            type="button"
                            className="radar-btn-outline small"
                            onClick={() => handleCopyText(res.formattedAlert, `alert-${idx}`)}
                          >
                            {copiedId === `alert-${idx}` ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copiedId === `alert-${idx}` ? 'Copiado' : 'Copiar'}</span>
                          </button>
                          <a
                            href={`https://wa.me/${testBuyerPhone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="radar-btn-wa small"
                          >
                            <ExternalLink size={14} />
                            <span>Probar wa.me</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLIENT CREATE / EDIT MODAL */}
      {isClientModalOpen && (
        <div className="radar-modal-overlay" onClick={() => setIsClientModalOpen(false)}>
          <div className="radar-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="radar-modal-header">
              <h3>{editingClient ? 'Editar Cliente / Rubro' : 'Nuevo Cliente / Rubro'}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsClientModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="radar-modal-body">
              <div className="settings-grid-cols">
                <div className="form-group">
                  <label className="form-label">Nombre del Negocio / Cliente *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="Ej: Pizzería La Mascada"
                    value={clientForm.name}
                    onChange={e => setClientForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Clave de Rubro (identificador) *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="Ej: pizza, fletes, abogados"
                    value={clientForm.rubroKey}
                    onChange={e => setClientForm(prev => ({ ...prev, rubroKey: e.target.value }))}
                  />
                </div>
              </div>

              <div className="settings-grid-cols">
                <div className="form-group">
                  <label className="form-label">Teléfono Destino WhatsApp (recibe la alerta) *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="Ej: 56993005959 (con código de país)"
                    value={clientForm.targetPhone}
                    onChange={e => setClientForm(prev => ({ ...prev, targetPhone: e.target.value }))}
                  />
                  <small className="field-tip">Número del cliente o vendedor que responderá al lead.</small>
                </div>

                <div className="form-group">
                  <label className="form-label">Sesión Emisora de la Alerta</label>
                  <select
                    className="form-select"
                    value={clientForm.senderSessionId}
                    onChange={e => setClientForm(prev => ({ ...prev, senderSessionId: e.target.value }))}
                  >
                    <option value="">(Cualquier sesión conectada)</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.id} ({s.status})
                      </option>
                    ))}
                  </select>
                  <small className="field-tip">Sesión de WhatsApp que despachará el mensaje.</small>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Palabras Clave Locales (separadas por comas) *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="pizza, pizzas, bajon, queso, familiar, churre, hambre"
                  value={clientForm.localKeywords}
                  onChange={e => setClientForm(prev => ({ ...prev, localKeywords: e.target.value }))}
                />
                <small className="field-tip">
                  El sistema detecta automáticamente variaciones y raíces en español (ej: "pizza" detectará "pizzas" y "pizzería").
                </small>
              </div>

              <div className="form-group ai-criteria-group">
                <div className="ai-criteria-header">
                  <div>
                    <label className="form-label mb-0">Validación Semántica con IA (Filtro Anti-Vendedores)</label>
                    <small className="field-tip">
                      Usa TypeSafe (jev-latest) para validar intención de compra y descartar vendedores o spam.
                    </small>
                  </div>
                  <button
                    type="button"
                    className={`client-toggle-switch ${clientForm.useAiFilter ? 'on' : ''}`}
                    onClick={() => setClientForm(prev => ({ ...prev, useAiFilter: !prev.useAiFilter }))}
                    title={clientForm.useAiFilter ? 'Desactivar filtro IA' : 'Activar filtro IA'}
                  >
                    <span className="toggle-slider" />
                  </button>
                </div>

                {clientForm.useAiFilter && (
                  <div className="ai-criteria-input-box">
                    <textarea
                      className="form-textarea"
                      rows={2}
                      placeholder="Ej: El usuario busca comprar o contratar, no está ofreciendo ni vendiendo"
                      value={clientForm.jevPromptCriteria}
                      onChange={e => setClientForm(prev => ({ ...prev, jevPromptCriteria: e.target.value }))}
                    />
                    <small className="field-tip">
                      💡 <strong>Regla de Intención:</strong> La IA analizará el mensaje tras pasar las palabras clave. Si es un vendedor ofreciendo productos, se descartará automáticamente.
                    </small>
                  </div>
                )}
              </div>

              <div className="form-group">
                <div className="template-label-row">
                  <label className="form-label">Plantilla de Alerta para WhatsApp</label>
                  <div className="template-quick-tags">
                    <span>Insertar tag:</span>
                    <button type="button" onClick={() => handleInsertTag('{grupo}')}>
                      {'{grupo}'}
                    </button>
                    <button type="button" onClick={() => handleInsertTag('{rubro}')}>
                      {'{rubro}'}
                    </button>
                    <button type="button" onClick={() => handleInsertTag('{comprador_telefono}')}>
                      {'{comprador_telefono}'}
                    </button>
                    <button type="button" onClick={() => handleInsertTag('{mensaje_comprador}')}>
                      {'{mensaje_comprador}'}
                    </button>
                    <button type="button" onClick={() => handleInsertTag('{enlace_whatsapp}')}>
                      {'{enlace_whatsapp}'}
                    </button>
                  </div>
                </div>
                <textarea
                  className="form-textarea code-font"
                  rows={7}
                  value={clientForm.alertTemplate}
                  onChange={e => setClientForm(prev => ({ ...prev, alertTemplate: e.target.value }))}
                />
              </div>

              <div className="checkbox-field-row">
                <label className="checkbox-custom-label">
                  <input
                    type="checkbox"
                    checked={clientForm.active}
                    onChange={e => setClientForm(prev => ({ ...prev, active: e.target.checked }))}
                  />
                  <span>Cliente activo en el escáner</span>
                </label>
              </div>

              <div className="radar-modal-footer">
                <button
                  type="button"
                  className="radar-btn-outline"
                  onClick={() => setIsClientModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="radar-primary-btn"
                  disabled={isSavingClient}
                >
                  {isSavingClient ? <RefreshCw size={16} className="spinning" /> : <Check size={16} />}
                  <span>{editingClient ? 'Guardar Cambios' : 'Crear Cliente'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
