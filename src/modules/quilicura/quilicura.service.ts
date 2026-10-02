import { Injectable, Logger, OnModuleInit, Optional, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReglasAlertasConfig,
  REGLAS_ALERTAS_DEFAULT,
  DelegarGruposPayload,
} from './quilicura.types';
import { GroupTagsService } from '../contact/group-tags.service';

@Injectable()
export class QuilicuraService implements OnModuleInit {
  private readonly logger = new Logger(QuilicuraService.name);
  private readonly rulesFilePath = path.join(process.cwd(), 'data', 'reglas-jev.json');
  private cachedRules: ReglasAlertasConfig = REGLAS_ALERTAS_DEFAULT;

  constructor(
    @Optional()
    @Inject(forwardRef(() => GroupTagsService))
    private readonly groupTagsService?: GroupTagsService,
  ) {}

  onModuleInit() {
    this.loadLocalRules();
  }

  get termometroUrl(): string {
    return (
      process.env.QUILICURA_API_URL ||
      process.env.TERMOMETRO_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  /**
   * Carga las reglas de alertas almacenadas localmente en data/reglas-jev.json
   */
  private loadLocalRules(): ReglasAlertasConfig {
    try {
      if (fs.existsSync(this.rulesFilePath)) {
        const raw = fs.readFileSync(this.rulesFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        const rules = parsed.reglasAlertas || parsed;
        if (rules && rules.categorias) {
          this.cachedRules = rules;
          return this.cachedRules;
        }
      }
    } catch (e: any) {
      this.logger.warn(`Error al leer ${this.rulesFilePath}: ${e?.message}`);
    }
    this.cachedRules = REGLAS_ALERTAS_DEFAULT;
    this.saveLocalRules(this.cachedRules);
    return this.cachedRules;
  }

  /**
   * Guarda las reglas de alertas localmente en data/reglas-jev.json
   */
  private saveLocalRules(rules: ReglasAlertasConfig): void {
    try {
      const dir = path.dirname(this.rulesFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.rulesFilePath,
        JSON.stringify({ reglasAlertas: rules }, null, 2),
        'utf8',
      );
    } catch (e: any) {
      this.logger.error(`Error al guardar en ${this.rulesFilePath}: ${e?.message}`);
    }
  }

  /**
   * Obtiene las reglas de alertas JEV.
   * Intenta consultar al Termómetro Comunal y si no responde, devuelve la copia local de OpenWA.
   */
  async getReglasAlertas(): Promise<{
    reglasAlertas: ReglasAlertasConfig;
    source: 'termometro' | 'local';
    termometroOnline: boolean;
  }> {
    try {
      const res = await fetch(`${this.termometroUrl}/api/reglas-alertas`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        const rules = data.reglasAlertas || data;
        if (rules && rules.categorias) {
          this.cachedRules = rules;
          this.saveLocalRules(rules);
          return {
            reglasAlertas: rules,
            source: 'termometro',
            termometroOnline: true,
          };
        }
      }
    } catch (err: any) {
      this.logger.debug(
        `Termómetro Comunal (${this.termometroUrl}) no disponible para GET reglas: ${err?.message}`,
      );
    }

    return {
      reglasAlertas: this.loadLocalRules(),
      source: 'local',
      termometroOnline: false,
    };
  }

  /**
   * Guarda y sincroniza las reglas de alertas JEV tanto localmente en OpenWA como en el Termómetro Comunal.
   */
  async saveReglasAlertas(rules: ReglasAlertasConfig): Promise<{
    exito: boolean;
    syncedToTermometro: boolean;
    mensaje: string;
    reglasAlertas: ReglasAlertasConfig;
  }> {
    // 1. Guardado persistente local en OpenWA
    this.cachedRules = rules;
    this.saveLocalRules(rules);

    // 2. Envío al backend de la Alcaldía (POST http://localhost:3000/api/reglas-alertas)
    let synced = false;
    let feedback = 'Reglas JEV guardadas correctamente en OpenWA.';

    try {
      const payload = { reglasAlertas: rules };
      const res = await fetch(`${this.termometroUrl}/api/reglas-alertas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        synced = true;
        feedback = 'Reglas JEV guardadas y sincronizadas exitosamente con el Termómetro Comunal de Quilicura.';
        this.logger.log(`Reglas JEV sincronizadas exitosamente con ${this.termometroUrl}/api/reglas-alertas`);
      } else {
        feedback = `Guardadas en OpenWA, pero el servidor de Alcaldía respondió con código HTTP ${res.status}.`;
        this.logger.warn(`Respuesta no exitosa de Alcaldía: ${res.status}`);
      }
    } catch (e: any) {
      synced = false;
      feedback = `Guardadas en OpenWA. El servidor del Termómetro Comunal (${this.termometroUrl}) está offline de momento.`;
      this.logger.log(`Sincronización con Termómetro en espera (offline): ${e?.message}`);
    }

    return {
      exito: true,
      syncedToTermometro: synced,
      mensaje: feedback,
      reglasAlertas: this.cachedRules,
    };
  }

  /**
   * Resuelve los grupos asociados a la categoría "alcaldia" en OpenWA
   */
  getGruposAlcaldia(): Array<{ id: string; name: string }> {
    if (!this.groupTagsService) return [];
    const tags = this.groupTagsService.getTags();
    const alcaldiaTag = tags.find(t =>
      /^(alcaldia|alcald[ií]a)$/i.test(t.name.trim()),
    );

    if (!alcaldiaTag || !alcaldiaTag.groupIds || alcaldiaTag.groupIds.length === 0) {
      return [];
    }

    // Resolver nombres desde el catálogo de grupos si está disponible
    const catalog = this.loadGroupCatalog();
    const catalogMap = new Map<string, string>();
    for (const item of catalog) {
      if (item.id && item.name) {
        catalogMap.set(item.id, item.name);
      }
    }

    return alcaldiaTag.groupIds.map(gid => ({
      id: gid,
      name: catalogMap.get(gid) || 'Canal Vecinal Quilicura',
    }));
  }

  private loadGroupCatalog(): Array<{ id: string; name: string }> {
    try {
      const catalogPath = path.join(process.cwd(), 'data', 'group-catalog.json');
      if (fs.existsSync(catalogPath)) {
        const raw = fs.readFileSync(catalogPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  /**
   * Sincroniza los grupos delegados de la categoría "alcaldia" enviando un POST a:
   * http://localhost:3000/api/openwa/delegar-grupos
   */
  async syncGruposAlcaldia(
    gruposExplicit?: Array<{ id: string; name: string }>,
  ): Promise<{
    exito: boolean;
    synced: boolean;
    categoria: string;
    total: number;
    mensaje: string;
    grupos: Array<{ id: string; name: string }>;
  }> {
    const grupos = gruposExplicit ?? this.getGruposAlcaldia();
    const payload: DelegarGruposPayload = {
      categoria: 'alcaldia',
      grupos,
    };

    let synced = false;
    let mensaje = `Se identificaron ${grupos.length} grupos en la categoría "alcaldia".`;

    try {
      this.logger.log(
        `Enviando delegación de ${grupos.length} grupos a ${this.termometroUrl}/api/openwa/delegar-grupos...`,
      );
      const res = await fetch(`${this.termometroUrl}/api/openwa/delegar-grupos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const resData = await res.json();
        synced = true;
        mensaje = resData.mensaje || `Se sincronizaron exitosamente ${grupos.length} grupos con el Termómetro Comunal de Quilicura.`;
        this.logger.log(`Sincronización exitosa: ${mensaje}`);
      } else {
        mensaje = `Error HTTP ${res.status} al sincronizar con ${this.termometroUrl}/api/openwa/delegar-grupos`;
        this.logger.warn(mensaje);
      }
    } catch (e: any) {
      synced = false;
      mensaje = `Sincronización registrada en OpenWA. Servidor de Alcaldía (${this.termometroUrl}) no alcanzable en este momento (${e?.message}).`;
      this.logger.log(mensaje);
    }

    return {
      exito: true,
      synced,
      categoria: 'alcaldia',
      total: grupos.length,
      mensaje,
      grupos,
    };
  }

  /**
   * Estado general de la integración con el Termómetro Comunal
   */
  async getStatus(): Promise<{
    online: boolean;
    url: string;
    gruposAlcaldiaCount: number;
    grupos: Array<{ id: string; name: string }>;
  }> {
    const grupos = this.getGruposAlcaldia();
    let online = false;

    try {
      const res = await fetch(`${this.termometroUrl}/api/reglas-alertas`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      online = res.ok;
    } catch {
      online = false;
    }

    return {
      online,
      url: this.termometroUrl,
      gruposAlcaldiaCount: grupos.length,
      grupos,
    };
  }
}
