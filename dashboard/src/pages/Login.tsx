import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Languages, Smartphone, KeyRound, AlertTriangle, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
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
  const [loginMode, setLoginMode] = useState<'otp' | 'password'>('password');
  
  // Password / API Key form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // OTP form state
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSuccessMessage, setOtpSuccessMessage] = useState('');

  // Generic state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedDetails, setSuspendedDetails] = useState('');

  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  // OTP Countdown timer
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

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

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (!cleanDigits || cleanDigits.length < 8) {
      setError('Por favor ingresa un número de teléfono válido (ej: 56912345678)');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsSuspended(false);

    try {
      const res = await authApi.requestOtp({ phone: cleanDigits });
      setOtpSent(true);
      setOtpCountdown(res.expiresInSeconds || 300);
      setOtpSuccessMessage(res.message || 'Código enviado a tu WhatsApp');
    } catch (err: any) {
      const msg = err.message || 'Error solicitando código OTP';
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpCode.replace(/[^0-9]/g, '').trim();
    if (!cleanCode || cleanCode.length < 4) {
      setError('Por favor ingresa el código numérico recibido por WhatsApp');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsSuspended(false);

    try {
      const cleanDigits = phone.replace(/[^0-9]/g, '');
      const res = await authApi.verifyOtp({ phone: cleanDigits, code: cleanCode });
      if (res && res.token) {
        onLogin(res.token);
      } else {
        setError('Respuesta de verificación inválida');
      }
    } catch (err: any) {
      const msg = err.message || 'Error verificando código';
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

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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

        {/* Login Method Tabs */}
        <div className="login-mode-tabs">
          <button
            type="button"
            className={`login-tab-btn ${loginMode === 'password' ? 'active' : ''}`}
            onClick={() => {
              setLoginMode('password');
              setError('');
            }}
          >
            <KeyRound size={16} />
            <span>Contraseña</span>
          </button>
          <button
            type="button"
            className={`login-tab-btn ${loginMode === 'otp' ? 'active' : ''}`}
            onClick={() => {
              setLoginMode('otp');
              setError('');
            }}
          >
            <Smartphone size={16} />
            <span>WhatsApp OTP</span>
          </button>
        </div>

        {/* Tab 1: Password / API Key Login */}
        {loginMode === 'password' && (
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
        )}

        {/* Tab 2: WhatsApp OTP Login */}
        {loginMode === 'otp' && (
          <div className="login-form">
            {!otpSent ? (
              <form onSubmit={handleRequestOtp}>
                <div className="input-group">
                  <label htmlFor="phone">Número de WhatsApp Registrado</label>
                  <div className="input-wrapper">
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="ej: 56912345678 o +56 9 8765 4321"
                      className={error ? 'error' : ''}
                      autoFocus
                    />
                  </div>
                  <span className="input-hint">Te enviaremos un código de seguridad de 6 dígitos por WhatsApp.</span>
                  {error && <span className="error-message">{error}</span>}
                </div>

                <button type="submit" className="connect-btn" disabled={isLoading}>
                  {isLoading ? 'Enviando código...' : '📲 Enviar Código por WhatsApp'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <div className="otp-sent-banner">
                  <CheckCircle2 size={18} />
                  <span>{otpSuccessMessage}</span>
                </div>

                <div className="input-group">
                  <div className="otp-header-row">
                    <label htmlFor="otpCode">Código de 6 dígitos</label>
                    <button
                      type="button"
                      className="change-phone-link"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode('');
                        setError('');
                      }}
                    >
                      <ArrowLeft size={14} /> Cambiar número
                    </button>
                  </div>

                  <div className="input-wrapper">
                    <input
                      id="otpCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="••••••"
                      className={`otp-digit-input ${error ? 'error' : ''}`}
                      autoFocus
                    />
                  </div>

                  <div className="otp-footer-row">
                    {otpCountdown > 0 ? (
                      <span className="otp-timer">Expira en {formatCountdown(otpCountdown)}</span>
                    ) : (
                      <span className="otp-expired">Código expirado</span>
                    )}

                    <button
                      type="button"
                      className="resend-otp-btn"
                      disabled={isLoading || otpCountdown > 240}
                      onClick={handleRequestOtp}
                    >
                      <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                      <span>Reenviar</span>
                    </button>
                  </div>

                  {error && <span className="error-message">{error}</span>}
                </div>

                <button type="submit" className="connect-btn" disabled={isLoading || !otpCode.trim()}>
                  {isLoading ? 'Verificando...' : '✨ Verificar e Ingresar'}
                </button>
              </form>
            )}
          </div>
        )}

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
