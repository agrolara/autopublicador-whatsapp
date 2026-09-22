import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export type GroupFilterMode = 'ALL' | 'CATEGORY' | 'WHITELIST';

@Entity('radar_settings')
export class RadarSetting {
  @PrimaryColumn({ type: 'varchar', length: 32, default: 'default' })
  id!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'int', default: 8 })
  minTextLength!: number;

  @Column({ type: 'boolean', default: true })
  ignoreMediaWithoutCaption!: boolean;

  @Column({ type: 'varchar', length: 32, default: 'ALL' })
  groupFilterMode!: GroupFilterMode;

  @Column({ type: 'text', default: 'quilicura,valle lo campino,valle grande' })
  groupCategoryKeywords!: string;

  @Column({ type: 'text', default: '[]' })
  whitelistedGroupIds!: string; // JSON array of group JIDs

  @Column({ type: 'text', default: '[]' })
  activeScanningSessions!: string; // JSON array of session IDs

  @Column({ type: 'int', default: 30 })
  dedupWindowSeconds!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
