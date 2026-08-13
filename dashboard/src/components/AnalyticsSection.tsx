import { useState, useEffect } from 'react';
import { analyticsApi, type AnalyticsSummaryItem } from '../services/api';
import { useSessionsQuery } from '../hooks/queries';
import { BarChart3, PieChart, CheckCircle2, Tag, Calendar, TrendingUp } from 'lucide-react';

export function AnalyticsSection() {
  const { data: sessions = [] } = useSessionsQuery();
  const [session, setSession] = useState<string>('');
  const [summary, setSummary] = useState<AnalyticsSummaryItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessions.length > 0 && !session) {
      setSession(sessions[0].id);
    }
  }, [sessions, session]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    analyticsApi.getSummary(session)
      .then(res => setSummary(res))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [session]);

  if (!summary) return null;

  const maxHourCount = Math.max(...summary.activityByHour.map(h => h.count), 1);

  return (
    <section style={{ marginTop: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          📊 Analítica & Estadísticas de Envíos
        </h2>
        {sessions.length > 1 && (
          <select
            value={session}
            onChange={e => setSession(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
        )}
      </div>

      {/* Analytics KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Tasa de Efectividad</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', marginTop: '8px' }}>
            {summary.deliverySuccessRate.toFixed(1)}%
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Entrega sin bloqueos de spam</span>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Campañas Agendadas</span>
            <Calendar size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', marginTop: '8px' }}>
            {summary.totalScheduled}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{summary.completedScheduled} completadas / {summary.pendingScheduled} pendientes</span>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Categorías Creadas</span>
            <Tag size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#8b5cf6', marginTop: '8px' }}>
            {summary.totalCategories}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{summary.totalCategorizedGroups} grupos etiquetados</span>
        </div>
      </div>

      {/* Hourly Activity Bar Chart */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={18} color="#2563eb" /> Actividad de Envíos por Hora del Día (Mejores Horarios)
        </h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '140px', gap: '4px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
          {summary.activityByHour.map((item) => {
            const heightPct = maxHourCount > 0 ? (item.count / maxHourCount) * 100 : 0;
            return (
              <div key={item.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '18px',
                    height: `${Math.max(heightPct, 6)}%`,
                    background: item.count > 0 ? '#2563eb' : '#cbd5e1',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease',
                  }}
                  title={`${item.hour}: ${item.count} publicaciones`}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>
    </section>
  );
}
