import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckCircle, XCircle, Clock, AlertTriangle, Search, RotateCcw, BarChart3, Users, Zap } from 'lucide-react';
import { messageApi, type ScheduledBroadcastItem, type BroadcastResultDetail } from '../../services/api';

interface BroadcastReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ScheduledBroadcastItem | null;
  session: string;
  groups?: Array<{ id: string; name: string }>;
  onRetryFailed?: (item: ScheduledBroadcastItem, failedChatIds: string[]) => void;
}

export const BroadcastReportModal: React.FC<BroadcastReportModalProps> = ({
  isOpen,
  onClose,
  item,
  session,
  groups = [],
  onRetryFailed,
}) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'sent' | 'failed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Map for fast group name resolution
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.id, g.name);
    }
    return map;
  }, [groups]);

  useEffect(() => {
    if (!isOpen || !item) {
      setReport(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    messageApi.getScheduledBroadcastReport(session, item.id)
      .then(data => {
        if (isMounted) {
          setReport(data);
        }
      })
      .catch(err => {
        console.error('Error fetching broadcast report:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item, session]);

  if (!isOpen || !item) return null;

  const summary = report?.summary || item.lastSummary;
  const total = summary?.total ?? item.payload?.messages?.length ?? 0;
  const sent = summary?.sent ?? 0;
  const failed = summary?.failed ?? 0;
  const hasRun = !!(item.lastRunAt || summary);
  const successRate = total > 0 && hasRun ? Math.round((sent / total) * 100) : 0;

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return 'Calculando...';
    if (seconds < 60) return `${seconds} seg`;
    const mins = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    return `${mins} min ${remSecs > 0 ? `${remSecs}s` : ''}`;
  };

  // Generate detailed list of recipients
  const rawDetails: BroadcastResultDetail[] = summary?.details || [];
  const allRecipients = item.payload?.messages?.map(m => {
    const detail = rawDetails.find(d => d.chatId === m.chatId);
    const resolvedName = groupNameMap.get(m.chatId) || detail?.groupName || m.chatId;
    return {
      chatId: m.chatId,
      name: resolvedName,
      status: detail ? detail.status : (hasRun && summary?.status === 'completed' && failed === 0 ? 'sent' : 'pending'),
      error: detail?.error,
      messageId: detail?.messageId,
    };
  }) || [];

  const filteredRecipients = allRecipients.filter(r => {
    if (filterTab === 'sent' && r.status !== 'sent') return false;
    if (filterTab === 'failed' && r.status !== 'failed') return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.chatId.toLowerCase().includes(q);
    }
    return true;
  });

  const failedChatIds = allRecipients.filter(r => r.status === 'failed').map(r => r.chatId);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#6366f1',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              <BarChart3 size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                Reporte de Difusión Masiva
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
                🏷️ <strong>{item.name || 'Campaña Programada'}</strong> • ⏰ Hora: <strong>{item.scheduledTime} hrs</strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
              <div>Cargando métricas y resultados de la difusión...</div>
            </div>
          ) : (
            <>
              {/* KPI Cards Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                {/* Total */}
                <div
                  style={{
                    background: 'var(--bg-secondary, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    padding: '14px',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Users size={15} /> Total Destinatarios
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '6px', color: '#0f172a' }}>
                    {total} grupos
                  </div>
                </div>

                {/* Sent */}
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '14px',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <CheckCircle size={15} color="#16a34a" /> Enviados con Éxito
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '6px', color: '#15803d' }}>
                    {hasRun ? sent : '—'}
                  </div>
                  {hasRun && (
                    <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '2px' }}>
                      {successRate}% efectividad
                    </div>
                  )}
                </div>

                {/* Failed */}
                <div
                  style={{
                    background: failed > 0 ? '#fef2f2' : 'var(--bg-secondary, #f8fafc)',
                    border: `1px solid ${failed > 0 ? '#fecaca' : 'var(--border-color, #e2e8f0)'}`,
                    padding: '14px',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: failed > 0 ? '#991b1b' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <XCircle size={15} color={failed > 0 ? '#dc2626' : '#64748b'} /> Fallidos
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '6px', color: failed > 0 ? '#b91c1c' : '#64748b' }}>
                    {hasRun ? failed : '—'}
                  </div>
                  {failed > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '2px' }}>
                      Requieren atención
                    </div>
                  )}
                </div>

                {/* Duration / Last Execution */}
                <div
                  style={{
                    background: 'var(--bg-secondary, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    padding: '14px',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={15} /> Tiempo de Difusión
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '6px', color: '#0f172a' }}>
                    {summary?.durationSeconds !== undefined ? formatDuration(summary.durationSeconds) : hasRun ? 'Completado' : 'Pendiente'}
                  </div>
                  {item.lastRunAt && (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }}>
                      Último: {new Date(item.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {/* Success Progress Bar */}
              {hasRun && total > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>Tasa de Entrega Global</span>
                    <span style={{ fontWeight: 700, color: successRate >= 90 ? '#16a34a' : successRate >= 70 ? '#eab308' : '#dc2626' }}>
                      {successRate}% ({sent} de {total} grupos)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                    <div
                      style={{
                        width: `${successRate}%`,
                        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                        height: '100%',
                        transition: 'width 0.4s ease',
                      }}
                    />
                    {failed > 0 && (
                      <div
                        style={{
                          width: `${Math.round((failed / total) * 100)}%`,
                          background: '#ef4444',
                          height: '100%',
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Action Banner for Failed groups if any */}
              {failedChatIds.length > 0 && onRetryFailed && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fef3c7',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={20} color="#d97706" />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e' }}>
                        {failedChatIds.length} {failedChatIds.length === 1 ? 'grupo falló' : 'grupos fallaron'} en la última difusión
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
                        Puedes reintentar el envío masivo solo a los destinatarios no entregados.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: '#d97706',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 4px rgba(217, 119, 6, 0.2)',
                    }}
                    onClick={() => {
                      onRetryFailed(item, failedChatIds);
                      onClose();
                    }}
                  >
                    <RotateCcw size={15} /> Reintentar {failedChatIds.length} fallidos
                  </button>
                </div>
              )}

              {/* Filter Tabs & Search Bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-secondary, #f1f5f9)', padding: '4px', borderRadius: '10px' }}>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: filterTab === 'all' ? '#ffffff' : 'transparent',
                      color: filterTab === 'all' ? '#0f172a' : '#64748b',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: filterTab === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                    onClick={() => setFilterTab('all')}
                  >
                    Todos ({allRecipients.length})
                  </button>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: filterTab === 'sent' ? '#ffffff' : 'transparent',
                      color: filterTab === 'sent' ? '#166534' : '#64748b',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: filterTab === 'sent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                    onClick={() => setFilterTab('sent')}
                  >
                    🟢 Exitosos ({allRecipients.filter(r => r.status === 'sent').length})
                  </button>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: filterTab === 'failed' ? '#ffffff' : 'transparent',
                      color: filterTab === 'failed' ? '#991b1b' : '#64748b',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: filterTab === 'failed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                    onClick={() => setFilterTab('failed')}
                  >
                    🔴 Fallidos ({failedChatIds.length})
                  </button>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Buscar grupo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 32px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.85rem',
                      background: 'var(--card-bg, #ffffff)',
                      color: 'var(--text-primary, #0f172a)',
                    }}
                  />
                </div>
              </div>

              {/* Recipients Table */}
              <div
                style={{
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  maxHeight: '340px',
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: '#64748b' }}>
                      <th style={{ padding: '10px 14px' }}>#</th>
                      <th style={{ padding: '10px 14px' }}>Destinatario / Grupo</th>
                      <th style={{ padding: '10px 14px' }}>Estado</th>
                      <th style={{ padding: '10px 14px' }}>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipients.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          No se encontraron destinatarios con el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredRecipients.map((r, idx) => (
                        <tr
                          key={r.chatId + idx}
                          style={{
                            borderBottom: '1px solid var(--border-color, #f1f5f9)',
                            background: r.status === 'failed' ? '#fffafb' : undefined,
                          }}
                        >
                          <td style={{ padding: '10px 14px', color: '#94a3b8', width: '40px' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.chatId}</div>
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {r.status === 'sent' ? (
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle size={12} /> Enviado
                              </span>
                            ) : r.status === 'failed' ? (
                              <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <XCircle size={12} /> Fallido
                              </span>
                            ) : (
                              <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> Pendiente
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: r.error ? '#dc2626' : '#64748b', fontSize: '0.78rem' }}>
                            {r.error ? r.error : r.messageId ? `ID: ${r.messageId.slice(0, 16)}...` : hasRun ? 'Entregado con éxito' : 'En espera de horario programado'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            📅 Intervalo entre mensajes: <strong>4 a 12 seg (Aleatorio Humanizado)</strong>
          </div>
          <button
            type="button"
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
