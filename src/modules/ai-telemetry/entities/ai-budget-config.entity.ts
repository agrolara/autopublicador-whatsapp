import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('ai_budget_configs')
export class AiBudgetConfig {
  @PrimaryColumn({ type: 'varchar', length: 32, default: 'default' })
  id: string = 'default';

  @Column({ type: 'float', default: 5.0 })
  groqInitialBalance!: number;

  @Column({ type: 'float', default: 5.0 })
  typesafeInitialBalance!: number;

  @Column({ type: 'float', default: 10.0 })
  openrouterInitialBalance!: number;

  @Column({ type: 'float', default: 1.0 })
  costAlertThresholdUsd!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  openrouterApiKeyOverride!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  groqApiKeyOverride!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  typesafeApiKeyOverride!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
