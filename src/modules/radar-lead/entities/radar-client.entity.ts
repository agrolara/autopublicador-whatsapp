import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export const DEFAULT_RADAR_ALERT_TEMPLATE = `🚨 *¡NUEVO LEAD DETECTADO EN RADAR!* 🚨

📂 *Rubro:* {rubro}
👥 *Grupo:* {grupo}
👤 *Comprador:* +{comprador_telefono}
💬 *Mensaje:*
"{mensaje_comprador}"

📲 *Hablarle directo por WhatsApp:*
{enlace_whatsapp}`;

export type ClientGroupFilterMode = 'GLOBAL' | 'ALL' | 'CATEGORY' | 'WHITELIST';

@Entity('radar_clients')
export class RadarClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  rubroKey!: string;

  @Column({ type: 'varchar', length: 32 })
  targetPhone!: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  senderSessionId!: string;

  @Column({ type: 'text', default: '' })
  localKeywords!: string;

  @Column({ type: 'text', nullable: true })
  jevPromptCriteria!: string | null;

  @Column({ type: 'boolean', default: true })
  useAiFilter!: boolean;

  @Column({ type: 'text', default: DEFAULT_RADAR_ALERT_TEMPLATE })
  alertTemplate!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'text', default: '[]' })
  blacklistedSenders!: string; // JSON array of blacklisted phone numbers/JIDs

  @Column({ type: 'text', default: '[]' })
  negativePhrases!: string; // JSON array of negative phrases/keywords

  @Column({ type: 'varchar', length: 32, default: 'GLOBAL' })
  groupFilterMode!: ClientGroupFilterMode;

  @Column({ type: 'text', default: '' })
  groupCategoryKeywords!: string; // Comma-separated location/group keywords for this client

  @Column({ type: 'text', default: '[]' })
  groupCategoryTags!: string; // JSON array of GroupTag IDs assigned to this client

  @Column({ type: 'text', default: '[]' })
  whitelistedGroupIds!: string; // JSON array of group JIDs allowed for this client

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
