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
  groupCategoryTags!: string; // JSON array of GroupTag IDs for global category filtering

  @Column({ type: 'text', default: '[]' })
  whitelistedGroupIds!: string; // JSON array of group JIDs

  @Column({ type: 'text', default: '[]' })
  activeScanningSessions!: string; // JSON array of session IDs

  @Column({ type: 'int', default: 30 })
  dedupWindowSeconds!: number;

  @Column({ type: 'int', default: 60 })
  crossGroupDedupMinutes!: number; // Anti-repetición de alertas entre distintos grupos (minutos)

  @Column({ type: 'boolean', default: true })
  aiSemanticEnabled!: boolean;

  @Column({ type: 'varchar', length: 32, default: 'typesafe' })
  aiProvider!: string;

  @Column({ type: 'text', default: 'apikey_2199a480d31c3450450c8efa2ecc4c6d9d0d_6c18d62803e10160629944a9079e8ffcf825fa1f40caba0ebeea8e1fcfd57e5b' })
  typesafeApiKey!: string;

  @Column({ type: 'text', default: '[]' })
  globalBlacklistedSenders!: string; // JSON array of blacklisted phone numbers/JIDs

  @UpdateDateColumn()
  updatedAt!: Date;
}
