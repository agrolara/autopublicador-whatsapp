import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Languages,
  AlertTriangle,
  KeyRound,
  Users,
  Radio,
  Zap,
  Bot,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';
import { languageOptions, resolveSupportedLanguage, type SupportedLanguage } from '../i18n';
import { authApi } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (apiKey: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const { t, i18n } = useTranslation();

  // Mode: 'admin' (only password) vs 'client' (identifier + password)
  const [loginRole, setLoginRole] = useState<'admin' | 'client'>('admin');

  // Form states
  const [adminPassword, setAdminPassword] = useState('');
  const [clientIdentifier, setClientIdentifier] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedDetails, setSuspendedDetails] = useState('');

  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setError('Por favor ingresa tu contraseña de administrador');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsSuspended(false);

    try {
      const res = await authApi.loginWithPassword({
        usernameOrPhone: 'admin',
        password: adminPassword.trim(),
      });

      if (res && res.token) {
        onLogin(res.token);
      } else {
        setError('Respuesta de autenticación inválida');
      }
    } catch (err: any) {
      const msg = err.message || 'Error de conexión con el servidor';
      if (msg.includes('CUENTA_SUSPENDIDA_PAGO_PENDIENTE') || err.status === 403) {
        setIsSuspended(true);
        setSuspendedDetails(msg.replace('CUENTA_SUSPENDIDA_PAGO_PENDIENTE:', '').trim());
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientIdentifier.trim()) {
      setError('Por favor ingresa tu usuario, teléfono o API Key');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsSuspended(false);

    try {
      const res = await authApi.loginWithPassword({
        usernameOrPhone: clientIdentifier.trim(),
        password: clientPassword ? clientPassword.trim() : clientIdentifier.trim(),
      });

      if (res && res.token) {
        onLogin(res.token);
      } else {
        setError('Respuesta de autenticación inválida');
      }
    } catch (err: any) {
      const msg = err.message || 'Error de conexión con el servidor';
      if (msg.includes('CUENTA_SUSPENDIDA_PAGO_PENDIENTE') || err.status === 403) {
        setIsSuspended(true);
        setSuspendedDetails(msg.replace('CUENTA_SUSPENDIDA_PAGO_PENDIENTE:', '').trim());
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        {/* Panel izquierdo: Presentación corporativa personalizada */}
        <section className="login-brand-panel" aria-label="Información de la plataforma">
          <div className="brand-badge">
            <span className="badge-dot"></span>
            <span>AgroLara & Danmax • Enterprise Suite</span>
          </div>

          <h1 className="brand-title">
            Autopublicador <span>WhatsApp Pro</span>
          </h1>

          <p className="brand-subtitle">
            Plataforma avanzada de difusión masiva, captación de leads en grupos de WhatsApp y asistentes autónomos con Inteligencia Artificial.
          </p>

          <div className="brand-features-grid">
            <div className="brand-feature-card">
              <div className="feature-icon-box green">
                <Radio size={20} />
              </div>
              <div className="feature-text">
                <h3>Radar de Grupos & Leads</h3>
                <p>Prospección y detección activa de clientes interesados en grupos en tiempo real.</p>
              </div>
            </div>

            <div className="brand-feature-card">
              <div className="feature-icon-box cyan">
                <Zap size={20} />
              </div>
              <div className="feature-text">
                <h3>Autopublicación Multi-Línea</h3>
                <p>Difusión programada y rotativa con protección anti-baneo y catálogo multimedia.</p>
              </div>
            </div>

            <div className="brand-feature-card">
              <div className="feature-icon-box purple">
                <Bot size={20} />
              </div>
              <div className="feature-text">
                <h3>Agente Autónomo IA</h3>
                <p>Respuestas y cotizaciones automáticas con derivación inteligente a asesores humanos.</p>
              </div>
            </div>

            <div className="brand-feature-card">
              <div className="feature-icon-box emerald">
                <ShieldCheck size={20} />
              </div>
              <div className="feature-text">
                <h3>Seguridad & Alta Disponibilidad</h3>
                <p>Aislamiento total por sesión, rate limiting avanzado y cifrado extremo a extremo.</p>
              </div>
            </div>
          </div>

          <div className="brand-footer-pill">
            <CheckCircle2 size={16} className="pill-check-icon" />
            <span>Servidor Operativo y Protegido</span>
          </div>
        </section>

        {/* Panel derecho: Formulario de inicio de sesión refinado */}
        <div className="login-card-panel">
          <div className="login-card">
            <div className="login-logo">
              <img src="/botwa_icon.webp" alt="Danmax AI WA" className="logo-icon" />
              <span className="version-info">
                {t('login.version', {
                  version: __APP_VERSION__,
                  date: new Date(__BUILD_TIME__).toISOString().slice(0, 10).replace(/-/g, ''),
                })}
              </span>
            </div>

            <div className="login-language">
              <Languages size={18} />
              <CustomSelect
                value={currentLang}
                onChange={value => changeLanguage(value as SupportedLanguage)}
                options={languageOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                ariaLabel={t('common.language')}
              />
            </div>

            {/* Selector de Rol: Administrador (por defecto) o Clientes */}
            <div className="login-role-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={loginRole === 'admin'}
                className={`login-role-tab ${loginRole === 'admin' ? 'active' : ''}`}
                onClick={() => {
                  setLoginRole('admin');
                  setError('');
                }}
              >
                <KeyRound size={16} />
                <span>Administrador</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginRole === 'client'}
                className={`login-role-tab ${loginRole === 'client' ? 'active' : ''}`}
                onClick={() => {
                  setLoginRole('client');
                  setError('');
                }}
              >
                <Users size={16} />
                <span>Clientes</span>
              </button>
            </div>

            {/* Suspended Account Alert Banner */}
            {isSuspended && (
              <div className="suspended-alert-card">
                <div className="suspended-header">
                  <AlertTriangle size={24} className="suspended-icon" />
                  <h3>Cuenta Suspendida por Pago Pendiente</h3>
                </div>
                <p className="suspended-text">
                  {suspendedDetails ||
                    'Tu acceso se encuentra suspendido debido a una mensualidad pendiente. Por favor regulariza tu pago con el administrador para reactivar tu cuenta y reanudar tus campañas.'}
                </p>
                <div className="suspended-contact-info">
                  <span>Contacta a soporte o al administrador de la plataforma para reactivación inmediata.</span>
                </div>
              </div>
            )}

            {/* Formulario Administrador: Solo solicita Contraseña */}
            {loginRole === 'admin' && (
              <form onSubmit={handleAdminSubmit} className="login-form">
                <div className="role-guide-text">
                  <span className="guide-title">Acceso de Administrador</span>
                  <span className="guide-subtitle">Ingresa tu contraseña para acceder a la gestión completa.</span>
                </div>

                <div className="input-group">
                  <label htmlFor="adminPassword">Contraseña</label>
                  <div className="input-wrapper">
                    <input
                      id="adminPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="Tu contraseña personal"
                      className={error ? 'error' : ''}
                      autoComplete="current-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="toggle-visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {error && <span className="error-message">{error}</span>}
                </div>

                <button type="submit" className="connect-btn" disabled={isLoading}>
                  {isLoading ? t('login.connecting') : 'Iniciar Sesión'}
                </button>
              </form>
            )}

            {/* Formulario Clientes: Usuario/Teléfono + Contraseña opcional si usa API Key */}
            {loginRole === 'client' && (
              <form onSubmit={handleClientSubmit} className="login-form">
                <div className="role-guide-text">
                  <span className="guide-title">Acceso de Clientes</span>
                  <span className="guide-subtitle">Ingresa con tu usuario, teléfono o API Key asignada.</span>
                </div>

                <div className="input-group">
                  <label htmlFor="clientIdentifier">Usuario, Teléfono o API Key</label>
                  <div className="input-wrapper">
                    <input
                      id="clientIdentifier"
                      type="text"
                      value={clientIdentifier}
                      onChange={e => setClientIdentifier(e.target.value)}
                      placeholder="ej: cliente1, +56912345678 o API Key"
                      className={error ? 'error' : ''}
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="clientPassword">Contraseña (Opcional si usas API Key)</label>
                  <div className="input-wrapper">
                    <input
                      id="clientPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={clientPassword}
                      onChange={e => setClientPassword(e.target.value)}
                      placeholder="Tu contraseña personal"
                      className={error ? 'error' : ''}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="toggle-visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {error && <span className="error-message">{error}</span>}
                </div>

                <button type="submit" className="connect-btn" disabled={isLoading}>
                  {isLoading ? t('login.connecting') : 'Iniciar Sesión'}
                </button>
              </form>
            )}

            <footer className="login-footer">
              <span>Construido por Mauricio Lara con amor a sus clientes ❤️</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
