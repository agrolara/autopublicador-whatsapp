import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  DollarSign,
  RefreshCw,
  Cpu,
  Mic,
  Radar,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Settings,
  Trash2,
  Activity,
  Layers,
  Sparkles,
  TrendingDown,
  Info,
  Clock,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { aiTelemetryApi } from '../services/api';
import type {
  AiBalanceSummary,
  AiBudgetConfig,
  AiUsageLogItem,
  UpdateAiBudgetPayload,
} from '../services/api';
import './AiTelemetryView.css';

export const AiTelemetryView: React.FC = () => {
  const [balances, setBalances] = useState<AiBalanceSummary | null>(null);
  const [budgetConfig, setBudgetConfig] = useState<AiBudgetConfig | null>(null);
  const [logs, setLogs] = useState<AiUsageLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  // Budget modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState<UpdateAiBudgetPayload>({
    groqInitialBalance: 5.0,
    typesafeInitialBalance: 5.0,
    openrouterInitialBalance: 10.0,
    costAlertThresholdUsd: 1.0,
    openrouterApiKeyOverride: '',
    groqApiKeyOverride: '',
    typesafeApiKeyOverride: '',
  });

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setSyncing(true);
    else setLoading(true);
    setStatusMessage(null);

    try {
      const [balancesRes, budgetRes, logsRes] = await Promise.all([
        aiTelemetryApi.getBalances(),
        aiTelemetryApi.getBudget(),
        aiTelemetryApi.getLogs({ limit: 50 }),
      ]);

      setBalances(balancesRes);
      setBudgetConfig(budgetRes);
      setLogs(logsRes);

      setBudgetForm({
        groqInitialBalance: budgetRes.groqInitialBalance,
        typesafeInitialBalance: budgetRes.typesafeInitialBalance,
        openrouterInitialBalance: budgetRes.openrouterInitialBalance,
        costAlertThresholdUsd: budgetRes.costAlertThresholdUsd,
        openrouterApiKeyOverride: budgetRes.openrouterApiKeyOverride || '',
        groqApiKeyOverride: budgetRes.groqApiKeyOverride || '',
        typesafeApiKeyOverride: budgetRes.typesafeApiKeyOverride || '',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Error al cargar datos de telemetría: ${err.message || String(err)}`,
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    try {
      await aiTelemetryApi.updateBudget(budgetForm);
      setStatusMessage({
        type: 'success',
        text: 'Presupuestos y configuración de saldos actualizados con éxito.',
      });
      setIsModalOpen(false);
      await fetchData(true);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Error al guardar presupuestos: ${err.message || String(err)}`,
      });
    } finally {
      setSavingBudget(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('¿Estás seguro de que deseas vaciar el historial de consumos de IA? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      await aiTelemetryApi.clearLogs();
      setLogs([]);
      setStatusMessage({
        type: 'success',
        text: 'Historial de consumos vaciado exitosamente.',
      });
      await fetchData(true);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Error al vaciar historial: ${err.message || String(err)}`,
      });
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (providerFilter !== 'all' && log.provider !== providerFilter) return false;
    if (serviceFilter !== 'all' && log.serviceType !== serviceFilter) return false;
    return true;
  });

  if (loading && !balances) {
    return (
      <div className="ai-telemetry-loading">
        <RefreshCw className="spin-icon" size={32} />
        <p>Cargando métricas de consumo y saldos en vivo...</p>
      </div>
    );
  }

  const combined = balances?.combined || {
    totalRemainingBalanceUsd: 0,
    totalSpentUsd: 0,
    totalRequestsCount: 0,
    hasLowBalanceAlert: false,
    alertMessages: [],
  };

  const or = balances?.openrouter;
  const groq = balances?.groq;
  const typesafe = balances?.typesafe;

  return (
    <div className="ai-telemetry-wrapper">
      {/* Top Header Actions */}
      <div className="ai-telemetry-header">
        <div>
          <h2>📊 Métricas de Consumo, Costos y Saldos de IA</h2>
          <p className="ai-telemetry-desc">
            Monitoreo en tiempo real de saldos en <strong>OpenRouter</strong> (API en vivo), <strong>Groq Whisper</strong> (Contabilidad digital por segundos de audio) y <strong>TypeSafe AI</strong> (Evaluaciones semánticas del Radar).
          </p>
        </div>
        <div className="ai-telemetry-actions">
          <button
            type="button"
            className="ai-btn-secondary"
            onClick={() => setIsModalOpen(true)}
          >
            <Settings size={16} />
            <span>Presupuestos y Recargas</span>
          </button>
          <button
            type="button"
            className="ai-btn-primary"
            onClick={() => fetchData(true)}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? 'spin-icon' : ''} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar en Vivo'}</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {statusMessage && (
        <div className={`ai-telemetry-banner ${statusMessage.type}`}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {combined.hasLowBalanceAlert && (
        <div className="ai-telemetry-banner alert">
          <ShieldAlert size={22} className="banner-icon-alert" />
          <div className="alert-content">
            <strong>⚠️ Alerta de Saldo Bajo Detectada</strong>
            <ul className="alert-list">
              {combined.alertMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 4 Hero KPI Cards */}
      <div className="ai-kpi-grid">
        <div className="ai-kpi-card highlight">
          <div className="kpi-icon-wrap green">
            <Wallet size={24} />
          </div>
          <div className="kpi-body">
            <span className="kpi-title">Saldo Disponible Total</span>
            <div className="kpi-val">${combined.totalRemainingBalanceUsd.toFixed(2)} USD</div>
            <span className="kpi-foot">OpenRouter + Groq + TypeSafe</span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className="kpi-icon-wrap blue">
            <DollarSign size={24} />
          </div>
          <div className="kpi-body">
            <span className="kpi-title">Gasto Total Acumulado</span>
            <div className="kpi-val">${combined.totalSpentUsd.toFixed(4)} USD</div>
            <span className="kpi-foot">Calculado por consumo real</span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className="kpi-icon-wrap purple">
            <Activity size={24} />
          </div>
          <div className="kpi-body">
            <span className="kpi-title">Peticiones Totales IA</span>
            <div className="kpi-val">{combined.totalRequestsCount.toLocaleString()}</div>
            <span className="kpi-foot">Chats + Audios + Evaluaciones</span>
          </div>
        </div>

        <div className="ai-kpi-card">
          <div className={`kpi-icon-wrap ${combined.hasLowBalanceAlert ? 'amber' : 'emerald'}`}>
            {combined.hasLowBalanceAlert ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
          </div>
          <div className="kpi-body">
            <span className="kpi-title">Estado de Saldos</span>
            <div className={`kpi-status-badge ${combined.hasLowBalanceAlert ? 'warning' : 'ok'}`}>
              {combined.hasLowBalanceAlert ? 'Requiere Atención' : 'Saldos Óptimos'}
            </div>
            <span className="kpi-foot">Umbral de aviso: ${budgetConfig?.costAlertThresholdUsd.toFixed(2)} USD</span>
          </div>
        </div>
      </div>

      {/* 3 Provider Breakdown Cards */}
      <div className="ai-providers-grid">
        {/* Card 1: OpenRouter */}
        <div className="ai-provider-card">
          <div className="provider-header">
            <div className="provider-info-left">
              <div className="provider-icon openrouter">
                <Cpu size={22} />
              </div>
              <div>
                <h3>OpenRouter</h3>
                <span className="provider-sub">Chat LLM WhatsApp (DeepSeek / Llama)</span>
              </div>
            </div>
            <div className="provider-badge-wrap">
              {or?.status === 'connected' ? (
                <span className="status-chip chip-live">🟢 API en Vivo</span>
              ) : or?.status === 'error' ? (
                <span className="status-chip chip-error">🔴 Error Conexión</span>
              ) : (
                <span className="status-chip chip-neutral">⚪ No Configurado</span>
              )}
            </div>
          </div>

          <div className="provider-balance-hero">
            <span className="hero-label">Saldo Restante en OpenRouter</span>
            <div className="hero-balance-val">
              ${(or?.remainingCredits ?? 0).toFixed(2)} <span className="currency">USD</span>
            </div>
            {or?.limit !== undefined && or.limit !== null && (
              <span className="hero-limit">Límite asignado a la llave: ${or.limit} USD</span>
            )}
          </div>

          <div className="provider-stats-list">
            <div className="stat-row">
              <span className="stat-label">Créditos Totales Adquiridos:</span>
              <span className="stat-value font-mono">${(or?.totalCredits ?? 0).toFixed(2)} USD</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Consumo Reportado por API:</span>
              <span className="stat-value font-mono">${(or?.totalUsage ?? 0).toFixed(4)} USD</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Tokens Locales Computados:</span>
              <span className="stat-value font-mono">{(or?.localTokensCount ?? 0).toLocaleString()} tok</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Llamadas Realizadas:</span>
              <span className="stat-value font-mono">{(or?.localRequestsCount ?? 0).toLocaleString()} peticiones</span>
            </div>
            {or?.keyLabel && (
              <div className="stat-row">
                <span className="stat-label">Etiqueta de API Key:</span>
                <span className="stat-value">{or.keyLabel}</span>
              </div>
            )}
          </div>

          <div className="provider-footer">
            <a
              href="https://openrouter.ai/credits"
              target="_blank"
              rel="noopener noreferrer"
              className="provider-link-btn"
            >
              <span>Recargar en OpenRouter</span>
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>

        {/* Card 2: Groq Whisper */}
        <div className="ai-provider-card">
          <div className="provider-header">
            <div className="provider-info-left">
              <div className="provider-icon groq">
                <Mic size={22} />
              </div>
              <div>
                <h3>Groq Whisper</h3>
                <span className="provider-sub">Transcripción Audio STT en ~300ms</span>
              </div>
            </div>
            <div className="provider-badge-wrap">
              {groq?.status === 'connected' ? (
                <span className="status-chip chip-ledger">⚡ Contabilidad Digital</span>
              ) : (
                <span className="status-chip chip-neutral">⚪ No Configurado</span>
              )}
            </div>
          </div>

          <div className="provider-balance-hero">
            <span className="hero-label">Saldo Restante Estimado</span>
            <div className="hero-balance-val">
              ${(groq?.remainingBalanceUsd ?? 0).toFixed(2)} <span className="currency">USD</span>
            </div>
            <span className="hero-limit">Saldo Base: ${(groq?.initialBalance ?? 5).toFixed(2)} USD</span>
          </div>

          <div className="provider-stats-list">
            <div className="stat-row">
              <span className="stat-label">Costo Acumulado Estimado:</span>
              <span className="stat-value font-mono">${(groq?.estimatedCostUsd ?? 0).toFixed(4)} USD</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Audios de Voz Transcritos:</span>
              <span className="stat-value font-mono">{(groq?.transcriptionsCount ?? 0).toLocaleString()} audios</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Tiempo Total de Audio:</span>
              <span className="stat-value font-mono">
                {groq?.audioSecondsCount ?? 0}s ({groq?.audioMinutesCount ?? 0} min)
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Tarifa Whisper Turbo:</span>
              <span className="stat-value font-mono">$0.04 USD / hora ($0.00067/min)</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Cupo Diario Gratuito:</span>
              <span className="stat-value text-emerald">Hasta 2.000 audios/día</span>
            </div>
          </div>

          <div className="provider-footer">
            <button
              type="button"
              className="provider-link-btn outline"
              onClick={() => setIsModalOpen(true)}
            >
              <span>Ajustar Saldo Groq</span>
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* Card 3: TypeSafe AI Jevs */}
        <div className="ai-provider-card">
          <div className="provider-header">
            <div className="provider-info-left">
              <div className="provider-icon typesafe">
                <Radar size={22} />
              </div>
              <div>
                <h3>TypeSafe AI (Jevs)</h3>
                <span className="provider-sub">Clasificador Semántico Radar de Leads</span>
              </div>
            </div>
            <div className="provider-badge-wrap">
              {typesafe?.status === 'connected' ? (
                <span className="status-chip chip-ledger">🎯 Activo (jev-latest)</span>
              ) : (
                <span className="status-chip chip-neutral">⚪ No Configurado</span>
              )}
            </div>
          </div>

          <div className="provider-balance-hero">
            <span className="hero-label">Saldo Restante Estimado</span>
            <div className="hero-balance-val">
              ${(typesafe?.remainingBalanceUsd ?? 0).toFixed(2)} <span className="currency">USD</span>
            </div>
            <span className="hero-limit">Saldo Base: ${(typesafe?.initialBalance ?? 5).toFixed(2)} USD</span>
          </div>

          <div className="provider-stats-list">
            <div className="stat-row">
              <span className="stat-label">Costo Acumulado Estimado:</span>
              <span className="stat-value font-mono">
                ${(typesafe?.estimatedCostUsd ?? 0) < 0.01 && (typesafe?.estimatedCostUsd ?? 0) > 0
                  ? (typesafe?.estimatedCostUsd ?? 0).toFixed(6)
                  : (typesafe?.estimatedCostUsd ?? 0).toFixed(4)} USD
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Mensajes de Grupos Evaluados:</span>
              <span className="stat-value font-mono">{(typesafe?.evaluationsCount ?? 0).toLocaleString()} evals</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Leads Aprobados (Compradores):</span>
              <span className="stat-value text-emerald font-mono">{(typesafe?.approvedLeadsCount ?? 0).toLocaleString()}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Spam Descartado (Vendedores):</span>
              <span className="stat-value text-muted font-mono">{(typesafe?.discardedAdsCount ?? 0).toLocaleString()}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Tarifa Oficial:</span>
              <span className="stat-value font-mono">$0.042 USD / 1M tokens</span>
            </div>
          </div>

          <div className="provider-footer">
            <button
              type="button"
              className="provider-link-btn outline"
              onClick={() => setIsModalOpen(true)}
            >
              <span>Ajustar Saldo TypeSafe</span>
              <Settings size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Usage History Section */}
      <div className="ai-history-section">
        <div className="history-header">
          <div className="history-title-wrap">
            <Clock size={20} />
            <h3>Historial de Peticiones y Telemetría Reciente</h3>
            <span className="badge-count">{filteredLogs.length} registros</span>
          </div>

          <div className="history-controls">
            {/* Filter by provider */}
            <div className="filter-group">
              <label>Proveedor:</label>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="ai-select-mini"
              >
                <option value="all">Todos</option>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq Whisper</option>
                <option value="typesafe">TypeSafe AI</option>
              </select>
            </div>

            {/* Filter by service */}
            <div className="filter-group">
              <label>Servicio:</label>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="ai-select-mini"
              >
                <option value="all">Todos</option>
                <option value="chat_llm">Chat LLM</option>
                <option value="audio_stt">Audio STT</option>
                <option value="radar_eval">Radar de Leads</option>
              </select>
            </div>

            <button
              type="button"
              className="ai-btn-danger-mini"
              onClick={handleClearLogs}
              title="Vaciar Historial"
            >
              <Trash2 size={14} />
              <span>Limpiar</span>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="ai-empty-history">
            <Info size={28} />
            <p>No hay registros de consumo registrados para los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="ai-table-responsive">
            <table className="ai-telemetry-table">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Proveedor</th>
                  <th>Servicio</th>
                  <th>Modelo</th>
                  <th>Consumo / Detalle</th>
                  <th>Costo Estimado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-mono text-xs">
                      {new Date(log.createdAt).toLocaleString('es-CL', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className={`provider-chip ${log.provider}`}>
                        {log.provider === 'openrouter'
                          ? 'OpenRouter'
                          : log.provider === 'groq'
                          ? 'Groq'
                          : log.provider === 'typesafe'
                          ? 'TypeSafe'
                          : log.provider}
                      </span>
                    </td>
                    <td className="text-sm">
                      {log.serviceType === 'chat_llm'
                        ? '💬 Chat LLM'
                        : log.serviceType === 'audio_stt'
                        ? '🎙️ Audio STT'
                        : log.serviceType === 'radar_eval'
                        ? '🎯 Radar Eval'
                        : log.serviceType}
                    </td>
                    <td className="font-mono text-xs text-muted truncate max-w-xs" title={log.model}>
                      {log.model}
                    </td>
                    <td className="text-xs">
                      {log.totalTokens > 0 && <span>{log.totalTokens.toLocaleString()} tokens</span>}
                      {log.audioSeconds > 0 && <span>{log.audioSeconds}s audio</span>}
                      {log.serviceType === 'radar_eval' && log.totalTokens === 0 && <span>1 eval (~350 tok)</span>}
                    </td>
                    <td className="font-mono text-xs text-emerald">
                      ${log.costUsd < 0.0001 && log.costUsd > 0 ? log.costUsd.toFixed(6) : log.costUsd.toFixed(5)} USD
                    </td>
                    <td>
                      {log.success ? (
                        <span className="status-badge success">Éxito</span>
                      ) : (
                        <span
                          className="status-badge error"
                          title={log.errorDetails || 'Error desconocido'}
                        >
                          Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Budget & Recharge Modal */}
      {isModalOpen && (
        <div className="ai-modal-overlay">
          <div className="ai-modal-box">
            <div className="ai-modal-header">
              <div className="modal-title-wrap">
                <Settings size={20} />
                <h3>Configuración de Presupuestos, Recargas y Alertas</h3>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="ai-modal-form">
              <p className="modal-desc">
                Configura los saldos base de recarga para la contabilidad de <strong>Groq</strong> y <strong>TypeSafe</strong>, el saldo inicial de <strong>OpenRouter</strong> (si no hay API Key en vivo) y el umbral para activar avisos de saldo bajo.
              </p>

              <div className="form-group-row">
                <div className="form-group">
                  <label>Saldo Inicial / Recarga OpenRouter ($ USD):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetForm.openrouterInitialBalance}
                    onChange={(e) =>
                      setBudgetForm({ ...budgetForm, openrouterInitialBalance: parseFloat(e.target.value) || 0 })
                    }
                    className="ai-input"
                    required
                  />
                  <small>Utilizado como base si se consulta saldo sin conexión en vivo.</small>
                </div>

                <div className="form-group">
                  <label>Saldo Inicial / Recarga Groq ($ USD):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetForm.groqInitialBalance}
                    onChange={(e) =>
                      setBudgetForm({ ...budgetForm, groqInitialBalance: parseFloat(e.target.value) || 0 })
                    }
                    className="ai-input"
                    required
                  />
                  <small>Groq deduce $0.04 USD por hora de audio transcrito.</small>
                </div>
              </div>

              <div className="form-group-row">
                <div className="form-group">
                  <label>Saldo Inicial / Recarga TypeSafe ($ USD):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetForm.typesafeInitialBalance}
                    onChange={(e) =>
                      setBudgetForm({ ...budgetForm, typesafeInitialBalance: parseFloat(e.target.value) || 0 })
                    }
                    className="ai-input"
                    required
                  />
                  <small>TypeSafe (Jevs) tarifa: $0.042 USD por millón de tokens (~$0.000015 USD por eval).</small>
                </div>

                <div className="form-group">
                  <label>Umbral Alerta Saldo Bajo ($ USD):</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={budgetForm.costAlertThresholdUsd}
                    onChange={(e) =>
                      setBudgetForm({ ...budgetForm, costAlertThresholdUsd: parseFloat(e.target.value) || 0 })
                    }
                    className="ai-input"
                    required
                  />
                  <small>Muestra aviso preventivo cuando algún saldo baja de este monto.</small>
                </div>
              </div>

              <div className="ai-modal-footer">
                <button
                  type="button"
                  className="ai-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={savingBudget}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="ai-btn-primary"
                  disabled={savingBudget}
                >
                  {savingBudget ? 'Guardando...' : 'Guardar y Recalcular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
