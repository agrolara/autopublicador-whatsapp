import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  CheckSquare,
  Square,
  Globe,
  Layers,
  AlertCircle,
  Pause,
  Play,
  XCircle,
  Sparkles,
  ListPlus,
  History,
  Clock,
  Trash2,
  ShieldAlert,
  Image as ImageIcon,
  Upload,
  X,
  Tag,
  Calendar as CalendarIcon,
  Repeat,
  FolderPlus,
  MessageSquarePlus,
  Eye,
  RefreshCw,
  Dices,
  Wand2,
} from 'lucide-react';
import {
  contactApi,
  messageApi,
  contactCategoriesApi,
  type Contact,
  type ScheduledBroadcastItem,
  type ContactCategoryItem,
} from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSessionsQuery, useTemplatesQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../hooks/useToast';
import './Contacts.css';

type MainTab = 'contacts' | 'create_broadcast' | 'campaign_history';
type FilterType = 'all' | 'saved' | 'unsaved';

interface SpintaxPresetGroup {
  category: string;
  items: { label: string; value: string }[];
}

const SPINTAX_PRESETS: SpintaxPresetGroup[] = [
  {
    category: '👋 Saludos y Aperturas',
    items: [
      { label: 'Básico', value: '{Hola|Buenas|Saludos|Qué tal}' },
      { label: 'Formal / Día', value: '{Buenos días|Buenas tardes|Hola qué tal}' },
      { label: 'Cercano / Amigo', value: '{Hola amigo/a|Estimad@|Hola vecino/a}' },
      { label: 'Directo y Alegre', value: '{¡Hola! ¿Cómo estás?|¡Buenas! Un gusto|¡Saludos cordiales!}' },
    ],
  },
  {
    category: '🤝 Cortesía y Conexión',
    items: [
      { label: 'Deseo de bienestar', value: '{espero que tengas un excelente día|espero te encuentres muy bien|un gusto saludarte}' },
      { label: 'Introducción de novedad', value: '{te escribo para contarte que|paso a avisarte que|quería compartir contigo que}' },
      { label: 'Mensaje breve', value: '{te escribo brevemente porque|paso rápido a comentarte que}' },
    ],
  },
  {
    category: '🎯 Llamados a la Acción (CTA)',
    items: [
      { label: 'Pedir información', value: '{¿Te gustaría conocer más detalles?|¿Te interesa esta información?|¿Te gustaría que te enviemos la carta/catálogo?}' },
      { label: 'Hacer pedido', value: '{¡Haz tu pedido respondiendo a este mensaje!|¡Escríbenos para pedir el tuyo!|¡Aprovecha antes de que se agote!}' },
      { label: 'Consulta rápida', value: '{¿Me avisas si te tinca?|¿Qué opinas?|¿Te agendamos un pedido?}' },
    ],
  },
  {
    category: '🙌 Despedidas',
    items: [
      { label: 'Atenta y cálida', value: '{¡Que tengas un gran día!|¡Un abrazo grande!|¡Quedo atento a tus comentarios!}' },
      { label: 'Agradecida', value: '{¡Saludos cordiales!|¡Muchas gracias por tu tiempo!|¡Que estés muy bien!}' },
      { label: 'Cierre rápido', value: '{¡Hablamos pronto!|¡Cualquier duda me avisas!|¡Éxito en todo!}' },
    ],
  },
  {
    category: '✨ Emojis Anti-Detección',
    items: [
      { label: 'Comida / Negocio', value: '{🍕|🔥|✨|📦}' },
      { label: 'Saludos / Amistad', value: '{👏|🤝|😊|⭐}' },
      { label: 'Llamado de atención', value: '{👉|⚡|🔔|📢}' },
    ],
  },
];


export function Contacts() {
  useDocumentTitle('Gestión de Contactos y Difusiones');
  const toast = useToast();

  const { data: sessions = [] } = useSessionsQuery();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<MainTab>('contacts');

  // Tab 1: Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Contact Categories state
  const [categories, setCategories] = useState<ContactCategoryItem[]>([]);
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<string[]>([]);
  const [targetCategoryIds, setTargetCategoryIds] = useState<string[]>([]);
  const [showZonePanel, setShowZonePanel] = useState<boolean>(true);
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [categoryNameInput, setCategoryNameInput] = useState<string>('');
  const [categoryColorInput, setCategoryColorInput] = useState<string>('#10b981');
  const [existingCategoryIdToAppend, setExistingCategoryIdToAppend] = useState<string>('');

  // Extract group broadcasts modal state
  const [isExtractingBroadcasts, setIsExtractingBroadcasts] = useState<boolean>(false);
  const [isExtractingDirect, setIsExtractingDirect] = useState<boolean>(false);
  const [extractionResultModal, setExtractionResultModal] = useState<{
    isOpen: boolean;
    totalGroups: number;
    existingContactsSkipped: number;
    newContactsFound: number;
    createdCategories: Array<{ id: string; name: string; count: number }>;
    message?: string;
  } | null>(null);

  // Tab 2: Create Broadcast state
  const [campaignName, setCampaignName] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [attachedImage, setAttachedImage] = useState<{
    base64?: string;
    url?: string;
    mimetype?: string;
    name?: string;
  } | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [targetAudience, setTargetAudience] = useState<string>('selected');
  const [minDelay, setMinDelay] = useState<number>(4);
  const [maxDelay, setMaxDelay] = useState<number>(12);
  const [batchRestInterval, setBatchRestInterval] = useState<number>(30); // Pause after N msgs
  const [batchRestDuration, setBatchRestDuration] = useState<number>(3); // Pause duration in mins
  const [maxCap, setMaxCap] = useState<number>(5000);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSpintaxSimulator, setShowSpintaxSimulator] = useState(false);
  const [simulatorSamples, setSimulatorSamples] = useState<string[]>([]);
  const [activeSpintaxCategory, setActiveSpintaxCategory] = useState<string>('all');

  // Schedule options (with Calendar date picker)
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [frequency, setFrequency] = useState<'once' | 'daily' | 'twice_daily'>('once');

  // Live broadcast progress
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{
    total: number;
    current: number;
    success: number;
    failed: number;
    currentContactName?: string;
  }>({ total: 0, current: 0, success: 0, failed: 0 });

  const cancelRef = useRef<boolean>(false);
  const pauseRef = useRef<boolean>(false);

  // Tab 3: Campaign History state
  const [scheduledCampaigns, setScheduledCampaigns] = useState<ScheduledBroadcastItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);

  const { data: templates = [] } = useTemplatesQuery(selectedSessionId || 'default', true);

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      const ready = sessions.find(s => s.status === 'ready');
      setSelectedSessionId(ready ? ready.id : sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Load contacts
  const fetchContacts = async () => {
    if (!selectedSessionId) return;
    try {
      setLoadingContacts(true);
      const data = await contactApi.list(selectedSessionId);
      setContacts(data);
    } catch (err) {
      toast.error('Error cargando contactos', err instanceof Error ? err.message : 'Error desconocido');
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchCategories = async () => {
    if (!selectedSessionId) return;
    try {
      const data = await contactCategoriesApi.list(selectedSessionId);
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando categorías:', err);
      setCategories([]);
    }
  };

  useEffect(() => {
    void fetchContacts();
    void fetchCategories();
  }, [selectedSessionId]);

  // Load scheduled campaign history
  const fetchScheduledCampaigns = async () => {
    if (!selectedSessionId) return;
    try {
      setLoadingCampaigns(true);
      const items = await messageApi.getScheduledBroadcasts(selectedSessionId);
      setScheduledCampaigns(items);
    } catch (err) {
      console.error('Error loading scheduled campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'campaign_history') {
      void fetchScheduledCampaigns();
    }
  }, [activeTab, selectedSessionId]);

    // Fast O(1) map for contact -> categories lookup
  const contactCategoryMap = useMemo(() => {
    const map = new Map<string, ContactCategoryItem[]>();
    for (const cat of categories) {
      if (Array.isArray(cat.contactIds)) {
        for (const cid of cat.contactIds) {
          const list = map.get(cid);
          if (list) {
            list.push(cat);
          } else {
            map.set(cid, [cat]);
          }
        }
      }
    }
    return map;
  }, [categories]);

  // Fast O(1) set for selected category filters (multi-block support)
  const selectedCatSet = useMemo(() => {
    if (selectedCategoryFilters.length === 0) return null;
    const ids = new Set<string>();
    for (const cId of selectedCategoryFilters) {
      const cat = categories.find(k => k.id === cId);
      if (cat && Array.isArray(cat.contactIds)) {
        for (const id of cat.contactIds) ids.add(id);
      }
    }
    return ids;
  }, [categories, selectedCategoryFilters]);

  // Segment categories into structured Commune / Geographic Zones
  const zoneGroups = useMemo(() => {
    const map: Record<string, { zone: string; label: string; color: string; icon: string; categories: ContactCategoryItem[]; totalContacts: number }> = {
      Quilicura: {
        zone: 'Quilicura',
        label: 'Quilicura',
        color: '#10b981',
        icon: '🏛️',
        categories: [],
        totalContacts: 0,
      },
      Renca: {
        zone: 'Renca',
        label: 'Renca',
        color: '#0284c7',
        icon: '🏙️',
        categories: [],
        totalContacts: 0,
      },
      'Clientes Directos': {
        zone: 'Clientes Directos',
        label: 'Clientes Directos (1 a 1)',
        color: '#0ea5e9',
        icon: '💬',
        categories: [],
        totalContacts: 0,
      },
      Otros: {
        zone: 'Otros',
        label: 'Otros / General',
        color: '#f59e0b',
        icon: '📦',
        categories: [],
        totalContacts: 0,
      },
    };

    const dynamicZones: Record<string, { zone: string; label: string; color: string; icon: string; categories: ContactCategoryItem[]; totalContacts: number }> = {};
    const palette = ['#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', '#14b8a6', '#f97316'];

    for (const cat of categories) {
      const nameLower = (cat.name || '').toLowerCase();
      const count = cat.contactIds?.length || 0;

      if (nameLower.includes('quilicura')) {
        map.Quilicura.categories.push(cat);
        map.Quilicura.totalContacts += count;
      } else if (nameLower.includes('renca')) {
        map.Renca.categories.push(cat);
        map.Renca.totalContacts += count;
      } else if (nameLower.includes('directos') || nameLower.includes('directo')) {
        map['Clientes Directos'].categories.push(cat);
        map['Clientes Directos'].totalContacts += count;
      } else if (nameLower.includes('otros') || nameLower.includes('no publicar')) {
        map.Otros.categories.push(cat);
        map.Otros.totalContacts += count;
      } else {
        const match = cat.name.match(/^difusi[oó]n\s+([A-Za-zÁ-ÿ\s]+?)\s+\d+$/i);
        const zName = match ? match[1].trim() : (cat.name.startsWith('Difusión') ? 'Otros' : 'Personalizadas');

        if (zName === 'Otros') {
          map.Otros.categories.push(cat);
          map.Otros.totalContacts += count;
        } else if (zName.toLowerCase().includes('directo')) {
          map['Clientes Directos'].categories.push(cat);
          map['Clientes Directos'].totalContacts += count;
        } else {
          if (!dynamicZones[zName]) {
            const color = cat.color || palette[Object.keys(dynamicZones).length % palette.length];
            dynamicZones[zName] = {
              zone: zName,
              label: zName,
              color,
              icon: '📍',
              categories: [],
              totalContacts: 0,
            };
          }
          dynamicZones[zName].categories.push(cat);
          dynamicZones[zName].totalContacts += count;
        }
      }
    }

    const result = [map.Quilicura, map.Renca, map['Clientes Directos'], ...Object.values(dynamicZones), map.Otros];
    return result.filter(g => g.categories.length > 0);
  }, [categories]);

  const selectedCategoriesList = useMemo(() => {
    return categories.filter(c => selectedCategoryFilters.includes(c.id));
  }, [categories, selectedCategoryFilters]);

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedCategoryFilters, deferredSearchQuery, selectedSessionId]);

  // Filter & Search logic (optimized with Set lookup and deferred query)
  const filteredContacts = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    return contacts.filter(c => {
      if (filterType === 'saved' && !c.isMyContact) return false;
      if (filterType === 'unsaved' && c.isMyContact) return false;

      if (selectedCatSet && !selectedCatSet.has(c.id)) return false;

      if (q) {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const pushMatch = c.pushName?.toLowerCase().includes(q);
        const numberMatch = c.number?.includes(q) || c.id.includes(q);
        if (!nameMatch && !pushMatch && !numberMatch) return false;
      }
      return true;
    });
  }, [contacts, filterType, selectedCatSet, deferredSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [filteredContacts, currentPage, pageSize]);

  const savedCount = useMemo(() => contacts.filter(c => c.isMyContact).length, [contacts]);
  const unsavedCount = useMemo(() => contacts.filter(c => !c.isMyContact).length, [contacts]);

  // Selection logic
  const isAllFilteredSelected = useMemo(() => {
    if (filteredContacts.length === 0) return false;
    return filteredContacts.every(c => selectedIds.has(c.id));
  }, [filteredContacts, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const next = new Set(selectedIds);
      filteredContacts.forEach(c => next.delete(c.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredContacts.forEach(c => next.add(c.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Switch to Create Broadcast with currently selected contacts
  const handleStartCreateBroadcast = () => {
    if (selectedIds.size === 0) {
      setTargetAudience('all');
    } else {
      setTargetAudience('selected');
    }
    setActiveTab('create_broadcast');
  };

  // Target list for broadcast
  const targetContacts = useMemo(() => {
    if (targetAudience === 'selected') {
      return contacts.filter(c => selectedIds.has(c.id)).slice(0, maxCap);
    } else if (targetAudience === 'saved') {
      return contacts.filter(c => c.isMyContact).slice(0, maxCap);
    } else if (targetAudience === 'unsaved') {
      return contacts.filter(c => !c.isMyContact).slice(0, maxCap);
    } else if (targetAudience.startsWith('category_')) {
      const catId = targetAudience.replace('category_', '');
      const cat = categories.find(c => c.id === catId);
      if (cat) {
        return contacts.filter(c => cat.contactIds.includes(c.id)).slice(0, maxCap);
      }
      return [];
    } else {
      return contacts.slice(0, maxCap);
    }
  }, [contacts, selectedIds, targetAudience, categories, maxCap]);

  
  // Helper to sanitize WhatsApp JID
  const sanitizeJid = (id: string, number?: string): string => {
    if (!id) return '';
    if (id.includes('@c.us') || id.includes('@s.whatsapp.net') || id.includes('@g.us')) {
      return id.replace('@s.whatsapp.net', '@c.us');
    }
    const cleanNum = (number || id).replace(/\D/g, '');
    return `${cleanNum}@c.us`;
  };

  // Upload and handle image for campaign attachment
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachedImage({
        base64: result,
        name: file.name,
        mimetype: file.type || 'image/jpeg',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setAttachedImage(null);
      return;
    }
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      const fullText = [tpl.header, tpl.body, tpl.footer].filter(Boolean).join('\n\n') || (tpl as any).content || (tpl as any).text || '';
      setMessageText(fullText);
      const rawMedia = tpl.mediaUrl || (Array.isArray(tpl.mediaUrls) && tpl.mediaUrls.length > 0 ? tpl.mediaUrls[0] : undefined);
      if (rawMedia && typeof rawMedia === 'string' && rawMedia.trim().length > 0) {
        if (rawMedia.startsWith('data:')) {
          const mimeMatch = rawMedia.match(/^data:([^;]+);base64,/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          setAttachedImage({
            base64: rawMedia,
            mimetype: mime,
            name: tpl.name ? `Plantilla: ${tpl.name}` : 'Imagen de plantilla',
          });
        } else if (rawMedia.startsWith('http://') || rawMedia.startsWith('https://')) {
          setAttachedImage({
            url: rawMedia,
            mimetype: 'image/jpeg',
            name: tpl.name ? `Plantilla: ${tpl.name}` : 'Imagen de plantilla',
          });
        } else if (rawMedia.startsWith('/')) {
          // Prepend origin for relative media file routes on the server
          const fullUrl = `${window.location.origin}${rawMedia}`;
          setAttachedImage({
            url: fullUrl,
            mimetype: 'image/jpeg',
            name: tpl.name ? `Plantilla: ${tpl.name}` : 'Imagen de plantilla',
          });
        } else {
          // Unrecognized media string (e.g. poll option name) -> clear
          setAttachedImage(null);
        }
      } else {
        // If template doesn't have media, clear any previously attached image
        setAttachedImage(null);
      }
    }
  };

  const insertVariable = (variableStr: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentVal = textarea.value;
      const before = currentVal.substring(0, start);
      const after = currentVal.substring(end);
      const padLeft = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
      const padRight = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n') ? ' ' : '';
      const newVal = `${before}${padLeft}${variableStr}${padRight}${after}`;
      setMessageText(newVal);
      setTimeout(() => {
        textarea.focus();
        const cursorPosition = start + padLeft.length + variableStr.length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      }, 50);
    } else {
      setMessageText(prev => `${prev} ${variableStr}`);
    }
  };

  const handleGenerateSamples = () => {
    if (!messageText.trim()) {
      toast.info('Mensaje vacío', 'Escribe algo en el mensaje o carga una plantilla para simular las variaciones.');
      return;
    }
    const sampleTargets: Contact[] = targetContacts.length >= 2
      ? [targetContacts[0], targetContacts[1], targetContacts[2] || targetContacts[0]]
      : [
          { id: '56951782341@c.us', name: 'Carlos Morales', number: '56951782341' } as Contact,
          { id: '56986176136@c.us', name: 'María González', pushName: 'María G.', number: '56986176136' } as Contact,
          { id: '56994785210@c.us', name: '', pushName: 'Juan Pérez', number: '56994785210' } as Contact,
        ];

    const samples = sampleTargets.map((t, idx) => {
      let personalized = interpolateVariables(messageText, t);
      personalized = parseSpintax(personalized);
      const name = t.name || t.pushName || t.number || `Destinatario ${idx + 1}`;
      return `📌 Muestra ${idx + 1} para: ${name} (${t.number || t.id.replace('@c.us', '')})\n${personalized}`;
    });
    setSimulatorSamples(samples);
    setShowSpintaxSimulator(true);
  };

  // Helper function to resolve Spintax (supports nested spintax: {Hola {amigo|vecino}|Buenas {tardes|noches}})
  const parseSpintax = (text: string): string => {
    let result = text;
    while (/\{([^{}]+)\}/.test(result)) {
      result = result.replace(/\{([^{}]+)\}/g, (_, choices: string) => {
        const options = choices.split('|');
        return options[Math.floor(Math.random() * options.length)];
      });
    }
    return result;
  };

  // Helper to personalize dynamic variables ([[nombre]], {{nombre}}, [[número]], etc.)
  const interpolateVariables = (template: string, target: Contact): string => {
    const displayName = target.name || target.pushName || target.number || 'Amig@';
    const numberStr = target.number || target.id?.replace(/@.*$/, '') || '';
    return template
      .replace(/\{\{nombre\}\}/gi, displayName)
      .replace(/\{\{name\}\}/gi, displayName)
      .replace(/\[\[nombre\]\]/gi, displayName)
      .replace(/\[\[name\]\]/gi, displayName)
      .replace(/\{\{n[uú]mero\}\}/gi, numberStr)
      .replace(/\[\[n[uú]mero\]\]/gi, numberStr);
  };

    // Execute Live Broadcast
  const handleExecuteLiveBroadcast = async () => {
    if (!selectedSessionId || targetContacts.length === 0 || (!messageText.trim() && !attachedImage)) return;

    setIsBroadcasting(true);
    setIsPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;

    setBroadcastProgress({
      total: targetContacts.length,
      current: 0,
      success: 0,
      failed: 0,
      currentContactName: targetContacts[0]?.name || targetContacts[0]?.pushName || targetContacts[0]?.number,
    });

    let successCount = 0;
    let failedCount = 0;
    let lastErrorDetails = '';

    for (let i = 0; i < targetContacts.length; i++) {
      if (cancelRef.current) break;

      // Handle pause loop
      while (pauseRef.current && !cancelRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }

      if (cancelRef.current) break;

      const target = targetContacts[i];
      const targetJid = sanitizeJid(target.id, target.number);
      const displayName = target.name || target.pushName || target.number || 'Contacto';
      setBroadcastProgress(prev => ({
        ...prev,
        current: i + 1,
        currentContactName: displayName,
      }));

      // Interpolate variables & resolve Spintax
      let formattedMessage = interpolateVariables(messageText, target);
      formattedMessage = parseSpintax(formattedMessage);

      try {
        if (attachedImage && (attachedImage.base64 || attachedImage.url)) {
          let finalBase64 = attachedImage.base64;
          let finalUrl = attachedImage.url;

          if (finalUrl && finalUrl.startsWith('data:')) {
            finalBase64 = finalUrl;
            finalUrl = undefined;
          } else if (finalUrl && finalUrl.startsWith('/')) {
            finalUrl = `${window.location.origin}${finalUrl}`;
          }

          await messageApi.sendMedia(selectedSessionId, targetJid, 'image', {
            base64: finalBase64,
            url: finalUrl,
            mimetype: attachedImage.mimetype || 'image/jpeg',
            caption: formattedMessage,
          });
        } else {
          await messageApi.sendText(selectedSessionId, targetJid, formattedMessage);
        }
        successCount++;
      } catch (err: any) {
        const errMsg = err?.response?.data?.message || err?.message || 'Error desconocido';
        lastErrorDetails = typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg);
        console.error(`Error sending broadcast to ${targetJid}:`, lastErrorDetails, err);
        failedCount++;
      }

      setBroadcastProgress(prev => ({
        ...prev,
        success: successCount,
        failed: failedCount,
      }));

      // Check for Batch Rest Pause (e.g. pause 3 mins after every 30 messages)
      if ((i + 1) % batchRestInterval === 0 && i < targetContacts.length - 1 && !cancelRef.current) {
        toast.info(
          'Pausa de Lote Anti-Baneo',
          `Pausando por ${batchRestDuration} minuto(s) tras enviar ${i + 1} mensajes para proteger la cuenta.`,
        );
        await new Promise(r => setTimeout(r, batchRestDuration * 60 * 1000));
      } else if (i < targetContacts.length - 1 && !cancelRef.current) {
        // Random Jitter Delay
        const randomSec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        await new Promise(r => setTimeout(r, randomSec * 1000));
      }
    }

    setIsBroadcasting(false);
    if (failedCount === 0) {
      toast.success('Difusión Finalizada con Éxito', `Se enviaron ${successCount} mensajes correctamente.`);
    } else {
      toast.warning(
        'Difusión Finalizada con Observaciones',
        `Éxito: ${successCount}, Fallidos: ${failedCount}.${lastErrorDetails ? ` Razón: ${lastErrorDetails}` : ''}`
      );
    }
    setActiveTab('campaign_history');
  };

  // Schedule Broadcast Campaign
  const handleSaveScheduledCampaign = async () => {
    if (!selectedSessionId || targetContacts.length === 0 || (!messageText.trim() && !attachedImage)) return;

    try {
      const messages = targetContacts.map(target => {
        const chatId = sanitizeJid(target.id, target.number);
        let personalized = interpolateVariables(messageText, target);
        personalized = parseSpintax(personalized);

        if (attachedImage && (attachedImage.base64 || attachedImage.url)) {
          const finalBase64 = attachedImage.base64 || (attachedImage.url?.startsWith('data:') ? attachedImage.url : undefined);
          const finalUrl = !attachedImage.url?.startsWith('data:') ? attachedImage.url : undefined;

          return {
            chatId,
            to: chatId,
            type: 'image' as const,
            content: {
              image: {
                base64: finalBase64,
                url: finalUrl,
                mimetype: attachedImage.mimetype || 'image/jpeg',
              },
              caption: personalized,
            },
            mediaUrl: finalUrl || finalBase64,
          };
        }
        return {
          chatId,
          to: chatId,
          type: 'text' as const,
          content: { text: personalized },
          message: { text: personalized },
        };
      });

      const fullScheduledTime = frequency === 'once'
        ? `${scheduledDate}T${scheduledTime}:00`
        : scheduledTime;

      await messageApi.createScheduledBroadcast(selectedSessionId, {
        name: campaignName.trim() || `Difusión ${new Date().toLocaleDateString()}`,
        scheduledTime: fullScheduledTime,
        frequency,
        startDate: scheduledDate,
        mediaUrls: attachedImage?.url ? [attachedImage.url] : undefined,
        payload: {
          messages: messages as any,
          options: {
            delayBetweenMessages: minDelay * 1000,
            randomizeDelay: true,
          },
        } as any,
      });

      toast.success('Campaña Programada', `La difusión se programó para el ${scheduledDate} a las ${scheduledTime} hrs.`);
      setActiveTab('campaign_history');
    } catch (err) {
      toast.error('Error al programar campaña', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleExtractGroupBroadcasts = async (shouldPurge: any = false, allSessions: boolean = false) => {
    const isPurge = shouldPurge === true;
    if (!selectedSessionId && !allSessions) {
      toast.error('Selecciona una sesión', 'Debes seleccionar una sesión activa primero.');
      return;
    }

    if (isPurge && !window.confirm('¿Deseas purgar todas las difusiones anteriores y reclasificar limpiamente por zona (Quilicura, Renca, Otros)?')) {
      return;
    }

    setIsExtractingBroadcasts(true);
    try {
      const res = await contactCategoriesApi.extractGroupBroadcasts(selectedSessionId, 100, isPurge, allSessions);
      if (res.success) {
        await Promise.all([fetchContacts(), fetchCategories()]);
        setExtractionResultModal({
          isOpen: true,
          totalGroups: res.totalGroups,
          existingContactsSkipped: res.existingContactsSkipped,
          newContactsFound: res.newContactsFound,
          createdCategories: res.createdCategories,
          message: res.message,
        });
        if (res.newContactsFound > 0) {
          toast.success(
            'Difusiones Creadas',
            `Se crearon ${res.createdCategories.length} nuevas difusiones con ${res.newContactsFound} contactos únicos.`,
          );
        } else {
          toast.info('Sin nuevos contactos', res.message || 'Todos los contactos de tus grupos ya estaban asignados.');
        }
      } else {
        toast.error('Error en extracción', res.message || 'No se pudo completar la extracción');
      }
    } catch (err: any) {
      toast.error('Error al extraer grupos', err?.message || 'Error desconocido');
    } finally {
      setIsExtractingBroadcasts(false);
    }
  };

  const handleExtractDirectBroadcasts = async (allSessions: boolean = false) => {
    if (!selectedSessionId && !allSessions) {
      toast.error('Selecciona una sesión', 'Debes seleccionar una sesión activa primero.');
      return;
    }

    setIsExtractingDirect(true);
    try {
      const res = await contactCategoriesApi.extractDirectChatsBroadcasts(selectedSessionId, 100, allSessions);
      if (res.success) {
        await Promise.all([fetchContacts(), fetchCategories()]);
        setExtractionResultModal({
          isOpen: true,
          totalGroups: res.totalChats || 0,
          existingContactsSkipped: res.existingContactsSkipped,
          newContactsFound: res.newContactsFound,
          createdCategories: res.createdCategories,
          message: res.message,
        });
        if (res.newContactsFound > 0) {
          toast.success(
            'Clientes Directos Empaquetados',
            `Se crearon ${res.createdCategories.length} difusiones de Clientes Directos con ${res.newContactsFound} contactos únicos.`,
          );
        } else {
          toast.info('Sin nuevos contactos', res.message || 'Todos tus clientes directos ya estaban incluidos en difusiones.');
        }
      } else {
        toast.error('Error al empaquetar', res.message || 'No se pudo completar el proceso');
      }
    } catch (err: any) {
      toast.error('Error al empaquetar directos', err?.message || 'Error desconocido');
    } finally {
      setIsExtractingDirect(false);
    }
  };

  const handleSaveCategory = async () => {
    if (existingCategoryIdToAppend) {
      const cat = categories.find(c => c.id === existingCategoryIdToAppend);
      if (!cat) return;
      try {
        await contactCategoriesApi.save(selectedSessionId, {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          contactIds: Array.from(selectedIds),
        });
        toast.success('Categoría actualizada', `Se agregaron ${selectedIds.size} contactos a "${cat.name}".`);
        setShowCategoryModal(false);
        setExistingCategoryIdToAppend('');
        void fetchCategories();
      } catch (err: any) {
        toast.error('Error al actualizar categoría', err?.message || 'Error desconocido');
      }
      return;
    }

    if (!categoryNameInput.trim()) {
      toast.error('Nombre requerido', 'Ingresa un nombre para la categoría (ej: Locales Sushi)');
      return;
    }

    try {
      await contactCategoriesApi.save(selectedSessionId, {
        name: categoryNameInput.trim(),
        color: categoryColorInput,
        contactIds: Array.from(selectedIds),
      });
      toast.success('Categoría Creada', `Categoría "${categoryNameInput}" guardada con ${selectedIds.size} contactos.`);
      setShowCategoryModal(false);
      setCategoryNameInput('');
      void fetchCategories();
    } catch (err: any) {
      toast.error('Error al guardar categoría', err?.message || 'Error desconocido');
    }
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la categoría "${name}"?`)) return;
    try {
      await contactCategoriesApi.delete(selectedSessionId, catId);
      toast.success('Categoría eliminada');
      setSelectedCategoryFilters(prev => prev.filter(id => id !== catId));
      setTargetCategoryIds(prev => prev.filter(id => id !== catId));
      if (targetAudience === `category_${catId}`) setTargetAudience('all');
      void fetchCategories();
    } catch (err: any) {
      toast.error('Error al eliminar categoría', err?.message || 'Error desconocido');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!selectedSessionId) return;
    try {
      await messageApi.deleteScheduledBroadcast(selectedSessionId, id);
      toast.success('Campaña Eliminada');
      void fetchScheduledCampaigns();
    } catch (err) {
      toast.error('Error al eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  return (
    <div className="contacts-page">
      <PageHeader
        title="Gestión de Contactos y Difusiones"
        subtitle="Filtra tu agenda de contactos y crea campañas de difusión masiva con protección anti-baneo"
        actions={
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-extract-broadcasts"
              onClick={() => handleExtractGroupBroadcasts(false, false)}
              disabled={isExtractingBroadcasts || isExtractingDirect || !selectedSessionId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isExtractingBroadcasts ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                transition: 'all 0.2s ease',
              }}
              title="Escanear todos los grupos de la sesión y crear difusiones de 100 contactos limpios"
            >
              {isExtractingBroadcasts ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Escaneando grupos...</span>
                </>
              ) : (
                <>
                  <FolderPlus size={16} />
                  <span>📥 Extraer Grupos (100 c/u)</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn-extract-all-sessions"
              onClick={() => handleExtractGroupBroadcasts(false, true)}
              disabled={isExtractingBroadcasts || isExtractingDirect}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isExtractingBroadcasts ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
                transition: 'all 0.2s ease',
              }}
              title="Escanear todos los grupos de todas las sesiones simultáneamente y unificar difusiones"
            >
              <Globe size={15} />
              <span>🌐 Extraer Grupos (Todas las Sesiones)</span>
            </button>

            <button
              type="button"
              className="btn-extract-direct"
              onClick={() => handleExtractDirectBroadcasts(false)}
              disabled={isExtractingDirect || isExtractingBroadcasts || !selectedSessionId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isExtractingDirect ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
                transition: 'all 0.2s ease',
              }}
              title="Empaquetar todos los contactos de conversaciones privadas (1 a 1) en listas de 100 bajo 'Difusión Clientes Directos'"
            >
              {isExtractingDirect ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Empaquetando directos...</span>
                </>
              ) : (
                <>
                  <MessageSquarePlus size={16} />
                  <span>💬 Empaquetar Clientes Directos (100 c/u)</span>
                </>
              )}
            </button>

            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Sesión:</label>
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-color)',
              }}
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id} ({s.status})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Main Sub-Tabs */}
      <div className="contacts-tabs">
        <button
          className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          <Users size={18} />
          📇 Lista de Contactos
        </button>
        <button
          className={`tab-btn ${activeTab === 'create_broadcast' ? 'active' : ''}`}
          onClick={() => setActiveTab('create_broadcast')}
        >
          <ListPlus size={18} />
          🚀 Crear Difusión
        </button>
        <button
          className={`tab-btn ${activeTab === 'campaign_history' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaign_history')}
        >
          <History size={18} />
          📊 Historial de Campañas
        </button>
      </div>

      {/* TAB 1: LISTA DE CONTACTOS */}
      {activeTab === 'contacts' && (
        <>
          <div className="contacts-toolbar">
            <div className="contacts-filters">
              <button
                className={`filter-btn ${filterType === 'all' && selectedCategoryFilters.length === 0 ? 'active' : ''}`}
                onClick={() => {
                  setFilterType('all');
                  setSelectedCategoryFilters([]);
                }}
              >
                <Users size={16} />
                Todos ({contacts.length})
              </button>
              <button
                className={`filter-btn ${filterType === 'saved' ? 'active' : ''}`}
                onClick={() => setFilterType('saved')}
              >
                <UserCheck size={16} />
                Guardados ({savedCount})
              </button>
              <button
                className={`filter-btn ${filterType === 'unsaved' ? 'active' : ''}`}
                onClick={() => setFilterType('unsaved')}
              >
                <UserX size={16} />
                No Guardados ({unsavedCount})
              </button>

              {/* Custom Non-Broadcast Categories (e.g. VIP, Clientes) */}
              {categories.filter(c => !/^difusi[oó]n/i.test(c.name)).map(cat => {
                const count = cat.contactIds?.length || 0;
                const isActive = selectedCategoryFilters.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    className={`filter-btn ${isActive ? 'active' : ''}`}
                    onClick={() => toggleCategoryFilter(cat.id)}
                    style={{
                      borderColor: isActive ? undefined : (cat.color || '#3b82f6'),
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: cat.color || '#3b82f6',
                        display: 'inline-block',
                      }}
                    />
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>

            <div className="contacts-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Buscar por nombre o número..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* ZONE SEGMENTATION DASHBOARD PANEL (3 COLUMNS) */}
          {categories.length > 0 && showZonePanel && (
            <div className="zone-segmentation-panel">
              <div className="zone-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Tag size={18} style={{ color: '#10b981' }} />
                  <strong style={{ fontSize: '0.95rem' }}>
                    Difusiones Segmentadas por Zona y Comuna ({categories.length} listas en total)
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-danger-outline"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    onClick={() => handleExtractGroupBroadcasts(true)}
                    disabled={isExtractingBroadcasts || !selectedSessionId}
                    title="Elimina las listas genéricas y reclasifica automáticamente a todos los contactos en Quilicura, Renca y Otros"
                  >
                    <Trash2 size={13} />
                    🧹 Purgar y Reclasificar por Zona
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => setShowZonePanel(false)}
                  >
                    ▲ Contraer
                  </button>
                </div>
              </div>

              <div className="zone-columns-grid">
                {zoneGroups.map(grp => (
                  <div key={grp.zone} className="zone-column" style={{ borderColor: grp.color }}>
                    <div className="zone-column-title-bar" style={{ backgroundColor: `${grp.color}15`, borderBottomColor: `${grp.color}30` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>{grp.icon}</span>
                        <strong style={{ color: grp.color, fontSize: '0.9rem' }}>{grp.label}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="zone-title-btn"
                          onClick={() => toggleAllZoneCategories(grp.categories.map(c => c.id))}
                          title="Seleccionar o desmarcar todas las listas de esta zona"
                        >
                          {grp.categories.length > 0 && grp.categories.every(c => selectedCategoryFilters.includes(c.id)) ? '☐ Desmarcar' : '☑ Todo'}
                        </button>
                        <span className="zone-column-badge" style={{ backgroundColor: grp.color }}>
                          {grp.categories.length} listas · {grp.totalContacts}
                        </span>
                      </div>
                    </div>

                    <div className="zone-column-cards-container">
                      {grp.categories.map(cat => {
                        const count = cat.contactIds?.length || 0;
                        const isSelected = selectedCategoryFilters.includes(cat.id);
                        return (
                          <div
                            key={cat.id}
                            className={`zone-list-card ${isSelected ? 'active' : ''}`}
                            onClick={() => toggleCategoryFilter(cat.id)}
                            style={{
                              borderColor: isSelected ? grp.color : undefined,
                              backgroundColor: isSelected ? `${grp.color}25` : undefined,
                            }}
                            title={`Clic para seleccionar o deseleccionar este bloque de ${count} contactos`}
                          >
                            <div className="zone-list-card-name">
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  color: isSelected ? grp.color : 'var(--text-muted)',
                                }}
                              >
                                {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                              </span>
                              <span style={{ fontWeight: isSelected ? 600 : 400 }}>{cat.name}</span>
                            </div>
                            <span className="zone-list-card-count" style={{ borderColor: grp.color }}>
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVE MULTI-BLOCK CATEGORY BANNER */}
          {selectedCategoryFilters.length > 0 && (
            <div className="active-category-banner" style={{ borderLeftColor: '#10b981' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                <div>
                  Mostrando <strong>{selectedCategoryFilters.length} listas seleccionadas</strong> ({selectedCatSet?.size || 0} destinatarios únicos acumulados)
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => {
                    setTargetCategoryIds([...selectedCategoryFilters]);
                    setTargetAudience('categories');
                    setActiveTab('create_broadcast');
                  }}
                >
                  <Send size={14} />
                  🚀 Crear Difusión con estas {selectedCategoryFilters.length} Listas ({selectedCatSet?.size || 0} contactos)
                </button>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  onClick={() => setSelectedCategoryFilters([])}
                >
                  ✕ Desmarcar todas
                </button>
              </div>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="broadcast-bar">
              <div className="broadcast-bar-info">
                <CheckCircle2 size={20} style={{ color: '#25d366' }} />
                <span>{selectedIds.size} contacto(s) seleccionado(s)</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setCategoryNameInput('');
                    setExistingCategoryIdToAppend('');
                    setShowCategoryModal(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Tag size={16} />
                  Guardar en Categoría ({selectedIds.size})
                </button>
                <button className="btn-primary" onClick={handleStartCreateBroadcast}>
                  <Send size={16} />
                  🚀 Crear Difusión con Seleccionados ({selectedIds.size})
                </button>
              </div>
            </div>
          )}

          <div className="contacts-table-container">
            {loadingContacts ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loader2 className="animate-spin" size={32} />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <Users size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
                <h3>No se encontraron contactos</h3>
                <p>Intenta cambiar los filtros de búsqueda o seleccionar otra sesión.</p>
              </div>
            ) : (
              <>
                <table className="contacts-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input type="checkbox" checked={isAllFilteredSelected} onChange={toggleSelectAll} />
                    </th>
                    <th>Contacto</th>
                    <th>Categorías</th>
                    <th>PushName (WhatsApp)</th>
                    <th>Número de Teléfono</th>
                    <th>Estado de Agenda</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedContacts.map(c => {
                    const isSelected = selectedIds.has(c.id);
                    const displayName = c.name || c.pushName || c.number || 'Contacto';
                    const initial = displayName.charAt(0).toUpperCase();
                    const contactCats = contactCategoryMap.get(c.id) || [];

                    return (
                      <tr key={c.id} style={{ background: isSelected ? 'rgba(37, 211, 102, 0.05)' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)} />
                        </td>
                        <td>
                          <div className="avatar-cell">
                            <div className="contact-avatar">
                              {(c as any).profilePicUrl ? <img src={(c as any).profilePicUrl} alt={displayName} /> : initial}
                            </div>
                            <div>
                              <strong>{c.name || 'Sin nombre guardado'}</strong>
                            </div>
                          </div>
                        </td>
                        <td>
                          {contactCats.length === 0 ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {contactCats.map(cat => (
                                <span
                                  key={cat.id}
                                  className="category-pill"
                                  style={{
                                    backgroundColor: `${cat.color || '#3b82f6'}20`,
                                    borderColor: cat.color || '#3b82f6',
                                    color: cat.color || '#3b82f6',
                                  }}
                                >
                                  {cat.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{c.pushName || '-'}</td>
                        <td>
                          <code>{c.number || c.id.split('@')[0]}</code>
                        </td>
                        <td>
                          {c.isMyContact ? (
                            <span className="contact-badge saved">
                              <UserCheck size={12} /> Guardado
                            </span>
                          ) : (
                            <span className="contact-badge unsaved">
                              <UserX size={12} /> Desconocido
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

            {/* Pagination Controls */}
            {filteredContacts.length > pageSize && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem 1.25rem',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Mostrando <strong style={{ color: 'var(--text-color)' }}>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                  <strong style={{ color: 'var(--text-color)' }}>{Math.min(currentPage * pageSize, filteredContacts.length)}</strong> de{' '}
                  <strong style={{ color: '#25d366' }}>{filteredContacts.length}</strong> contactos filtrados
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    « Anterior
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem' }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente »
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </>
      )}

      {/* TAB 2: CREAR DIFUSIÓN */}
      {activeTab === 'create_broadcast' && (
        <div className="create-campaign-card">
          {isBroadcasting ? (
            <div className="progress-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>
                  {isPaused ? '⏸️ Difusión Pausada' : '🔄 Enviando mensajes de difusión...'}
                </strong>
                <span>
                  {broadcastProgress.current} / {broadcastProgress.total}
                </span>
              </div>

              <div className="progress-bar-outer" style={{ margin: '1rem 0' }}>
                <div
                  className="progress-bar-inner"
                  style={{
                    width: `${(broadcastProgress.current / (broadcastProgress.total || 1)) * 100}%`,
                  }}
                />
              </div>

              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Destinatario actual: <strong>{broadcastProgress.currentContactName}</strong>
              </p>

              <div style={{ display: 'flex', gap: '1.5rem', margin: '0.75rem 0', fontSize: '0.875rem' }}>
                <span style={{ color: '#25d366' }}>✔ Éxito: {broadcastProgress.success}</span>
                <span style={{ color: '#ef4444' }}>❌ Errores: {broadcastProgress.failed}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    pauseRef.current = !pauseRef.current;
                    setIsPaused(pauseRef.current);
                  }}
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                  {isPaused ? 'Reanudar' : 'Pausar'}
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    cancelRef.current = true;
                    setIsBroadcasting(false);
                  }}
                >
                  <XCircle size={16} /> Cancelar Difusión
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Campaign Name */}
              <div>
                <label className="form-section-title">
                  <ListPlus size={18} /> Nombre de la Campaña de Difusión
                </label>
                <input
                  type="text"
                  placeholder="Ej: Promoción Fin de Semana Pizza 2x1..."
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-color)',
                  }}
                />
              </div>

              {/* Target Audience */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-section-title" style={{ margin: 0 }}>
                    <Users size={18} /> Audiencia Destino ({targetContacts.length} contactos seleccionados)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleExtractGroupBroadcasts(false)}
                    disabled={isExtractingBroadcasts || !selectedSessionId}
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      border: '1px solid #10b981',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: isExtractingBroadcasts ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    {isExtractingBroadcasts ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                    {isExtractingBroadcasts ? 'Escaneando...' : '📥 Extraer Nuevas Difusiones'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className={`filter-btn ${targetAudience === 'selected' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('selected')}
                  >
                    Contactos Seleccionados ({selectedIds.size})
                  </button>
                  <button
                    className={`filter-btn ${targetAudience === 'all' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('all')}
                  >
                    Todos los contactos ({contacts.length})
                  </button>
                  <button
                    className={`filter-btn ${targetAudience === 'saved' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('saved')}
                  >
                    Solo Guardados ({savedCount})
                  </button>
                  <button
                    className={`filter-btn ${targetAudience === 'unsaved' ? 'active' : ''}`}
                    onClick={() => setTargetAudience('unsaved')}
                  >
                    Solo No Guardados ({unsavedCount})
                  </button>

                  {/* Custom Categories Buttons */}
                  {categories.map(cat => {
                    const count = cat.contactIds?.length || 0;
                    const isActive = targetAudience === `category_${cat.id}`;
                    return (
                      <button
                        key={cat.id}
                        className={`filter-btn ${isActive ? 'active' : ''}`}
                        onClick={() => setTargetAudience(`category_${cat.id}`)}
                        style={{
                          borderColor: isActive ? undefined : (cat.color || '#3b82f6'),
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: cat.color || '#3b82f6',
                            display: 'inline-block',
                          }}
                        />
                        {cat.name} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Composer */}
              <div>
                <label className="form-section-title">
                  <Send size={18} /> Redactar Mensaje
                </label>
                <textarea
                  ref={textareaRef}
                  rows={5}
                  placeholder="Escribe tu mensaje aquí..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-color)',
                  }}
                />
              </div>

              {/* Image Attachment in Campaign */}
              <div className="image-upload-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ImageIcon size={18} style={{ color: '#25d366' }} /> Adjuntar Imagen a la Difusión (Opcional)
                  </label>
                  {attachedImage && (
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => setAttachedImage(null)}
                    >
                      <Trash2 size={12} /> Quitar Imagen
                    </button>
                  )}
                </div>

                {attachedImage ? (
                  <div className="image-preview-card">
                    <img
                      src={attachedImage.base64 || attachedImage.url}
                      alt="Vista previa"
                      className="image-preview-thumbnail"
                    />
                    <div className="image-preview-info">
                      <strong style={{ color: 'var(--text-color)' }}>{attachedImage.name || 'Imagen adjunta'}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {attachedImage.base64 ? 'Cargada desde archivo local' : 'URL de imagen'}
                      </span>
                      <span style={{ color: '#25d366', fontSize: '0.75rem' }}>
                        ✔ Se enviará junto al mensaje como pie de foto (caption)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="image-remove-btn"
                      onClick={() => setAttachedImage(null)}
                      title="Eliminar imagen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <label
                      className="btn-secondary"
                      style={{
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <Upload size={16} />
                      Subir Imagen (PNG, JPG, WEBP)
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleImageUpload}
                      />
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      o pega una URL de imagen:
                    </span>
                    <input
                      type="text"
                      placeholder="https://ejemplo.com/foto.jpg"
                      value={imageUrlInput}
                      onChange={e => setImageUrlInput(e.target.value)}
                      onBlur={() => {
                        if (imageUrlInput.trim()) {
                          setAttachedImage({ url: imageUrlInput.trim(), name: 'Imagen URL' });
                          setImageUrlInput('');
                        }
                      }}
                      style={{
                        flex: '1',
                        minWidth: '220px',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Variables & Spintax Control Center */}
              <div className="spintax-control-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                    <Wand2 size={16} style={{ color: '#25d366' }} />
                    <span>Personalización Inteligente y Spintax Anti-Baneo</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="spintax-chip-btn"
                      onClick={handleGenerateSamples}
                      style={{ background: 'rgba(37, 211, 102, 0.15)', borderColor: '#25d366', color: '#25d366', fontWeight: 600 }}
                    >
                      <Dices size={13} />
                      {showSpintaxSimulator ? 'Regenerar Muestra' : '🎲 Probar Variaciones en Vivo'}
                    </button>
                    {showSpintaxSimulator && (
                      <button
                        type="button"
                        className="spintax-chip-btn"
                        onClick={() => setShowSpintaxSimulator(false)}
                        title="Ocultar simulador"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dynamic Variables row */}
                <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Variables del contacto:</span>
                  <button type="button" className="variable-tag" onClick={() => insertVariable('{{nombre}}')} title="Inserta el nombre o 'Amig@'">
                    <Sparkles size={11} /> {'{{nombre}}'}
                  </button>
                  <button type="button" className="variable-tag" onClick={() => insertVariable('[[nombre]]')} title="Formato alternativo [[nombre]]">
                    <Sparkles size={11} /> {'[[nombre]]'}
                  </button>
                  <button type="button" className="variable-tag" onClick={() => insertVariable('{{numero}}')} title="Inserta el número de teléfono sin @c.us">
                    <Sparkles size={11} /> {'{{numero}}'}
                  </button>
                </div>

                {/* Spintax Presets Groups */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {SPINTAX_PRESETS.map((group, gIdx) => (
                    <div key={gIdx} className="spintax-category-group">
                      <div className="spintax-category-title">{group.category}</div>
                      <div className="spintax-chips-container">
                        {group.items.map((item, iIdx) => (
                          <button
                            key={iIdx}
                            type="button"
                            className="spintax-chip-btn"
                            onClick={() => insertVariable(item.value)}
                            title={`Clic para insertar: ${item.value}`}
                          >
                            <span style={{ color: 'var(--text-muted)' }}>+</span> {item.label}: <strong style={{ color: '#25d366', fontWeight: 500 }}>{item.value}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Simulator Accordion/Card */}
                {showSpintaxSimulator && (
                  <div className="spintax-simulator-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Eye size={14} /> Simulador en Vivo: 3 Variaciones Aleatorias Reales
                      </strong>
                      <button
                        type="button"
                        onClick={handleGenerateSamples}
                        className="spintax-chip-btn"
                        style={{ fontSize: '0.7rem' }}
                      >
                        <RefreshCw size={11} /> Nueva Combinación
                      </button>
                    </div>
                    {simulatorSamples.map((sample, sIdx) => (
                      <div key={sIdx} className="spintax-sample-item">
                        {sample}
                      </div>
                    ))}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      💡 Cada destinatario recibirá una combinación diferente generada al momento del envío.
                    </div>
                  </div>
                )}
              </div>

              {Array.isArray(templates) && templates.length > 0 && (
                <div>
                  <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cargar desde Plantilla:</label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => handleTemplateChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                      marginTop: '0.25rem',
                    }}
                  >
                    <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="">
                      Seleccionar plantilla guardada...
                    </option>
                    {templates.map(t => (
                      <option key={t.id} style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Anti-Spam Speed & Batch Settings */}
              <div>
                <label className="form-section-title">
                  <ShieldAlert size={18} style={{ color: '#25d366' }} /> Ajustes de Velocidad y Protección Anti-Baneo
                </label>
                <div className="delay-inputs">
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa Mínima (seg)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minDelay}
                      onChange={e => setMinDelay(parseInt(e.target.value, 10) || 4)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa Máxima (seg)</label>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={maxDelay}
                      onChange={e => setMaxDelay(parseInt(e.target.value, 10) || 10)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pausa de Lote (cada N msgs)</label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={batchRestInterval}
                      onChange={e => setBatchRestInterval(parseInt(e.target.value, 10) || 30)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duración Descanso Lote (min)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={batchRestDuration}
                      onChange={e => setBatchRestDuration(parseInt(e.target.value, 10) || 3)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Límite Máx Destinatarios (Cap)</label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={maxCap}
                      onChange={e => setMaxCap(parseInt(e.target.value, 10) || 5000)}
                    />
                  </div>
                </div>
              </div>

              {/* Schedule options */}
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <label className="form-section-title">
                  <Clock size={18} /> Programación del Envío
                </label>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={!isScheduled}
                      onChange={() => setIsScheduled(false)}
                    />
                    Enviar Inmediatamente
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={isScheduled}
                      onChange={() => setIsScheduled(true)}
                    />
                    Programar Fecha, Hora y Frecuencia
                  </label>
                </div>

                {isScheduled && (
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                        <CalendarIcon size={14} /> Fecha / Día (Calendario)
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setScheduledDate(e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                        <Clock size={14} /> Hora (HH:MM)
                      </label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={e => setScheduledTime(e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                        <Repeat size={14} /> Frecuencia
                      </label>
                      <select
                        value={frequency}
                        onChange={e => setFrequency(e.target.value as any)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                        }}
                      >
                        <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="once">Una sola vez</option>
                        <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="daily">Diario (Todos los días)</option>
                        <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="twice_daily">Cada 12 Horas</option>
                      </select>
                    </div>

                    <div style={{ flex: '1 1 100%', fontSize: '0.8rem', color: '#25d366', marginTop: '0.5rem' }}>
                      📅 Se programará para el día <strong>{scheduledDate}</strong> a las <strong>{scheduledTime} hrs</strong> ({frequency === 'once' ? 'envío único' : frequency === 'daily' ? 'repetir a diario' : 'cada 12 horas'}).
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button className="btn-secondary" onClick={() => setActiveTab('contacts')}>
                  Cancelar
                </button>
                {isScheduled ? (
                  <button
                    className="btn-primary"
                    onClick={handleSaveScheduledCampaign}
                    disabled={(!messageText.trim() && !attachedImage) || targetContacts.length === 0}
                  >
                    <Clock size={16} /> Guardar Difusión Programada
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={handleExecuteLiveBroadcast}
                    disabled={(!messageText.trim() && !attachedImage) || targetContacts.length === 0}
                  >
                    <Send size={16} /> Iniciar Difusión Inmediata ({targetContacts.length} destinatarios)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: HISTORIAL DE CAMPAÑAS */}
      {activeTab === 'campaign_history' && (
        <div className="campaigns-grid">
          {loadingCampaigns ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : scheduledCampaigns.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
              }}
            >
              <History size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
              <h3>No hay campañas guardadas en el historial</h3>
              <p>Crea tu primera campaña de difusión desde la solapa "🚀 Crear Difusión".</p>
            </div>
          ) : (
            scheduledCampaigns.map(c => (
              <div key={c.id} className="campaign-card">
                <div className="campaign-card-header">
                  <div>
                    <h3 style={{ margin: 0 }}>{c.name || `Difusión ${c.id}`}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Creado el: {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="contact-badge saved">
                      <Clock size={12} /> {c.scheduledTime} ({c.frequency})
                    </span>
                    <button
                      className="btn-danger"
                      style={{ padding: '0.35rem 0.6rem' }}
                      onClick={() => handleDeleteCampaign(c.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--text-color)' }}>
                  <strong>Mensaje:</strong>
                  <p style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '6px', margin: '0.25rem 0' }}>
                    {c.payload?.messages?.[0]?.content?.caption || c.payload?.messages?.[0]?.content?.text || (c.payload as any)?.message?.text || '-'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Destinatarios: {c.payload?.messages?.length || (c.payload as any)?.recipients?.length || 0}</span>
                  <span>Delay: {(c.payload as any)?.minDelaySeconds ?? 4}s - {(c.payload as any)?.maxDelaySeconds ?? 10}s</span>
                  {c.lastRunAt && <span>Último envío: {new Date(c.lastRunAt).toLocaleString()}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Category Creation / Management Modal */}
      {/* Extraction Result Summary Modal */}
      {extractionResultModal?.isOpen && (
        <div className="modal-overlay" onClick={() => setExtractionResultModal(null)}>
          <div className="modal-content" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                <Sparkles style={{ color: '#10b981' }} size={22} /> Resumen de Extracción de Grupos
              </h3>
              <button
                className="btn-secondary"
                style={{ border: 'none', padding: '0.25rem 0.5rem' }}
                onClick={() => setExtractionResultModal(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>
                  {extractionResultModal.totalGroups}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Grupos / Chats Escaneados</div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                  {extractionResultModal.newContactsFound}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Contactos Nuevos Únicos</div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                  {extractionResultModal.existingContactsSkipped}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Omitidos (Ya en difusiones)</div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6' }}>
                  {extractionResultModal.createdCategories.length}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nuevas Difusiones (100 c/u)</div>
              </div>
            </div>

            {extractionResultModal.createdCategories.length > 0 ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                  Listas Creadas ({extractionResultModal.createdCategories.length}):
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', maxHeight: '140px', overflowY: 'auto' }}>
                  {extractionResultModal.createdCategories.map(cat => (
                    <span
                      key={cat.id}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <strong>{cat.name}</strong> ({cat.count} contactos)
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid #3b82f6',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-color)',
                }}
              >
                ℹ {extractionResultModal.message || 'Todos los contactos de tus grupos ya están clasificados en difusiones existentes.'}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={() => setExtractionResultModal(null)}>
                Cerrar
              </button>
              {extractionResultModal.createdCategories.length > 0 && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    const firstCat = extractionResultModal.createdCategories[0];
                    setExtractionResultModal(null);
                    setTargetAudience(`category_${firstCat.id}`);
                    setActiveTab('create_broadcast');
                  }}
                >
                  🚀 Ir a Crear Difusión
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderPlus size={20} style={{ color: '#25d366' }} />
                Crear / Asignar Categoría de Contactos
              </h3>
              <button
                className="btn-secondary"
                style={{ border: 'none', padding: '0.25rem 0.5rem' }}
                onClick={() => setShowCategoryModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Asigna los <strong>{selectedIds.size}</strong> contactos seleccionados a una categoría para crear campañas de difusión dirigidas (ej: Locales Sushi, Pizzerías, VIPs).
            </p>

            {categories.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Opción 1: Agregar a una Categoría Existente
                </label>
                <select
                  value={existingCategoryIdToAppend}
                  onChange={e => {
                    setExistingCategoryIdToAppend(e.target.value);
                    if (e.target.value) setCategoryNameInput('');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                  }}
                >
                  <option style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value="">
                    -- Selecciona una categoría existente --
                  </option>
                  {categories.map(cat => (
                    <option key={cat.id} style={{ backgroundColor: '#1e293b', color: '#f8fafc' }} value={cat.id}>
                      {cat.name} ({cat.contactIds.length} contactos actuales)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                {categories.length > 0 ? 'Opción 2: O Crear Nueva Categoría' : 'Nombre de la Nueva Categoría:'}
              </label>
              <input
                type="text"
                placeholder="Ej: Sushi, Locales Sushi, Pizzerías, Proveedores..."
                value={categoryNameInput}
                disabled={Boolean(existingCategoryIdToAppend)}
                onChange={e => setCategoryNameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  opacity: existingCategoryIdToAppend ? 0.5 : 1,
                }}
              />
            </div>

            {!existingCategoryIdToAppend && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Color del Distintivo:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCategoryColorInput(color)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: categoryColorInput === color ? '3px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                        boxShadow: categoryColorInput === color ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={() => setShowCategoryModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveCategory}
                disabled={!existingCategoryIdToAppend && !categoryNameInput.trim()}
              >
                Guardar Categoría ({selectedIds.size} contactos)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
