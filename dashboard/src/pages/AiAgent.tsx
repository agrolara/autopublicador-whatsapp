import React, { useState, useEffect } from 'react';
import {
  Bot,
  Power,
  Key,
  Cpu,
  Sparkles,
  ShieldCheck,
  Clock,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  HelpCircle,
  MessageSquare,
  Flame,
  Mic,
} from 'lucide-react';
import { sessionApi, aiAgentApi } from '../services/api';
import type {
  Session,
  SessionAiConfig,
  AiProvider,
  UpdateAiConfigPayload,
} from '../services/api';
import './AiAgent.css';

const PRESET_PROMPTS = {
  pizzeria: `Eres el asistente virtual inteligente de Pizzería La Mascada en Chile. 
Tu labor es atender amablemente a los clientes en WhatsApp, resolver dudas y ayudarles a pedir.

🍕 NUESTRO MENÚ:
- Pizza Familiar (8 porciones): Pepperoni, Napolitana, Mechada BBQ, Cuatro Quesos ($11.990).
- Pizza Mediana (6 porciones): $8.990.
- Empanadas de Horno: Pino carne picada, Queso camarón ($2.500 c/u).
- Bebidas 1.5L: Coca-Cola, Sprite, Fanta ($2.200).

🛵 CONDICIONES DE ENTREGA:
- Horario de atención: Martes a Domingo de 18:00 a 23:30 hrs (Lunes cerrado).
- Delivery: $1.500 dentro de la comuna. Gratis por compras sobre $20.000.
- Medios de pago: Transferencia bancaria o efectivo al repartidor.

REGLAS DE ATENCIÓN:
1. Sé cordial, usa un tono cercano y chileno educado.
2. Si el cliente quiere hacer un pedido, pídele su dirección exacta y los productos elegidos.
3. Si te preguntan algo fuera del menú o un reclamo, pide que espere un momento para que un humano lo atienda.`,

  ventas: `Eres el asesor comercial virtual de nuestra tienda de ventas online.
Tu objetivo es responder dudas sobre productos, precios, stock y envíos de manera ágil y profesional.

📦 INFORMACIÓN DEL NEGOCIO:
- Catálogo: Ropa, tecnología y accesorios para el hogar.
- Métodos de pago: Transferencia electrónica y Webpay (tarjetas de crédito/débito).
- Despachos: A todo Chile mediante Starken, Chilexpress y Blue Express en 24 a 48 horas hábiles.
- Retiro en tienda: Disponible de Lunes a Viernes de 09:30 a 18:30 hrs.

REGLAS DE ATENCIÓN:
1. Responde de forma precisa, clara y entusiasta.
2. Invita al cliente a concretar su compra o pregúntale qué producto específico busca.
3. No inventes precios ni productos que no figuren en las instrucciones.`,

  soporte: `Eres el asistente de soporte y atención al cliente.
Tu función es orientar a los usuarios, responder preguntas frecuentes y recopilar antecedentes del caso antes de derivar a un ejecutivo.

🕒 HORARIOS Y DATOS:
- Atención ejecutivos humanos: Lunes a Viernes de 09:00 a 18:00 hrs.
- Preguntas frecuentes: Facturación, seguimiento de servicios y consultas técnicas básicas.

REGLAS DE ATENCIÓN:
1. Saluda con amabilidad y solicita el nombre y número de pedido o RUT del cliente si corresponde.
2. Responde con empatía y claridad.
3. Informa al cliente que su requerimiento está siendo registrado para seguimiento.`,
};

const SUGGESTED_MODELS: Record<AiProvider, string[]> = {
  openrouter: [
    'deepseek/deepseek-chat',
    'anthropic/claude-3.5-sonnet',
    'meta-llama/llama-3.3-70b-instruct',
    'openai/gpt-4o-mini',
  ],
  gemini: [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
  ],
  custom: [
    'llama-3.3-70b-versatile',
    'deepseek-chat',
    'mistral-large-latest',
  ],
};

export function AiAgent() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState<boolean>(false);
  const [provider, setProvider] = useState<AiProvider>('openrouter');
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [model, setModel] = useState<string>('deepseek/deepseek-chat');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(400);
  const [humanTakeoverMinutes, setHumanTakeoverMinutes] = useState<number>(30);
  const [debounceSeconds, setDebounceSeconds] = useState<number>(3);
  const [transcribeAudio, setTranscribeAudio] = useState<boolean>(false);
  const [groqApiKey, setGroqApiKey] = useState<string>('');
  const [showGroqApiKey, setShowGroqApiKey] = useState<boolean>(false);
  const [whisperModel, setWhisperModel] = useState<string>('whisper-large-v3-turbo');

  // Test playground state
  const [testUserMessage, setTestUserMessage] = useState<string>('Hola, ¿qué servicios o productos tienen disponibles?');
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testing, setTesting] = useState<boolean>(false);
  const [testDuration, setTestDuration] = useState<number | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Load active sessions
  useEffect(() => {
    async function loadSessions() {
      try {
        setLoading(true);
        const data = await sessionApi.list();
        setSessions(data);
        if (data.length > 0) {
          setSelectedSessionId(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar sesiones');
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, []);

  // Load config for selected session
  useEffect(() => {
    if (!selectedSessionId) return;

    async function loadConfig() {
      try {
        setLoading(true);
        setError(null);
        setTestReply(null);
        setTestError(null);
        const config = await aiAgentApi.getConfig(selectedSessionId);
        setEnabled(config.enabled ?? false);
        setProvider(config.provider || 'openrouter');
        setApiKey(config.apiKey || '');
        setModel(config.model || 'deepseek/deepseek-chat');
        setBaseUrl(config.baseUrl || '');
        setSystemPrompt(config.systemPrompt || '');
        setTemperature(config.temperature ?? 0.7);
        setMaxTokens(config.maxTokens ?? 400);
        setHumanTakeoverMinutes(config.humanTakeoverMinutes ?? 30);
        setDebounceSeconds(config.debounceSeconds ?? 3);
        setTranscribeAudio(config.transcribeAudio ?? false);
        setGroqApiKey(config.groqApiKey || '');
        setWhisperModel(config.whisperModel || 'whisper-large-v3-turbo');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar configuración de IA');
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [selectedSessionId]);

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    const defaults = SUGGESTED_MODELS[newProvider];
    if (defaults && defaults.length > 0) {
      setModel(defaults[0]);
    }
    if (newProvider === 'gemini' && !baseUrl) {
      setBaseUrl('');
    }
  };

  const handleSave = async () => {
    if (!selectedSessionId) return;
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

      const payload: UpdateAiConfigPayload = {
        enabled,
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        baseUrl: baseUrl.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
        temperature,
        maxTokens,
        humanTakeoverMinutes,
        debounceSeconds,
        transcribeAudio,
        groqApiKey: groqApiKey.trim() || undefined,
        whisperModel: whisperModel.trim(),
      };

      await aiAgentApi.updateConfig(selectedSessionId, payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrompt = async () => {
    if (!apiKey.trim()) {
      setTestError('Por favor ingresa una API Key para probar el modelo');
      return;
    }
    if (!systemPrompt.trim()) {
      setTestError('Por favor ingresa el contexto o prompt del negocio');
      return;
    }
    if (!testUserMessage.trim()) {
      setTestError('Por favor ingresa un mensaje de prueba');
      return;
    }

    try {
      setTesting(true);
      setTestError(null);
      setTestReply(null);

      const res = await aiAgentApi.testPrompt(selectedSessionId, {
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        baseUrl: baseUrl.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
        userMessage: testUserMessage.trim(),
        temperature,
        maxTokens,
      });

      setTestReply(res.reply);
      setTestDuration(res.durationMs);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Error al invocar IA de prueba');
    } finally {
      setTesting(false);
    }
  };

  const currentSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <div className="ai-agent-container">
      {/* Header */}
      <div className="ai-header">
        <div className="ai-header-left">
          <div className="ai-icon-badge">
            <Bot size={28} />
          </div>
          <div>
            <h1>Asistente de Inteligencia Artificial</h1>
            <p className="ai-subtitle">
              Configura un agente conversacional autónomo por cada sesión de WhatsApp, con reglas de privacidad estrictas y múltiples proveedores de IA.
            </p>
          </div>
        </div>

        {/* Session Selector */}
        <div className="session-selector-card">
          <label className="selector-label">Sesión de WhatsApp:</label>
          <select
            value={selectedSessionId}
            onChange={e => setSelectedSessionId(e.target.value)}
            className="session-select"
            disabled={loading || sessions.length === 0}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                📱 {s.name} ({s.phone || 'Sin número'}) — {s.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="ai-banner error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="ai-banner success">
          <CheckCircle2 size={20} />
          <span>Configuración de Inteligencia Artificial guardada correctamente.</span>
        </div>
      )}

      <div className="ai-grid">
        {/* Left Column: Configuration Form */}
        <div className="ai-col main-config">
          {/* Master Switch Card */}
          <div className={`master-switch-card ${enabled ? 'active' : 'inactive'}`}>
            <div className="switch-info">
              <div className="switch-icon">
                <Power size={24} />
              </div>
              <div>
                <h3>{enabled ? '🟢 Inteligencia Artificial ACTIVADA' : '⚪ Inteligencia Artificial APAGADA'}</h3>
                <p>
                  {enabled
                    ? `El agente responderá automáticamente los mensajes PRIVADOS que lleguen a "${currentSession?.name || 'esta sesión'}".`
                    : `La IA está apagada para "${currentSession?.name || 'esta sesión'}". Ningún mensaje será respondido de forma automática.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              className={`toggle-btn ${enabled ? 'on' : 'off'}`}
              onClick={() => setEnabled(!enabled)}
            >
              {enabled ? 'ENCENDIDO' : 'APAGADO'}
            </button>
          </div>

          {/* Strict Rules Banner */}
          <div className="strict-rules-card">
            <div className="rules-header">
              <ShieldCheck size={20} className="text-emerald" />
              <h4>Reglas Inviolables de Privacidad y Seguridad</h4>
            </div>
            <div className="rules-grid">
              <div className="rule-item">
                <span className="rule-badge">🔒 Privado 1:1</span>
                <span>Solo responde mensajes privados individuales.</span>
              </div>
              <div className="rule-item">
                <span className="rule-badge danger">🚫 Grupos Bloqueados</span>
                <span>Jamás responde en grupos de WhatsApp ni estados.</span>
              </div>
              <div className="rule-item">
                <span className="rule-badge">⏱️ Human Takeover</span>
                <span>Si respondes manualmente, la IA se silencia temporalmente.</span>
              </div>
              <div className="rule-item">
                <span className="rule-badge">⚡ Agrupador Ráfagas</span>
                <span>Espera mensajes seguidos para responder todo en un solo envío.</span>
              </div>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="config-section">
            <label className="section-title">
              <Cpu size={18} />
              Proveedor de Inteligencia Artificial
            </label>

            <div className="providers-grid">
              <div
                className={`provider-card ${provider === 'openrouter' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('openrouter')}
              >
                <div className="provider-badge rec">Recomendado</div>
                <div className="provider-name">OpenRouter</div>
                <div className="provider-desc">1 API Key para DeepSeek R1/V3, Claude 3.5, Llama 3.3 y GPT</div>
              </div>

              <div
                className={`provider-card ${provider === 'gemini' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('gemini')}
              >
                <div className="provider-badge fast">Capa Gratuita / Rápido</div>
                <div className="provider-name">Google Gemini</div>
                <div className="provider-desc">Gemini 2.0 Flash y 1.5 Flash desde Google AI Studio</div>
              </div>

              <div
                className={`provider-card ${provider === 'openai' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('openai')}
              >
                <div className="provider-name">OpenAI</div>
                <div className="provider-desc">GPT-4o Mini y GPT-4o oficial</div>
              </div>

              <div
                className={`provider-card ${provider === 'custom' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('custom')}
              >
                <div className="provider-name">Personalizado / Compatible</div>
                <div className="provider-desc">Groq, Ollama o cualquier API compatible con OpenAI</div>
              </div>
            </div>

            {/* API Key Input */}
            <div className="form-group mt-3">
              <label className="input-label">
                <Key size={16} />
                API Key del Proveedor ({provider.toUpperCase()}):
              </label>
              <div className="input-with-action">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="text-input"
                  placeholder={`Ingresa tu API Key de ${provider}...`}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? 'Ocultar clave' : 'Mostrar clave'}
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Model Input & Suggestions */}
            <div className="form-group mt-3">
              <label className="input-label">
                <Sparkles size={16} />
                Modelo a utilizar:
              </label>
              <input
                type="text"
                className="text-input"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Identificador del modelo (ej. deepseek/deepseek-chat)"
              />
              <div className="model-suggestions">
                <span className="sugg-label">Sugeridos:</span>
                {SUGGESTED_MODELS[provider]?.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`model-tag ${model === m ? 'active' : ''}`}
                    onClick={() => setModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {provider === 'custom' && (
              <div className="form-group mt-3">
                <label className="input-label">Base URL (Endpoint compatible con OpenAI):</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="https://api.groq.com/openai/v1"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* System Prompt Context */}
          <div className="config-section mt-4">
            <div className="section-title-between">
              <label className="section-title">
                <MessageSquare size={18} />
                Contexto del Servicio y Prompt del Negocio
              </label>
              <div className="preset-buttons">
                <span className="preset-label">Cargar plantilla:</span>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => setSystemPrompt(PRESET_PROMPTS.pizzeria)}
                >
                  🍕 Pizzería
                </button>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => setSystemPrompt(PRESET_PROMPTS.ventas)}
                >
                  🛍️ Ventas Online
                </button>
                <button
                  type="button"
                  className="preset-btn"
                  onClick={() => setSystemPrompt(PRESET_PROMPTS.soporte)}
                >
                  💼 Soporte
                </button>
              </div>
            </div>
            <textarea
              className="prompt-textarea"
              rows={11}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="Escribe aquí las instrucciones de tu negocio: menú, precios, servicios, horarios, forma de atender y políticas de entrega..."
            />
            <div className="prompt-footer">
              <span>Caracteres: {systemPrompt.length}</span>
              <span className="text-muted">
                La IA recordará los últimos 8 mensajes del chat para mantener el hilo de la conversación.
              </span>
            </div>
          </div>

          {/* Safety & Timing Controls */}
          <div className="config-section mt-4">
            <label className="section-title">
              <Clock size={18} />
              Controles de Intervención y Tiempos
            </label>

            <div className="settings-columns">
              <div className="setting-box">
                <label className="input-label">Pausa si un humano responde (Human Takeover):</label>
                <select
                  className="text-input"
                  value={humanTakeoverMinutes}
                  onChange={e => setHumanTakeoverMinutes(Number(e.target.value))}
                >
                  <option value={15}>15 minutos de silencio</option>
                  <option value={30}>30 minutos de silencio (Recomendado)</option>
                  <option value={60}>1 hora de silencio</option>
                  <option value={120}>2 horas de silencio</option>
                  <option value={1440}>24 horas de silencio</option>
                  <option value={0}>Sin pausa (Siempre responde)</option>
                </select>
                <span className="setting-hint">
                  Si escribes desde tu teléfono en ese chat, el bot no interrumpirá la charla durante este tiempo.
                </span>
              </div>

              <div className="setting-box">
                <label className="input-label">Agrupar ráfagas de mensajes (Debounce):</label>
                <select
                  className="text-input"
                  value={debounceSeconds}
                  onChange={e => setDebounceSeconds(Number(e.target.value))}
                >
                  <option value={2}>2 segundos</option>
                  <option value={3}>3 segundos (Recomendado)</option>
                  <option value={5}>5 segundos</option>
                </select>
                <span className="setting-hint">
                  Si el cliente envía varios mensajes seguidos, se agrupan en uno solo antes de llamar a la IA.
                </span>
              </div>
            </div>
          </div>

          {/* Voice Notes Audio Transcription (Groq Whisper) */}
          <div className="config-section mt-4 audio-transcription-section">
            <div className="section-title-between">
              <label className="section-title">
                <Mic size={18} />
                Transcripción de Notas de Voz (Groq Whisper)
              </label>
              <div className="toggle-wrapper">
                <span className={`toggle-label-text ${transcribeAudio ? 'active' : ''}`}>
                  {transcribeAudio ? '🎙️ Transcripción Activada' : '⚪ Transcripción Apagada'}
                </span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={transcribeAudio}
                    onChange={e => setTranscribeAudio(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>

            <p className="audio-transcription-description">
              Permite que la IA escuche las notas de voz de WhatsApp (.ogg / opus) de los clientes, las transcriba a texto en ~300 ms con <strong>Groq Whisper</strong> y responda automáticamente según tu negocio.
            </p>

            <div className="audio-cards-grid">
              <div className="form-group mt-2">
                <label className="input-label" style={{ display: 'flex', alignItems: 'center' }}>
                  <Key size={16} />
                  <span>Groq API Key:</span>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="groq-link"
                  >
                    Obtener clave gratis en Groq ↗
                  </a>
                </label>
                <div className="input-with-action">
                  <input
                    type={showGroqApiKey ? 'text' : 'password'}
                    className="text-input"
                    placeholder="gsk_..."
                    value={groqApiKey}
                    onChange={e => setGroqApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setShowGroqApiKey(!showGroqApiKey)}
                    title={showGroqApiKey ? 'Ocultar clave' : 'Mostrar clave'}
                  >
                    {showGroqApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group mt-2">
                <label className="input-label">
                  <Cpu size={16} />
                  Modelo Whisper:
                </label>
                <select
                  className="text-input"
                  value={whisperModel}
                  onChange={e => setWhisperModel(e.target.value)}
                >
                  <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (~250 ms, Ultra rápido)</option>
                  <option value="whisper-large-v3">whisper-large-v3 (~400 ms, Máxima precisión)</option>
                </select>
              </div>
            </div>

            <div className="groq-free-tier-badge mt-3">
              <Sparkles size={16} />
              <span>
                <strong>Capa Gratuita de Groq:</strong> Hasta <strong>2.000 notas de voz al día</strong> y 2 horas de audio por hora sin tarjeta de crédito.
              </span>
            </div>
          </div>

          {/* Action Bar */}
          <div className="action-bar mt-4">
            <button
              type="button"
              className="save-btn"
              onClick={handleSave}
              disabled={saving || !selectedSessionId}
            >
              <Save size={20} />
              {saving ? 'Guardando configuración...' : 'Guardar Configuración de IA'}
            </button>
          </div>
        </div>

        {/* Right Column: Interactive Test Simulator */}
        <div className="ai-col test-simulator">
          <div className="simulator-card">
            <div className="simulator-header">
              <Flame size={20} className="text-amber" />
              <h3>Simulador de Pruebas (Playground)</h3>
            </div>
            <p className="sim-description">
              Prueba cómo responderá la IA con el contexto y modelo actual antes de activarla en WhatsApp.
            </p>

            <div className="sim-input-group">
              <label className="input-label">Mensaje simulado del cliente:</label>
              <textarea
                className="sim-textarea"
                rows={3}
                value={testUserMessage}
                onChange={e => setTestUserMessage(e.target.value)}
                placeholder="Escribe lo que diría un cliente..."
              />
            </div>

            <button
              type="button"
              className="test-btn"
              onClick={handleTestPrompt}
              disabled={testing || !apiKey.trim()}
            >
              <Send size={16} />
              {testing ? 'Consultando IA...' : 'Probar Respuesta de la IA'}
            </button>

            {testError && (
              <div className="sim-error mt-3">
                <AlertCircle size={18} />
                <span>{testError}</span>
              </div>
            )}

            {testReply && (
              <div className="sim-result-box mt-3">
                <div className="sim-result-header">
                  <span className="badge-bot">🤖 Respuesta del Bot ({provider})</span>
                  {testDuration !== null && <span className="time-badge">{testDuration} ms</span>}
                </div>
                <div className="sim-reply-content">{testReply}</div>
              </div>
            )}

            <div className="sim-tips mt-4">
              <h5>Consejos para un mejor rendimiento:</h5>
              <ul>
                <li>Usa <strong>OpenRouter con DeepSeek Chat</strong> para costos mínimos y respuestas excelentes en español.</li>
                <li>Incluye siempre tus <strong>horarios, precios y zonas de cobertura</strong> en el contexto.</li>
                <li>Si no quieres que la IA hable de temas fuera de tu servicio, acláralo en las reglas de atención.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
