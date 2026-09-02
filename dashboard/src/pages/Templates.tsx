import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, FileText, Loader2, Plus, Search, Trash2, X, Image as ImageIcon, Video, Music, FileUp, Globe, Link as LinkIcon } from 'lucide-react';
import { type MessageTemplate, type TemplatePayload } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useSessionsQuery,
  useTemplatesQuery,
  useUpdateTemplateMutation,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { WaLinkModal } from '../components/message-tester/WaLinkModal';
import { copyToClipboard } from '../utils/clipboard';
import './Templates.css';

type TemplateForm = {
  name: string;
  header: string;
  body: string;
  footer: string;
  mediaType: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string;
  mediaFileName: string;
  mediaUrls: string[];
};

interface SavedImage {
  id: string;
  name: string;
  base64: string;
  filename: string;
  mimetype: string;
}

const emptyForm: TemplateForm = {
  name: '',
  header: '',
  body: '',
  footer: '',
  mediaType: 'text',
  mediaUrl: '',
  mediaFileName: '',
  mediaUrls: [],
};

function extractPlaceholders(template: TemplateForm | MessageTemplate) {
  const source = [template.header, template.body, template.footer].filter(Boolean).join('\n');
  return Array.from(new Set(Array.from(source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g), match => match[1]))).sort();
}

function toPayload(form: TemplateForm): TemplatePayload {
  const cleanUrls = (form.mediaUrls || []).filter(Boolean);
  const primaryUrl = cleanUrls[0] || form.mediaUrl.trim() || null;
  return {
    name: form.name.trim(),
    header: form.header.trim() || null,
    body: form.body.trim(),
    footer: form.footer.trim() || null,
    mediaType: form.mediaType || 'text',
    mediaUrl: primaryUrl,
    mediaUrls: cleanUrls.length > 0 ? cleanUrls : (primaryUrl ? [primaryUrl] : null),
    mediaFileName: form.mediaFileName.trim() || null,
  };
}

function renderPreview(template: TemplateForm, values: Record<string, string>) {
  return [template.header, template.body, template.footer]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] || `{{${key}}}`);
}

export function Templates() {
  const { t } = useTranslation();
  useDocumentTitle(t('templates.title'));
  const { canWrite } = useRole();
  const { data: sessions = [], isLoading: loadingSessions } = useSessionsQuery();
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showWaLink, setShowWaLink] = useState(false);
  const [savedGallery, setSavedGallery] = useState<SavedImage[]>([]);
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');

  const { data: templates = [], isLoading: loadingTemplates } = useTemplatesQuery(
    selectedSessionId || 'default',
    true,
  );
  const createMutation = useCreateTemplateMutation();
  const updateMutation = useUpdateTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();

  const selectedSession = sessions.find(session => session.id === selectedSessionId);
  const placeholders = useMemo(() => extractPlaceholders(form), [form]);
  const preview = useMemo(() => renderPreview(form, previewValues), [form, previewValues]);
  const filteredTemplates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter(template =>
      [template.name, template.header, template.body, template.footer]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query)),
    );
  }, [searchTerm, templates]);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('openwa_saved_images');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedGallery(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setPreviewValues(current => {
      const next: Record<string, string> = {};
      for (const key of placeholders) {
        next[key] = current[key] || '';
      }
      return next;
    });
  }, [placeholders]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingTemplate(null);
    setCustomUrlInput('');
    setShowGalleryPicker(false);
    setPreviewValues({});
  };

  const openEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
    let initialUrls: string[] = [];
    if (Array.isArray(template.mediaUrls) && template.mediaUrls.length > 0) {
      initialUrls = template.mediaUrls;
    } else if (template.mediaUrl) {
      initialUrls = [template.mediaUrl];
    }

    setForm({
      name: template.name,
      header: template.header || '',
      body: template.body,
      footer: template.footer || '',
      mediaType: template.mediaType || 'text',
      mediaUrl: template.mediaUrl || '',
      mediaUrls: initialUrls,
      mediaFileName: template.mediaFileName || '',
    });
    setCustomUrlInput('');
    setShowGalleryPicker(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (form.mediaType !== 'image') {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setForm({
          ...form,
          mediaUrl: result,
          mediaUrls: [result],
          mediaFileName: file.name,
        });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
      return;
    }

    // Multiple image support (up to 5)
    const currentUrls = form.mediaUrls || [];
    const remainingSlots = 5 - currentUrls.length;
    if (remainingSlots <= 0) {
      setToast({ type: 'error', message: 'Límite alcanzado: máximo 5 imágenes por plantilla.' });
      e.target.value = '';
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    let loadedCount = 0;
    const newBase64s: string[] = [];

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          newBase64s.push(reader.result);
        }
        loadedCount++;
        if (loadedCount === filesToProcess.length) {
          const combined = [...currentUrls, ...newBase64s].slice(0, 5);
          setForm({
            ...form,
            mediaUrl: combined[0] || '',
            mediaUrls: combined,
            mediaFileName: `${combined.length} imágenes`,
          });
          setToast({ type: 'success', message: `✨ ${newBase64s.length} imagen(es) agregada(s). Total: ${combined.length}/5` });
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleAddUrl = () => {
    const trimmed = customUrlInput.trim();
    if (!trimmed) return;
    if (form.mediaType === 'image') {
      const current = form.mediaUrls || [];
      if (current.length >= 5) {
        setToast({ type: 'error', message: 'Límite alcanzado: máximo 5 imágenes por plantilla.' });
        return;
      }
      const combined = [...current, trimmed];
      setForm({
        ...form,
        mediaUrl: combined[0],
        mediaUrls: combined,
        mediaFileName: `${combined.length} imágenes`,
      });
      setCustomUrlInput('');
      setToast({ type: 'success', message: `✨ Imagen agregada. Total: ${combined.length}/5` });
    } else {
      setForm({
        ...form,
        mediaUrl: trimmed,
        mediaUrls: [trimmed],
        mediaFileName: '',
      });
      setCustomUrlInput('');
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const updated = (form.mediaUrls || []).filter((_, idx) => idx !== indexToRemove);
    setForm({
      ...form,
      mediaUrl: updated[0] || '',
      mediaUrls: updated,
      mediaFileName: updated.length > 0 ? `${updated.length} imágenes` : '',
    });
  };

  const handleToggleSavedGalleryImage = (img: SavedImage) => {
    const current = form.mediaUrls || [];
    const exists = current.includes(img.base64);
    if (exists) {
      const updated = current.filter(u => u !== img.base64);
      setForm({
        ...form,
        mediaUrl: updated[0] || '',
        mediaUrls: updated,
        mediaFileName: updated.length > 0 ? `${updated.length} imágenes` : '',
      });
    } else {
      if (current.length >= 5) {
        setToast({ type: 'error', message: 'Límite alcanzado: máximo 5 imágenes por plantilla.' });
        return;
      }
      const updated = [...current, img.base64];
      setForm({
        ...form,
        mediaUrl: updated[0],
        mediaUrls: updated,
        mediaFileName: `${updated.length} imágenes`,
      });
    }
  };

  const handleSave = async () => {
    if (!selectedSessionId || !form.name.trim() || !form.body.trim()) return;

    try {
      if (editingTemplate) {
        await updateMutation.mutateAsync({
          sessionId: selectedSessionId,
          id: editingTemplate.id,
          data: toPayload(form),
        });
        setToast({ type: 'success', message: t('templates.toasts.updated') });
      } else {
        await createMutation.mutateAsync({
          sessionId: selectedSessionId,
          data: toPayload(form),
        });
        setToast({ type: 'success', message: t('templates.toasts.created') });
      }
      resetForm();
    } catch (err) {
      setToast({
        type: 'error',
        message: t(editingTemplate ? 'templates.toasts.updateFailed' : 'templates.toasts.createFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedSessionId || !deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ sessionId: selectedSessionId, id: deleteTarget.id });
      setToast({ type: 'success', message: t('templates.toasts.deleted') });
      if (editingTemplate?.id === deleteTarget.id) resetForm();
      setDeleteTarget(null);
    } catch (err) {
      setToast({
        type: 'error',
        message: t('templates.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const copyName = async (name: string) => {
    if (await copyToClipboard(name)) {
      setToast({ type: 'success', message: t('templates.toasts.copied') });
    }
  };

  if (loadingSessions) {
    return (
      <div className="templates-page templates-loading">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="templates-page">
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
      )}

      <PageHeader
        title={t('templates.title')}
        subtitle={t('templates.subtitle')}
        actions={
          <select
            className="templates-session-select"
            value={selectedSessionId}
            onChange={event => {
              setSelectedSessionId(event.target.value);
              resetForm();
            }}
          >
            {sessions.length === 0 && <option value="">{t('templates.noSessions')}</option>}
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        }
      />

      {sessions.length === 0 ? (
        <div className="templates-empty-page">
          <FileText size={48} strokeWidth={1} />
          <h3>{t('templates.empty.noSessionsTitle')}</h3>
          <p>{t('templates.empty.noSessionsDesc')}</p>
        </div>
      ) : (
        <div className="templates-workspace">
          <aside className="templates-library">
            <div className="templates-library-header">
              <div>
                <h2>{t('templates.savedTitle')}</h2>
                <span>{t('templates.count', { count: templates.length })}</span>
              </div>
              <button className="btn-primary templates-new-btn" onClick={resetForm} disabled={!canWrite}>
                <Plus size={16} />
                {t('templates.newTemplate')}
              </button>
            </div>

            <div className="templates-search">
              <Search size={16} />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder={t('common.search')}
              />
            </div>

            {loadingTemplates ? (
              <div className="templates-loading-inline">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : templates.length === 0 ? (
              <div className="templates-empty-list">
                <FileText size={40} strokeWidth={1} />
                <h3>{t('templates.empty.title')}</h3>
                <p>{t('templates.empty.description')}</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="templates-empty-list compact">
                <Search size={32} strokeWidth={1.5} />
                <h3>{t('templates.empty.title')}</h3>
              </div>
            ) : (
              <div className="template-list" role="list">
                {filteredTemplates.map(template => {
                  const templatePlaceholders = extractPlaceholders(template);
                  const isSelected = editingTemplate?.id === template.id;
                  const mType = template.mediaType || 'text';
                  return (
                    <button
                      key={template.id}
                      className={`template-list-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => openEdit(template)}
                      type="button"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <span className="template-list-title" style={{ margin: 0 }}>{template.name}</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          whiteSpace: 'nowrap',
                          background: mType === 'image' ? '#dbeafe' : mType === 'video' ? '#fce7f3' : mType === 'document' ? '#fef3c7' : mType === 'audio' ? '#e0e7ff' : '#f1f5f9',
                          color: mType === 'image' ? '#1e40af' : mType === 'video' ? '#9d174d' : mType === 'document' ? '#92400e' : mType === 'audio' ? '#3730a3' : '#475569'
                        }}>
                          {mType === 'image'
                            ? (Array.isArray(template.mediaUrls) && template.mediaUrls.length > 1
                                ? `🖼️ ${template.mediaUrls.length} Fotos`
                                : '🖼️ Imagen')
                            : mType === 'video' ? '🎥 Video'
                            : mType === 'document' ? '📄 Documento'
                            : mType === 'audio' ? '🎵 Audio'
                            : '📝 Texto'}
                        </span>
                      </div>
                      <span className="template-list-body">{template.body}</span>
                      <span className="template-list-meta">
                        {templatePlaceholders.length > 0
                          ? templatePlaceholders.map(key => `{{${key}}}`).join(' ')
                          : t('templates.noPlaceholders')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="template-editor">
            <div className="template-editor-header">
              <div>
                <h2>{editingTemplate ? t('templates.editTitle') : t('templates.createTitle')}</h2>
                <p>{selectedSession ? t('templates.sessionHint', { name: selectedSession.name }) : ''}</p>
              </div>
              <div className="template-header-actions">
                {editingTemplate && (
                  <button
                    className="icon-btn"
                    title={t('templates.actions.copyName')}
                    onClick={() => void copyName(editingTemplate.name)}
                    type="button"
                  >
                    <Copy size={16} />
                  </button>
                )}
                {editingTemplate && canWrite && (
                  <button
                    className="icon-btn danger"
                    title={t('common.delete')}
                    onClick={() => setDeleteTarget(editingTemplate)}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="template-form">
              <div className="form-group">
                <label>{t('common.name')}</label>
                <input
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder={t('templates.namePlaceholder')}
                  disabled={!canWrite}
                />
              </div>

              {/* Selector de Tipo de Mensaje / Multimedia */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px', color: '#1e293b' }}>
                  📁 Tipo de Mensaje / Multimedia:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { type: 'text', label: '📝 Solo Texto / Link' },
                    { type: 'image', label: '🖼️ Imagen' },
                    { type: 'video', label: '🎥 Video' },
                    { type: 'audio', label: '🎵 Audio' },
                    { type: 'document', label: '📄 Documento' },
                  ].map(item => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setForm({ ...form, mediaType: item.type as any })}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: form.mediaType === item.type ? 600 : 400,
                        border: form.mediaType === item.type ? '2px solid #10b981' : '1px solid #cbd5e1',
                        background: form.mediaType === item.type ? '#ecfdf5' : '#ffffff',
                        color: form.mediaType === item.type ? '#065f46' : '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opciones de Archivo Multimedia */}
              {form.mediaType !== 'text' && (
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                  {form.mediaType === 'image' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', margin: 0 }}>
                          📸 Fotos de la Plantilla ({form.mediaUrls.length}/5 máx):
                        </label>
                        {form.mediaUrls.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, mediaUrl: '', mediaUrls: [], mediaFileName: '' })}
                            style={{ fontSize: '0.78rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                          >
                            🗑️ Quitar todas ({form.mediaUrls.length})
                          </button>
                        )}
                      </div>

                      {/* Botones de acción para agregar imágenes */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 14px',
                          background: form.mediaUrls.length >= 5 ? '#94a3b8' : '#10b981',
                          color: '#ffffff',
                          borderRadius: '6px',
                          cursor: form.mediaUrls.length >= 5 ? 'not-allowed' : 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          transition: 'background 0.2s',
                        }}>
                          <FileUp size={15} /> Subir fotos desde PC
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            disabled={form.mediaUrls.length >= 5}
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                          />
                        </label>

                        {savedGallery.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowGalleryPicker(!showGalleryPicker)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '7px 14px',
                              background: showGalleryPicker ? '#e0e7ff' : '#ffffff',
                              color: '#4338ca',
                              border: '1px solid #c7d2fe',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                            }}
                          >
                            🖼️ Elegir de mi Galería ({savedGallery.length})
                          </button>
                        )}
                      </div>

                      {/* Selector de Galería Guardada desplegable */}
                      {showGalleryPicker && savedGallery.length > 0 && (
                        <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                              Haz clic en una imagen para agregarla o quitarla:
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowGalleryPicker(false)}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              Cerrar
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                            {savedGallery.map(img => {
                              const isSelected = form.mediaUrls.includes(img.base64);
                              const order = form.mediaUrls.indexOf(img.base64) + 1;
                              return (
                                <div
                                  key={img.id}
                                  onClick={() => handleToggleSavedGalleryImage(img)}
                                  style={{
                                    position: 'relative',
                                    aspectRatio: '1/1',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    border: isSelected ? '2px solid #10b981' : '1px solid #cbd5e1',
                                    cursor: 'pointer',
                                    background: '#fff',
                                  }}
                                  title={img.name}
                                >
                                  <img src={img.base64} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  {isSelected && (
                                    <span style={{
                                      position: 'absolute',
                                      top: '2px',
                                      left: '2px',
                                      background: '#10b981',
                                      color: '#fff',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                    }}>
                                      #{order}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Input para agregar por URL directa */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '3px' }}>
                          O agregar imagen por URL pública directa:
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            value={customUrlInput}
                            onChange={e => setCustomUrlInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
                            placeholder="https://ejemplo.com/foto.jpg"
                            style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                          />
                          <button
                            type="button"
                            onClick={handleAddUrl}
                            disabled={!customUrlInput.trim() || form.mediaUrls.length >= 5}
                            style={{
                              padding: '6px 12px',
                              background: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: (!customUrlInput.trim() || form.mediaUrls.length >= 5) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ➕ Agregar URL
                          </button>
                        </div>
                      </div>

                      {/* Cuadrícula de fotos seleccionadas */}
                      {form.mediaUrls.length > 0 ? (
                        <div>
                          <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '6px', fontWeight: 600 }}>
                            Imágenes adjuntas a esta plantilla ({form.mediaUrls.length} de 5):
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                            {form.mediaUrls.map((url, idx) => (
                              <div
                                key={idx}
                                style={{
                                  position: 'relative',
                                  aspectRatio: '1/1',
                                  borderRadius: '6px',
                                  overflow: 'hidden',
                                  border: idx === 0 ? '2px solid #10b981' : '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                }}
                              >
                                <img
                                  src={url}
                                  alt={`Foto #${idx + 1}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <span style={{
                                  position: 'absolute',
                                  bottom: '2px',
                                  left: '2px',
                                  background: idx === 0 ? '#10b981' : 'rgba(0,0,0,0.65)',
                                  color: '#ffffff',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                }}>
                                  #{idx + 1}{idx === 0 ? ' (Principal)' : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImage(idx)}
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: '#ef4444',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                  }}
                                  title="Quitar esta imagen"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                          No hay fotos agregadas todavía. Sube hasta 5 fotos para esta plantilla.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.83rem', color: '#1e293b', marginBottom: '6px' }}>
                        📎 Archivo de {form.mediaType === 'video' ? 'Video' : form.mediaType === 'audio' ? 'Audio' : 'Documento'}:
                      </label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          background: '#10b981',
                          color: '#ffffff',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 600
                        }}>
                          <FileUp size={15} /> Subir desde tu PC
                          <input
                            type="file"
                            accept={form.mediaType === 'video' ? 'video/*' : form.mediaType === 'audio' ? 'audio/*' : '*/*'}
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                          />
                        </label>
                        {form.mediaFileName && (
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                            ✓ {form.mediaFileName}
                          </span>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '3px' }}>
                          O ingresar URL directa / Enlace público:
                        </label>
                        <input
                          type="text"
                          value={form.mediaUrl.startsWith('data:') ? '' : form.mediaUrl}
                          onChange={e => setForm({ ...form, mediaUrl: e.target.value, mediaUrls: [e.target.value], mediaFileName: '' })}
                          placeholder="https://ejemplo.com/archivo"
                          style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                      </div>

                      {form.mediaUrl && (
                        <div style={{ marginTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, mediaUrl: '', mediaUrls: [], mediaFileName: '' })}
                            style={{ display: 'block', marginTop: '6px', fontSize: '0.78rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                          >
                            ✕ Quitar archivo adjunto
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="template-message-fields">
                <div className="form-group">
                  <label>{t('templates.header')}</label>
                  <input
                    value={form.header}
                    onChange={event => setForm({ ...form, header: event.target.value })}
                    placeholder={t('templates.headerPlaceholder')}
                    disabled={!canWrite}
                  />
                </div>

                <div className="form-group body-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0 }}>{t('templates.body')}</label>
                    <button
                      type="button"
                      onClick={() => setShowWaLink(true)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #86efac',
                        background: '#f0fdf4',
                        color: '#166534',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <LinkIcon size={12} /> Link wa.me
                    </button>
                  </div>
                  <textarea
                    value={form.body}
                    onChange={event => setForm({ ...form, body: event.target.value })}
                    placeholder={t('templates.bodyPlaceholder')}
                    rows={10}
                    disabled={!canWrite}
                  />
                </div>

                <div className="form-group">
                  <label>{t('templates.footer')}</label>
                  <input
                    value={form.footer}
                    onChange={event => setForm({ ...form, footer: event.target.value })}
                    placeholder={t('templates.footerPlaceholder')}
                    disabled={!canWrite}
                  />
                </div>
              </div>

              <div className="template-editor-actions">
                <button className="btn-secondary" onClick={resetForm} disabled={isSaving} type="button">
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={!canWrite || isSaving || !selectedSessionId || !form.name.trim() || !form.body.trim()}
                  type="button"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  {canWrite
                    ? t(editingTemplate ? 'templates.saveChanges' : 'templates.createTemplate')
                    : t('templates.viewOnly')}
                </button>
              </div>
            </div>
          </section>

          <aside className="template-preview">
            <div className="template-preview-header">
              <h2>{t('templates.previewTitle')}</h2>
              <span>{placeholders.length}</span>
            </div>
            <div className="template-preview-message">
              {form.mediaType === 'image' && form.mediaUrls && form.mediaUrls.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: form.mediaUrls.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(80px, 1fr))',
                    gap: '6px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}>
                    {form.mediaUrls.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', aspectRatio: '1/1', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        <img src={url} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>
                    🖼️ {form.mediaUrls.length} foto{form.mediaUrls.length > 1 ? 's' : ''} adjunta{form.mediaUrls.length > 1 ? 's' : ''}
                  </div>
                </div>
              )}
              {form.mediaType !== 'image' && form.mediaType !== 'text' && form.mediaUrl && (
                <div style={{ marginBottom: '10px', padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px', fontSize: '0.78rem', color: '#475569' }}>
                  📎 Archivo adjunto ({form.mediaType})
                </div>
              )}
              <pre>{preview || t('templates.previewEmpty')}</pre>
            </div>
            <div className="template-variable-panel">
              {placeholders.length > 0 ? (
                <div className="placeholder-list">
                  {placeholders.map(key => (
                    <label key={key}>
                      <span>{`{{${key}}}`}</span>
                      <input
                        value={previewValues[key] || ''}
                        onChange={event => setPreviewValues({ ...previewValues, [key]: event.target.value })}
                        placeholder={t('templates.previewValuePlaceholder')}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="template-muted">{t('templates.noPlaceholders')}</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title={t('templates.deleteTitle')}
          className="modal-sm"
          closeLabel={t('common.close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('templates.deleteConfirm', { name: deleteTarget.name })}</p>
        </Modal>
      )}

      <WaLinkModal
        isOpen={showWaLink}
        onClose={() => setShowWaLink(false)}
        onInsert={url => setForm(f => ({ ...f, body: f.body ? `${f.body}\n\n${url}` : url }))}
      />
    </div>
  );
}
