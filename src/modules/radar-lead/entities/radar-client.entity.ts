import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export const DEFAULT_RADAR_ALERT_TEMPLATE = `🚨 *¡NUEVO LEAD DETECTADO EN RADAR!* 🚨

📂 *Rubro:* {rubro}
👥 *Grupo:* {grupo}
👤 *Comprador:* +{comprador_telefono}
💬 *Mensaje:*
"{mensaje_comprador}"

📲 *Hablarle directo por WhatsApp:*
{enlace_whatsapp}`;

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
