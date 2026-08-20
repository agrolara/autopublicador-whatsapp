import React, { useState, useEffect, useRef } from 'react';
import {
  FolderGit2,
  RefreshCw,
  Plus,
  Rocket,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Copy,
  ExternalLink,
  Trash2,
  Search,
  Users,
  ShieldCheck,
  Clock,
  Loader2,
  Pause,
} from 'lucide-react';
import { groupVaultApi, sessionApi, type Session, type VaultGroupItem, type AutoJoinJob } from '../services/api';
import './GroupVault.css';

export function GroupVault() {
  const [groups, setGroups] = useState<VaultGroupItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Sync Modal / Action State
  const [syncingSessionId, setSyncingSessionId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Auto-Join Modal / Wizard State
  const [showAutoJoinModal, setShowAutoJoinModal] = useState(false);
  const [targetSessionId, setTargetSessionId] = useState('');
  const [joinInterval, setJoinInterval] = useState(30);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [activeJob, setActiveJob] = useState<AutoJoinJob | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);

  const jobPollRef = useRef<NodeJS.Timeout | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [vaultGroups, sessionList] = await Promise.all([
        groupVaultApi.list().catch(() => []),
        sessionApi.list().catch(() => []),
      ]);
      setGroups(vaultGroups);
      setSessions(sessionList);

      const readySess = sessionList.find(s => s.status === 'ready');
      if (readySess && !syncingSessionId) {
        setSyncingSessionId(readySess.id);
      }
      if (readySess && !targetSessionId) {
        setTargetSessionId(readySess.id);
      }
    } catch {
      showNotification('error', 'Error al cargar catálogo de grupos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Poll active auto-join job
  useEffect(() => {
    if (activeJob && activeJob.status === 'running') {
      jobPollRef.current = setInterval(async () => {
        try {
          const updated = await groupVaultApi.getJobStatus(activeJob.id);
          if (updated) {
            setActiveJob(updated);
            if (updated.status !== 'running') {
              if (jobPollRef.current) clearInterval(jobPollRef.current);
              showNotification(
                updated.status === 'completed' ? 'success' : 'info',
                `Auto-unión ${updated.status === 'completed' ? 'completada' : 'finalizada'}: ${updated.joined} unidos, ${updated.alreadyMember} ya miembro, ${updated.failed} fallidos.`
              );
            }
          }
        } catch {
          // ignore polling error
        }
      }, 3000);
    }
    return () => {
      if (jobPollRef.current) clearInterval(jobPollRef.current);
    };
  }, [activeJob?.id, activeJob?.status]);

  const handleSyncSession = async () => {
    if (!syncingSessionId) {
      alert('Selecciona una sesión conectada para sincronizar.');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await groupVaultApi.syncFromSession(syncingSessionId);
      showNotification('success', `✨ Sincronización exitosa: ${res.total} grupos escaneados, ${res.withLinks} con enlace activo (${res.newAdded} nuevos).`);
      void loadData();
    } catch (err: any) {
      showNotification('error', `Error al sincronizar: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportLinks = async () => {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      alert('Pega al menos un enlace de grupo de WhatsApp.');
      return;
    }
    setIsImporting(true);
    try {
      const res = await groupVaultApi.importLinks(lines);
      showNotification('success', `📋 Importación completada: ${res.imported} grupos nuevos, ${res.updated} actualizados.`);
      setShowImportModal(false);
      setImportText('');
      void loadData();
    } catch (err: any) {
      showNotification('error', `Error al importar: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartAutoJoin = async () => {
    if (!targetSessionId) {
      alert('Selecciona el chip / sesión de destino que se unirá a los grupos.');
      return;
    }
    setIsStartingJob(true);
    try {
      const groupIds = selectedGroupIds.size > 0 ? Array.from(selectedGroupIds) : undefined;
      const job = await groupVaultApi.startAutoJoin(targetSessionId, {
        groupIds,
        intervalSeconds: joinInterval,
      });
      setActiveJob(job);
      showNotification('success', `🚀 Proceso de auto-unión iniciado para ${job.total} grupos.`);
    } catch (err: any) {
      showNotification('error', `Error al iniciar auto-unión: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsStartingJob(false);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await groupVaultApi.cancelJob(activeJob.id);
      setActiveJob({ ...activeJob, status: 'cancelled' });
      showNotification('info', '⏸️ Proceso de auto-unión cancelado.');
    } catch (err: any) {
      showNotification('error', `Error al cancelar: ${err?.message}`);
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el grupo "${name}" del catálogo?`)) return;
    try {
      await groupVaultApi.deleteGroup(id);
      setGroups(prev => prev.filter(g => g.id !== id && g.inviteCode !== id));
      showNotification('success', 'Grupo eliminado del catálogo.');
    } catch (err: any) {
      showNotification('error', `Error al eliminar: ${err?.message}`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('info', '📋 Enlace copiado al portapapeles.');
  };

  const filteredGroups = groups.filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.inviteUrl && g.inviteUrl.toLowerCase().includes(q));
  });

  const totalWithLinks = groups.filter(g => !!g.inviteCode).length;

  return (
    <div className="group-vault-page">
      {/* Toast Notification */}
      {toast && (
        <div className={`gv-toast gv-toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'error' && <XCircle size={18} />}
          {toast.type === 'info' && <ShieldCheck size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="gv-header">
        <div>
          <h1 className="gv-title">
            <FolderGit2 className="gv-title-icon" size={28} />
            Catálogo de Grupos & Auto-Unión
          </h1>
          <p className="gv-subtitle">
            Bóveda centralizada de enlaces de invitación para sincronizar y conectar nuevos números a todos tus grupos automáticamente.
          </p>
        </div>

        <div className="gv-header-actions">
          <button className="gv-btn gv-btn-secondary" onClick={() => setShowImportModal(true)}>
            <Plus size={16} /> Importar Enlaces
          </button>
          <button className="gv-btn gv-btn-primary" onClick={() => setShowAutoJoinModal(true)}>
            <Rocket size={16} /> 🚀 Auto-Unir Nuevo Chip
          </button>
        </div>
      </div>

      {/* Sync Bar Card */}
      <div className="gv-card gv-sync-card">
        <div className="gv-sync-content">
          <div className="gv-sync-info">
            <RefreshCw size={22} className={isSyncing ? 'animate-spin text-blue-500' : 'text-blue-500'} />
            <div>
              <div className="gv-sync-title">Sincronizar Catálogo desde Número Conectado</div>
              <div className="gv-sync-desc">
                Escanea los grupos de tu sesión activa y extrae automáticamente los enlaces de invitación para guardarlos en el servidor.
              </div>
            </div>
          </div>

          <div className="gv-sync-controls">
            <select
              value={syncingSessionId}
              onChange={e => setSyncingSessionId(e.target.value)}
              className="gv-select"
              disabled={isSyncing}
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  📱 {s.name || s.phone || s.id.slice(0, 8)} ({s.status === 'ready' ? '🟢 Conectado' : '⚪ ' + s.status})
                </option>
              ))}
            </select>

            <button
              className="gv-btn gv-btn-sync"
              onClick={handleSyncSession}
              disabled={isSyncing || !syncingSessionId}
            >
              {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {isSyncing ? 'Sincronizando...' : 'Sincronizar Enlaces'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Auto-Join Job Monitor Card */}
      {activeJob && (
        <div className="gv-card gv-job-card">
          <div className="gv-job-header">
            <div className="gv-job-title">
              <Rocket size={20} className={activeJob.status === 'running' ? 'animate-bounce text-blue-600' : 'text-slate-600'} />
              <span>
                Progreso de Auto-Unión ({activeJob.status === 'running' ? '🟢 En Ejecución' : activeJob.status === 'completed' ? '🏁 Completado' : '⏸️ ' + activeJob.status})
              </span>
            </div>

            {activeJob.status === 'running' && (
              <button className="gv-btn gv-btn-cancel" onClick={handleCancelJob}>
                <Pause size={14} /> Detener
              </button>
            )}
          </div>

          <div className="gv-job-progress-container">
            <div className="gv-job-stats-grid">
              <div className="gv-stat-box">
                <span className="gv-stat-label">Total a Unir</span>
                <span className="gv-stat-val">{activeJob.total}</span>
              </div>
              <div className="gv-stat-box gv-stat-joined">
                <span className="gv-stat-label">🟢 Unidos</span>
                <span className="gv-stat-val">{activeJob.joined}</span>
              </div>
              <div className="gv-stat-box gv-stat-member">
                <span className="gv-stat-label">ℹ️ Ya Miembro</span>
                <span className="gv-stat-val">{activeJob.alreadyMember}</span>
              </div>
              <div className="gv-stat-box gv-stat-failed">
                <span className="gv-stat-label">❌ Errores</span>
                <span className="gv-stat-val">{activeJob.failed}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="gv-progress-bar-bg">
              <div
                className="gv-progress-bar-fill"
                style={{ width: `${Math.round((activeJob.completed / (activeJob.total || 1)) * 100)}%` }}
              />
            </div>

            {activeJob.currentGroupName && activeJob.status === 'running' && (
              <div className="gv-current-step">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span>Procesando: <strong>{activeJob.currentGroupName}</strong> (Próximo en {activeJob.intervalSeconds}s...)</span>
              </div>
            )}
          </div>

          {/* Logs scrollbox */}
          {activeJob.logs.length > 0 && (
            <div className="gv-job-logs">
              {activeJob.logs.map((log, idx) => (
                <div key={idx} className={`gv-log-entry gv-log-${log.status}`}>
                  <span className="gv-log-time">[{log.timestamp}]</span>
                  <span className="gv-log-name">{log.groupName}:</span>
                  <span className="gv-log-msg">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats and Search Row */}
      <div className="gv-table-controls">
        <div className="gv-stats-badges">
          <div className="gv-badge">
            <Users size={14} /> Total Grupos: <strong>{groups.length}</strong>
          </div>
          <div className="gv-badge gv-badge-success">
            <CheckCircle size={14} /> Con Enlace Vigente: <strong>{totalWithLinks}</strong>
          </div>
          {groups.length - totalWithLinks > 0 && (
            <div className="gv-badge gv-badge-warning">
              <AlertTriangle size={14} /> Sin Enlace: <strong>{groups.length - totalWithLinks}</strong>
            </div>
          )}
        </div>

        <div className="gv-search-wrap">
          <Search size={16} className="gv-search-icon" />
          <input
            type="text"
            placeholder="Buscar grupo por nombre o enlace..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="gv-search-input"
          />
        </div>
      </div>

      {/* Groups Table */}
      <div className="gv-card gv-table-card">
        {loading ? (
          <div className="gv-loading">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <span>Cargando catálogo de grupos...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="gv-empty">
            <FolderGit2 size={42} className="text-slate-300" />
            <p>No hay grupos en el catálogo todavía.</p>
            <p className="text-sm text-slate-400">
              Pulsa <strong>"Sincronizar Enlaces"</strong> arriba para extraer los grupos de tu número o <strong>"Importar Enlaces"</strong> para pegarlos manualmente.
            </p>
          </div>
        ) : (
          <div className="gv-table-wrapper">
            <table className="gv-table">
              <thead>
                <tr>
                  <th>Nombre del Grupo</th>
                  <th>Enlace de Invitación</th>
                  <th>Estado</th>
                  <th>Última Sincronización</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map(group => {
                  const hasLink = !!group.inviteCode;
                  return (
                    <tr key={group.id}>
                      <td className="gv-td-name">
                        <div className="gv-group-name">{group.name}</div>
                        <div className="gv-group-id">{group.id}</div>
                      </td>
                      <td className="gv-td-link">
                        {hasLink ? (
                          <div className="gv-link-row">
                            <span className="gv-link-url">{group.inviteUrl}</span>
                            <button
                              type="button"
                              className="gv-icon-btn"
                              title="Copiar Enlace"
                              onClick={() => copyToClipboard(group.inviteUrl || '')}
                            >
                              <Copy size={14} />
                            </button>
                            <a
                              href={group.inviteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="gv-icon-btn"
                              title="Abrir en WhatsApp"
                            >
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin enlace (el bot no es admin)</span>
                        )}
                      </td>
                      <td>
                        {hasLink ? (
                          <span className="gv-status-tag gv-tag-active">🟢 Enlace Activo</span>
                        ) : (
                          <span className="gv-status-tag gv-tag-unknown">⚪ Sin Enlace</span>
                        )}
                      </td>
                      <td className="text-xs text-slate-500">
                        {group.lastSyncedAt ? new Date(group.lastSyncedAt).toLocaleString() : 'N/A'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="gv-icon-btn gv-icon-delete"
                          title="Eliminar del catálogo"
                          onClick={() => handleDeleteGroup(group.id, group.name)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Links Modal */}
      {showImportModal && (
        <div className="gv-modal-overlay">
          <div className="gv-modal-box">
            <div className="gv-modal-header">
              <h3>➕ Importar Enlaces de Grupos</h3>
              <button onClick={() => setShowImportModal(false)}>✕</button>
            </div>
            <div className="gv-modal-body">
              <p className="text-sm text-slate-600 mb-2">
                Pega tus enlaces de WhatsApp (uno por línea o en formato <code>Nombre {'->'} https://chat.whatsapp.com/...</code>):
              </p>
              <textarea
                rows={8}
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={"Grupo Ventas -> https://chat.whatsapp.com/ABC123xyz\nhttps://chat.whatsapp.com/XYZ987abc"}
                className="gv-textarea font-mono text-xs"
              />
            </div>
            <div className="gv-modal-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => setShowImportModal(false)}>
                Cancelar
              </button>
              <button
                className="gv-btn gv-btn-primary"
                onClick={handleImportLinks}
                disabled={isImporting}
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {isImporting ? 'Importando...' : 'Importar al Catálogo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Join Wizard Modal */}
      {showAutoJoinModal && (
        <div className="gv-modal-overlay">
          <div className="gv-modal-box gv-modal-lg">
            <div className="gv-modal-header">
              <h3>🚀 Auto-Unir Nuevo Chip a los Grupos</h3>
              <button onClick={() => setShowAutoJoinModal(false)}>✕</button>
            </div>
            <div className="gv-modal-body">
              <div className="gv-info-banner">
                <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0" />
                <div className="text-xs text-emerald-800">
                  <strong>Pacing Seguro Anti-Bloqueo</strong>: Para proteger chips nuevos, el sistema se unirá a los grupos de forma progresiva con pausas automáticas para simular comportamiento humano.
                </div>
              </div>

              <div className="gv-form-group">
                <label className="gv-form-label">📱 Selecciona el Chip / Sesión que se Unirá:</label>
                <select
                  value={targetSessionId}
                  onChange={e => setTargetSessionId(e.target.value)}
                  className="gv-select w-full"
                >
                  <option value="" disabled>-- Selecciona una sesión --</option>
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      📱 {s.name || s.phone || s.id.slice(0, 8)} ({s.status === 'ready' ? '🟢 Conectado' : s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="gv-form-group">
                <label className="gv-form-label">⏱️ Pausa entre cada grupo:</label>
                <select
                  value={joinInterval}
                  onChange={e => setJoinInterval(Number(e.target.value))}
                  className="gv-select w-full"
                >
                  <option value={20}>20 segundos (Rápido - Para cuentas con antigüedad)</option>
                  <option value={35}>35 segundos (Recomendado - Balance óptimo)</option>
                  <option value={60}>60 segundos (Seguro - Para chips nuevos)</option>
                  <option value={120}>2 minutos (Ultra Seguro - Máxima protección)</option>
                </select>
              </div>

              <div className="gv-form-group">
                <div className="flex justify-between items-center mb-1">
                  <label className="gv-form-label mb-0">
                    Grupos Disponibles con Enlace ({totalWithLinks}):
                  </label>
                  <span className="text-xs text-slate-500">
                    Se unirán todos los grupos disponibles con enlace activo.
                  </span>
                </div>
                <div className="gv-groups-preview-list">
                  {groups.filter(g => !!g.inviteCode).slice(0, 8).map(g => (
                    <div key={g.id} className="gv-preview-item">
                      🟢 {g.name}
                    </div>
                  ))}
                  {totalWithLinks > 8 && (
                    <div className="text-xs text-slate-400 py-1 text-center">
                      ... y {totalWithLinks - 8} grupos más.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="gv-modal-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => setShowAutoJoinModal(false)}>
                Cerrar
              </button>
              <button
                className="gv-btn gv-btn-primary"
                onClick={() => {
                  setShowAutoJoinModal(false);
                  void handleStartAutoJoin();
                }}
                disabled={isStartingJob || !targetSessionId || totalWithLinks === 0}
              >
                {isStartingJob ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                Iniciar Auto-Unión ({totalWithLinks} Grupos)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
