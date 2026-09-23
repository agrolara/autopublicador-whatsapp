import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type RadarLeadStatus = 'DISPATCHED' | 'DISCARDED_AI' | 'FALSE_POSITIVE' | 'DISCARDED_BLACKLIST';

@Entity('radar_lead_logs')
export class RadarLeadLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientId?: string;

  @Column({ type: 'varchar', length: 128 })
  clientName!: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  rubroKey!: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  sessionId!: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  groupId!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  groupName!: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  buyerPhone!: string;

  @Column({ type: 'text' })
  messageText!: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  matchedKeyword!: string;

  @Column({ type: 'boolean', default: false })
  aiEvaluated!: boolean;

  @Column({ type: 'float', nullable: true })
  aiScore?: number | null;

  @Column({ type: 'varchar', length: 32 })
  status!: RadarLeadStatus;

  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
