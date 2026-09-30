import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Languages, AlertTriangle } from 'lucide-react';
import { GithubIcon } from '../components/GithubIcon';
import { CustomSelect } from '../components/CustomSelect';
import { languageOptions, resolveSupportedLanguage, type SupportedLanguage } from '../i18n';
import { authApi } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (apiKey: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const { t, i18n } = useTranslation();

  // Password / API Key form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Generic state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedDetails, setSuspendedDetails] = useState('');

  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Por favor ingresa tu usuario, teléfono o API Key');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsSuspended(false);

    try {
      // If user provided only an identifier and no password, it could be a direct API Key
      const res = await authApi.loginWithPassword({
        usernameOrPhone: identifier.trim(),
        password: password ? password.trim() : identifier.trim(),
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
      <div className="login-card">
        <div className="login-logo">
          <img src="/openwa_logo.webp" alt="OpenWA" className="logo-icon" />
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

        {/* Password / API Key Login Form */}
        <form onSubmit={handlePasswordSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="identifier">Usuario, Teléfono o API Key</label>
            <div className="input-wrapper">
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="ej: cliente1, +56912345678 o API Key"
                className={error ? 'error' : ''}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Contraseña (Opcional si usas API Key)</label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
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

        <p className="login-help">
          {t('login.help')}{' '}
          <a href="https://docs.open-wa.org" target="_blank" rel="noopener noreferrer">
            {t('login.viewDocs')}
          </a>
        </p>
      </div>

      <footer className="login-footer">
        <span>{t('login.footer')}</span>
        <a
          href="https://github.com/rmyndharis/OpenWA"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="GitHub"
        >
          <GithubIcon size={18} />
        </a>
      </footer>
    </div>
  );
}
