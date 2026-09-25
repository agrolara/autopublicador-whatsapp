import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ApiKeyRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  keyHash!: string;

  // 12 to fit the 12-char prefix that auth.service writes (was varchar(8); harmless on the
  // hardcoded-SQLite `main` connection, but kept consistent with the code).
  @Column({ type: 'varchar', length: 12 })
  keyPrefix!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: ApiKeyRole.OPERATOR,
  })
  role!: ApiKeyRole;

  @Column({ type: 'simple-array', nullable: true })
  allowedIps!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  allowedSessions!: string[] | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  usageCount!: number;

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  passwordHash!: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'active',
  })
  paymentStatus!: 'active' | 'suspended_unpaid' | 'trial';

  @Column({ type: 'int', default: 0 })
  monthlyFee!: number;

  @Column({ type: 'datetime', nullable: true })
  nextBillingDate!: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  otpCode!: string | null;

  @Column({ type: 'datetime', nullable: true })
  otpExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  clientToken!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
