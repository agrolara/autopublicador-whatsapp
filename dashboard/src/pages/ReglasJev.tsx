import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Save,
  RotateCcw,
  RefreshCw,
  Plus,
  X,
  Users,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Sliders,
  Bell,
  Radio,
} from 'lucide-react';
import {
  quilicuraApi,
  type QuilicuraReglasAlertas,
  type QuilicuraStatusResponse,
} from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../hooks/useToast';
import { PageHeader } from '../components/PageHeader';
import './ReglasJev.css';

const DEFAULT_REGLAS: QuilicuraReglasAlertas = {
  sensibilidadJev: 0.45,
  notificarPorWhatsApp: true,
  categorias: {
    ilicito: {
      nombre: '🚨 Ilícitos & Delitos Flagrantes',
      urgencia: 'critica',
      despachoInmediato: true,
      palabrasClave: [
        'encerrona',
        'portonazo',
        'asalto',
        'robo',
        'pistola',
        'arma',
        'cuchillo',
        'lanzazo',
        'chapa',
        'reventaron',
      ],
    },
    consumo_sustancias: {
      nombre: '🍺 Consumo de Sustancias & Merodeo',
      urgencia: 'media',
      despachoInmediato: true,
      palabrasClave: [
        'copete',
        'marihuana',
        'pito',
        'droga',
        'tomando en la plaza',
        'auto sospechoso',
        'mirando casas',
        'sin patente',
      ],
    },
    microbasural: {
      nombre: '🗑️ Microbasurales & Escombros',
      urgencia: 'media',
      despachoInmediato: false,
      palabrasClave: [
        'escombros',
        'botando basura',
        'vertedero',
        'colchones',
        'cachureos',
        'quebrada',
        'camion botando',
      ],
    },
    ruidos: {
      nombre: '🔊 Ruidos Molestos & Piques',
      urgencia: 'media',
      despachoInmediato: false,
      palabrasClave: [
        'piques',
        'carreras clandestinas',
        'musica fuerte',
        'parlantes',
        'fiesta clandestina',
      ],
    },
  },
};

export function ReglasJev() {
  useDocumentTitle('Reglas JEV Quilicura | OpenWA');
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingGroups, setSyncingGroups] = useState(false);
  const [status, setStatus] = useState<QuilicuraStatusResponse | null>(null);
  const [rules, setRules] = useState<QuilicuraReglasAlertas>(DEFAULT_REGLAS);
  const [newKeywordInput, setNewKeywordInput] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rulesRes, statusRes] = await Promise.all([
        quilicuraApi.getReglasAlertas().catch(() => null),
        quilicuraApi.getStatus().catch(() => null),
      ]);

      if (rulesRes && rulesRes.reglasAlertas && rulesRes.reglasAlertas.categorias) {
        setRules(rulesRes.reglasAlertas);
      }
      if (statusRes) {
        setStatus(statusRes);
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al cargar reglas JEV',
        message: err?.message || 'No se pudieron obtener las reglas de alertas',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Manejar adición de palabra clave a una categoría
  const handleAddKeyword = (catKey: string) => {
    const word = (newKeywordInput[catKey] || '').trim().toLowerCase();
    if (!word) return;

    setRules(prev => {
      const cat = prev.categorias[catKey];
      if (!cat) return prev;
      if (cat.palabrasClave.map(k => k.toLowerCase()).includes(word)) {
        addToast({ type: 'info', title: 'Palabra duplicada', message: `"${word}" ya está en la lista` });
        return prev;
      }
      return {
        ...prev,
        categorias: {
          ...prev.categorias,
          [catKey]: {
            ...cat,
            palabrasClave: [...cat.palabrasClave, word],
          },
        },
      };
    });

    setNewKeywordInput(prev => ({ ...prev, [catKey]: '' }));
  };

  // Manejar eliminación de palabra clave
  const handleRemoveKeyword = (catKey: string, wordToRemove: string) => {
    setRules(prev => {
      const cat = prev.categorias[catKey];
      if (!cat) return prev;
      return {
        ...prev,
        categorias: {
          ...prev.categorias,
          [catKey]: {
            ...cat,
            palabrasClave: cat.palabrasClave.filter(k => k !== wordToRemove),
          },
        },
      };
    });
  };

  // Guardar reglas JEV
  const handleSaveRules = async () => {
    try {
      setSaving(true);
      const res = await quilicuraApi.saveReglasAlertas(rules);
      if (res.exito) {
        addToast({
          type: res.syncedToTermometro ? 'success' : 'info',
          title: 'Reglas JEV guardadas',
          message: res.mensaje || 'Se actualizaron las reglas de alertas con éxito.',
        });
        loadData();
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al guardar',
        message: err?.message || 'No se pudieron guardar las reglas',
      });
    } finally {
      setSaving(false);
    }
  };

  // Sincronizar grupos de alcaldía
  const handleSyncGroups = async () => {
    try {
      setSyncingGroups(true);
      const res = await quilicuraApi.syncGruposAlcaldia();
      if (res.exito) {
        addToast({
          type: res.synced ? 'success' : 'info',
          title: 'Delegación de Grupos',
          message: res.mensaje,
        });
        loadData();
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al sincronizar grupos',
        message: err?.message || 'No se pudo contactar al servidor de Alcaldía',
      });
    } finally {
      setSyncingGroups(false);
    }
  };

  // Restaurar por defecto
  const handleRestoreDefaults = () => {
    if (window.confirm('¿Deseas restaurar las palabras clave y parámetros a los recomendados por defecto?')) {
      setRules(DEFAULT_REGLAS);
      addToast({ type: 'info', title: 'Valores restablecidos', message: 'Presiona "Guardar" para aplicar.' });
    }
  };

  const categoriesOrder = ['ilicito', 'consumo_sustancias', 'microbasural', 'ruidos'];

  return (
    <div className="reglas-jev-container">
      <PageHeader
        title="Reglas JEV Quilicura"
        subtitle="Gestión centralizada de palabras clave, umbrales de alerta y delegación de grupos para el Termómetro Comunal de la Alcaldía de Quilicura."
      />

      {/* Status Banner */}
      <div className="jev-status-banner">
        <div className="jev-status-left">
          <div className={`jev-status-indicator ${status?.online ? 'online' : 'offline'}`}>
            {status?.online ? <CheckCircle size={22} /> : <Radio size={22} />}
          </div>
          <div>
            <div className="jev-status-title">
              {status?.online
                ? 'Conexión Estable con Termómetro Comunal de Quilicura'
                : 'Modo Local OpenWA (Termómetro Comunal en espera)'}
            </div>
            <div className="jev-status-subtitle">
              <span>Endpoint: <code>{status?.url || 'http://localhost:3000'}</code></span>
              <span>•</span>
              <span>
                Grupos delegados en <strong>"alcaldia"</strong>: <strong>{status?.gruposAlcaldiaCount || 0} grupos</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="jev-status-actions">
          <button
            type="button"
            className="jev-btn jev-btn-secondary"
            onClick={loadData}
            disabled={loading}
            title="Recargar estado y reglas"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Actualizar
          </button>

          <button
            type="button"
            className="jev-btn jev-btn-primary"
            onClick={handleSyncGroups}
            disabled={syncingGroups}
          >
            {syncingGroups ? <Loader2 size={15} className="spin" /> : <Users size={15} />}
            Sincronizar Grupos Alcaldía ({status?.gruposAlcaldiaCount || 0})
          </button>
        </div>
      </div>

      {/* Global JEV Settings Card */}
      <div className="jev-global-settings">
        <div className="jev-setting-item">
          <div className="jev-setting-label">
            <span>Sensibilidad JEV ({rules.sensibilidadJev.toFixed(2)})</span>
            <Sliders size={16} color="#0284c7" />
          </div>
          <p className="jev-setting-desc">
            Umbral mínimo de similitud semántica y coincidencia de palabras clave para disparar una alerta comunal.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
            <input
              type="range"
              min="0.10"
              max="1.00"
              step="0.05"
              value={rules.sensibilidadJev}
              onChange={e =>
                setRules(prev => ({
                  ...prev,
                  sensibilidadJev: parseFloat(e.target.value),
                }))
              }
              style={{ flex: 1, accentColor: '#0284c7', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', width: '38px', textAlign: 'right' }}>
              {rules.sensibilidadJev.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="jev-setting-item">
          <div className="jev-setting-label">
            <span>Notificaciones Inmediatas por WhatsApp</span>
            <Bell size={16} color="#0284c7" />
          </div>
          <p className="jev-setting-desc">
            Envía avisos instantáneos al equipo de guardia municipal cuando se detecta un incidente en los grupos de Alcaldía.
          </p>
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
              <input
                type="checkbox"
                checked={rules.notificarPorWhatsApp}
                onChange={e =>
                  setRules(prev => ({
                    ...prev,
                    notificarPorWhatsApp: e.target.checked,
                  }))
                }
                style={{ width: '18px', height: '18px', accentColor: '#0284c7' }}
              />
              <span>{rules.notificarPorWhatsApp ? 'Activado (Alertas enviadas a WhatsApp)' : 'Desactivado (Solo registro en dashboard)'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="jev-categories-grid">
        {categoriesOrder.map(catKey => {
          const cat = rules.categorias[catKey];
          if (!cat) return null;

          return (
            <div key={catKey} className="jev-card">
              <div className="jev-card-header">
                <div>
                  <h3 className="jev-card-title">{cat.nombre}</h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {cat.palabrasClave.length} palabras clave configuradas
                  </div>
                </div>

                <div className="jev-badges-row">
                  <span className={`jev-badge ${cat.urgencia}`}>
                    {cat.urgencia}
                  </span>
                  <span className={`jev-badge ${cat.despachoInmediato ? 'inmediato' : 'reporte'}`}>
                    {cat.despachoInmediato ? 'Despacho Inmediato' : 'Reporte Acumulado'}
                  </span>
                </div>
              </div>

              {/* Keywords Container */}
              <div className="jev-keywords-wrap">
                {cat.palabrasClave.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 'auto' }}>
                    Sin palabras clave configuradas.
                  </div>
                ) : (
                  cat.palabrasClave.map(word => (
                    <span key={word} className="jev-keyword-chip">
                      <span>{word}</span>
                      <button
                        type="button"
                        className="jev-keyword-remove"
                        onClick={() => handleRemoveKeyword(catKey, word)}
                        title={`Eliminar "${word}"`}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add Keyword Input */}
              <div className="jev-add-keyword-row">
                <input
                  type="text"
                  className="jev-input"
                  placeholder="Agregar palabra o frase..."
                  value={newKeywordInput[catKey] || ''}
                  onChange={e =>
                    setNewKeywordInput(prev => ({
                      ...prev,
                      [catKey]: e.target.value,
                    }))
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword(catKey);
                    }
                  }}
                />
                <button
                  type="button"
                  className="jev-add-btn"
                  onClick={() => handleAddKeyword(catKey)}
                  title="Añadir palabra clave"
                >
                  <Plus size={16} />
                  Añadir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="jev-footer-actions">
        <button
          type="button"
          className="jev-btn jev-btn-secondary"
          onClick={handleRestoreDefaults}
          disabled={saving}
        >
          <RotateCcw size={16} />
          Restaurar Valores Recomendados
        </button>

        <button
          type="button"
          className="jev-btn jev-btn-primary"
          onClick={handleSaveRules}
          disabled={saving}
          style={{ minWidth: '180px', justifyContent: 'center' }}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="spin" /> Guardando...
            </>
          ) : (
            <>
              <Save size={16} /> Guardar Reglas JEV
            </>
          )}
        </button>
      </div>
    </div>
  );
}
