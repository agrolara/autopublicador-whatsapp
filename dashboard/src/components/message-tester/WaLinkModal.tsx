import React, { useState } from 'react';
import { X, Link, MessageSquare, Phone, Copy, Check, ExternalLink } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

interface WaLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (generatedUrl: string) => void;
}

export const WaLinkModal: React.FC<WaLinkModalProps> = ({ isOpen, onClose, onInsert }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [prefilledMessage, setPrefilledMessage] = useState('Esta promoción la vi en un grupo de WhatsApp');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Clean phone number: keep only digits
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const encodedText = encodeURIComponent(prefilledMessage.trim());
  const generatedUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}${encodedText ? `?text=${encodedText}` : ''}`
    : '';

  const handleCopy = async () => {
    if (!generatedUrl) return;
    await copyToClipboard(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    if (!generatedUrl) return;
    onInsert(generatedUrl);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
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
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.08) 0%, rgba(18, 140, 126, 0.08) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#25D366',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(37, 211, 102, 0.3)',
              }}
            >
              <Link size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Generador de Enlace WhatsApp
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
                Crea un link directo con mensaje predeterminado
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
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Phone input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              <Phone size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
              Número de WhatsApp de Destino:
            </label>
            <input
              type="text"
              placeholder="Ej: +56 9 9744 1215 o 56997441215"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                background: 'var(--bg-secondary, #f8fafc)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.9rem',
              }}
              autoFocus
            />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              Incluye el código de país sin el signo + (ej: 569 para Chile).
            </div>
          </div>

          {/* Prefilled message input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              <MessageSquare size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
              Mensaje Pre-escrito al abrir el chat:
            </label>
            <textarea
              rows={3}
              placeholder="Ej: Esta promoción la vi en un grupo de WhatsApp"
              value={prefilledMessage}
              onChange={e => setPrefilledMessage(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                background: 'var(--bg-secondary, #f8fafc)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Live Preview */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              padding: '12px 14px',
              borderRadius: '10px',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
              🔗 Enlace Generado:
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                color: '#15803d',
                wordBreak: 'break-all',
                background: '#ffffff',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #86efac',
              }}
            >
              {generatedUrl || 'Ingresa el número para generar el enlace...'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <button
            type="button"
            onClick={handleCopy}
            disabled={!generatedUrl}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: generatedUrl ? 'pointer' : 'not-allowed',
              opacity: generatedUrl ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!generatedUrl}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#25D366',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: generatedUrl ? 'pointer' : 'not-allowed',
              opacity: generatedUrl ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)',
            }}
          >
            <ExternalLink size={16} /> Insertar en Mensaje
          </button>
        </div>
      </div>
    </div>
  );
};
