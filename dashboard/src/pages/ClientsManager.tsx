import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Search,
  Phone,
  Calendar,
  DollarSign,
  Smartphone,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Power,
  RotateCcw,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { clientAccountApi, sessionApi, type ClientAccount, type Session } from '../services/api';
import './ClientsManager.css';

export function ClientsManager() {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended_unpaid' | 'trial'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientAccount | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formSelectedSession, setFormSelectedSession] = useState('');
  const [formMonthlyFee, setFormMonthlyFee] = useState<number>(35000);
  const [formNextBillingDate, setFormNextBillingDate] = useState('');
  const [formPaymentStatus, setFormPaymentStatus] = useState<'active' | 'suspended_unpaid' | 'trial'>('active');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientsData, sessionsData] = await Promise.all([
        clientAccountApi.list(),
        sessionApi.list().catch(() => [] as Session[]),
      ]);
      setClients(clientsData || []);
      setSessions(sessionsData || []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar listado de clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingClient(null);
    setFormName('');
    setFormUsername('');
    setFormPhone('');
    setFormPassword('');
    setFormSelectedSession(sessions.length > 0 ? sessions[0].id : '');
    setFormMonthlyFee(35000);
    // Default next billing date: 1 month from now
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setFormNextBillingDate(d.toISOString().slice(0, 10));
    setFormPaymentStatus('active');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (client: ClientAccount) => {
    setEditingClient(client);
    setFormName(client.name || '');
    setFormUsername(client.username || '');
    setFormPhone(client.phone || '');
    setFormPassword(''); // leave blank unless updating
    setFormSelectedSession(client.allowedSessions && client.allowedSessions.length > 0 ? client.allowedSessions[0] : '');
    setFormMonthlyFee(client.monthlyFee || 0);
    setFormNextBillingDate(client.nextBillingDate ? client.nextBillingDate.slice(0, 10) : '');
    setFormPaymentStatus(client.paymentStatus || 'active');
    setFormNotes(client.notes || '');
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (client: ClientAccount) => {
    const newStatus = client.paymentStatus === 'suspended_unpaid' ? 'active' : 'suspended_unpaid';
    const actionLabel = newStatus === 'suspended_unpaid' ? 'suspender por no pago' : 'reactivar';

    if (!window.confirm(`¿Estás seguro de que deseas ${actionLabel} la cuenta de "${client.name}"?`)) {
      return;
    }

    try {
      await clientAccountApi.update(client.id, {
        paymentStatus: newStatus,
        isActive: newStatus === 'active',
      });
      setSuccessMessage(`Cliente "${client.name}" actualizado a estado ${newStatus === 'active' ? 'ACTIVO' : 'SUSPENDIDO'}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar estado del cliente');
    }
  };

  const handleDeleteClient = async (client: ClientAccount) => {
    if (!window.confirm(`⚠️ ¿Deseas eliminar definitivamente el acceso de "${client.name}"? Esta acción revoca sus credenciales.`)) {
      return;
    }

    try {
      await clientAccountApi.delete(client.id);
      setSuccessMessage(`Acceso de "${client.name}" eliminado correctamente.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar cliente');
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const allowedSessions = formSelectedSession ? [formSelectedSession] : undefined;

    try {
      if (editingClient) {
        await clientAccountApi.update(editingClient.id, {
          name: formName.trim(),
          username: formUsername ? formUsername.trim().toLowerCase() : undefined,
          phone: formPhone ? formPhone.replace(/[^0-9]/g, '') : undefined,
          password: formPassword.trim() ? formPassword.trim() : undefined,
          allowedSessions,
          paymentStatus: formPaymentStatus,
          isActive: formPaymentStatus === 'active',
          monthlyFee: Number(formMonthlyFee) || 0,
          nextBillingDate: formNextBillingDate || undefined,
          notes: formNotes || undefined,
        });
        setSuccessMessage(`Cliente "${formName}" modificado exitosamente.`);
      } else {
        await clientAccountApi.create({
          name: formName.trim(),
          username: formUsername ? formUsername.trim().toLowerCase() : undefined,
          phone: formPhone ? formPhone.replace(/[^0-9]/g, '') : undefined,
          password: formPassword.trim() ? formPassword.trim() : undefined,
          role: 'operator',
          allowedSessions,
          paymentStatus: formPaymentStatus,
          monthlyFee: Number(formMonthlyFee) || 0,
          nextBillingDate: formNextBillingDate || undefined,
          notes: formNotes || undefined,
        });
        setSuccessMessage(`Cliente "${formName}" creado exitosamente.`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 4000);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Error guardando datos del cliente');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToken = (id: string, token: string) => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopiedTokenId(id);
    setTimeout(() => setCopiedTokenId(null), 2500);
  };

  // KPIs
  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.paymentStatus === 'active' && c.isActive).length;
  const suspendedClients = clients.filter(c => c.paymentStatus === 'suspended_unpaid' || !c.isActive).length;
  const estimatedRevenue = clients.reduce((sum, c) => sum + (c.paymentStatus === 'active' ? c.monthlyFee || 0 : 0), 0);

  // Filtered List
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.username && c.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone && c.phone.includes(searchTerm));

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && c.paymentStatus === 'active' && c.isActive) ||
        (statusFilter === 'suspended_unpaid' && (c.paymentStatus === 'suspended_unpaid' || !c.isActive)) ||
        (statusFilter === 'trial' && c.paymentStatus === 'trial');

      return matchSearch && matchStatus;
    });
  }, [clients, searchTerm, statusFilter]);

  return (
    <div className="clients-manager-container">
      {/* Page Header */}
      <div className="clients-header">
        <div className="clients-header-text">
          <h1>
            <Users className="header-icon" /> Gestión de Clientes SaaS y Cobranzas
          </h1>
          <p>
            Crea credenciales aisladas para tus clientes, asigna su sesión de WhatsApp dedicada y bloquea su acceso con un clic si no pagan su mensualidad.
          </p>
        </div>
        <button className="btn-primary create-client-btn" onClick={openCreateModal}>
          <UserPlus size={18} />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="banner error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className="banner-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {successMessage && (
        <div className="banner success-banner">
          <CheckCircle2 size={20} />
          <span>{successMessage}</span>
          <button className="banner-close" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="clients-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrap blue">
            <Users size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Total Clientes</span>
            <span className="kpi-value">{totalClients}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap green">
            <ShieldCheck size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Al Día (Activos)</span>
            <span className="kpi-value">{activeClients}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap red">
            <ShieldAlert size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Suspendidos (No Pagó)</span>
            <span className="kpi-value">{suspendedClients}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap purple">
            <DollarSign size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Ingresos Mensuales</span>
            <span className="kpi-value">${estimatedRevenue.toLocaleString('es-CL')} CLP</span>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="clients-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por cliente, usuario o WhatsApp..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <button
            type="button"
            className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            Todos ({clients.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${statusFilter === 'active' ? 'active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            Al Día ({activeClients})
          </button>
          <button
            type="button"
            className={`filter-btn ${statusFilter === 'suspended_unpaid' ? 'active' : ''}`}
            onClick={() => setStatusFilter('suspended_unpaid')}
          >
            Suspendidos ({suspendedClients})
          </button>
        </div>

        <button className="btn-secondary refresh-btn" onClick={loadData} title="Refrescar">
          <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Clients Table */}
      <div className="clients-table-card">
        {loading && clients.length === 0 ? (
          <div className="table-loading">Cargando cuentas de clientes...</div>
        ) : filteredClients.length === 0 ? (
          <div className="table-empty">
            <Users size={48} />
            <p>No se encontraron clientes con los filtros seleccionados.</p>
            <button className="btn-primary" onClick={openCreateModal}>Registrar Primer Cliente</button>
          </div>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Cliente / Empresa</th>
                <th>Usuario / Login</th>
                <th>WhatsApp OTP</th>
                <th>Sesión Asignada</th>
                <th>Cuota Mensual</th>
                <th>Próximo Cobro</th>
                <th>Estado de Pago</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
                const isSuspended = client.paymentStatus === 'suspended_unpaid' || !client.isActive;
                const assignedSession = client.allowedSessions && client.allowedSessions.length > 0
                  ? client.allowedSessions[0]
                  : 'Todas (Admin)';

                return (
                  <tr key={client.id} className={isSuspended ? 'row-suspended' : ''}>
                    <td>
                      <div className="client-name-cell">
                        <span className="client-title">{client.name}</span>
                        {client.notes && <span className="client-notes">{client.notes}</span>}
                      </div>
                    </td>

                    <td>
                      <div className="login-identity-cell">
                        <span className="username-badge">
                          {client.username ? `@${client.username}` : 'Sin usuario'}
                        </span>
                      </div>
                    </td>

                    <td>
                      {client.phone ? (
                        <a
                          href={`https://wa.me/${client.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whatsapp-link"
                          title="Contactar por WhatsApp"
                        >
                          <Phone size={14} />
                          <span>+{client.phone}</span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-muted">Sin teléfono</span>
                      )}
                    </td>

                    <td>
                      <span className="session-badge">
                        <Smartphone size={14} />
                        {assignedSession}
                      </span>
                    </td>

                    <td>
                      <span className="fee-amount">
                        ${(client.monthlyFee || 0).toLocaleString('es-CL')} CLP
                      </span>
                    </td>

                    <td>
                      <span className="billing-date">
                        <Calendar size={14} />
                        {client.nextBillingDate ? client.nextBillingDate.slice(0, 10) : 'Sin fecha'}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className={`status-pill ${isSuspended ? 'pill-suspended' : 'pill-active'}`}
                        onClick={() => handleToggleStatus(client)}
                        title={isSuspended ? 'Haz clic para REACTIVAR la cuenta' : 'Haz clic para SUSPENDER por falta de pago'}
                      >
                        {isSuspended ? (
                          <>
                            <XCircle size={14} />
                            <span>SUSPENDIDO</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={14} />
                            <span>AL DÍA / ACTIVO</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td>
                      <div className="action-buttons-cell">
                        <button
                          type="button"
                          className={`btn-action ${isSuspended ? 'btn-reactivate' : 'btn-suspend'}`}
                          onClick={() => handleToggleStatus(client)}
                          title={isSuspended ? 'Reactivar Cuenta' : 'Bloquear por No Pago'}
                        >
                          <Power size={15} />
                        </button>

                        <button
                          type="button"
                          className="btn-action btn-edit"
                          onClick={() => openEditModal(client)}
                          title="Editar Cliente"
                        >
                          <Edit2 size={15} />
                        </button>

                        {client.clientToken && (
                          <button
                            type="button"
                            className="btn-action btn-copy"
                            onClick={() => copyToken(client.id, client.clientToken!)}
                            title="Copiar Token de Acceso Directo"
                          >
                            {copiedTokenId === client.id ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-action btn-delete"
                          onClick={() => handleDeleteClient(client)}
                          title="Eliminar Cuenta"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Create/Edit */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente SaaS'}</h2>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSaveClient} className="modal-form">
              <div className="form-group">
                <label>Nombre de la Empresa o Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="ej: Sushi Icura, Pizzería Mascada, Dra. Pérez"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Nombre de Usuario (Login)</label>
                  <input
                    type="text"
                    placeholder="ej: sushiicura"
                    value={formUsername}
                    onChange={e => setFormUsername(e.target.value)}
                  />
                  <span className="field-hint">Permite al cliente ingresar con este usuario.</span>
                </div>

                <div className="form-group flex-1">
                  <label>Teléfono WhatsApp (OTP)</label>
                  <input
                    type="text"
                    placeholder="ej: 56912345678"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                  />
                  <span className="field-hint">Recibirá códigos de acceso de 6 dígitos.</span>
                </div>
              </div>

              <div className="form-group">
                <label>
                  {editingClient ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña de Acceso'}
                </label>
                <input
                  type="password"
                  placeholder="Contraseña segura"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Sesión WhatsApp Asignada (Aislamiento Total)</label>
                  <select
                    value={formSelectedSession}
                    onChange={e => setFormSelectedSession(e.target.value)}
                  >
                    <option value="">-- Sin asignar / Todas (Admin) --</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.id} ({s.status})
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">El cliente solo verá y gestionará esta línea de WhatsApp.</span>
                </div>

                <div className="form-group flex-1">
                  <label>Estado Inicial de Pago</label>
                  <select
                    value={formPaymentStatus}
                    onChange={e => setFormPaymentStatus(e.target.value as any)}
                  >
                    <option value="active">Activo / Al Día</option>
                    <option value="suspended_unpaid">Suspendido por No Pago</option>
                    <option value="trial">Período de Prueba</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Cuota Mensual ($ CLP)</label>
                  <input
                    type="number"
                    value={formMonthlyFee}
                    onChange={e => setFormMonthlyFee(Number(e.target.value))}
                  />
                </div>

                <div className="form-group flex-1">
                  <label>Próxima Fecha de Facturación / Vencimiento</label>
                  <input
                    type="date"
                    value={formNextBillingDate}
                    onChange={e => setFormNextBillingDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notas Internas (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Plan acordado, número de grupos autorizados, contacto secundario..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Guardando...' : editingClient ? 'Actualizar Cliente' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
