import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AiProvider = 'openrouter' | 'gemini' | 'openai' | 'custom';

@Entity('session_ai_configs')
export class SessionAiConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  sessionId!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 32, default: 'openrouter' })
  provider!: AiProvider;

  @Column({ type: 'varchar', length: 255, nullable: true })
  apiKey!: string | null;

  @Column({ type: 'varchar', length: 128, default: 'deepseek/deepseek-chat' })
  model!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  baseUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  systemPrompt!: string | null;

  @Column({ type: 'float', default: 0.7 })
  temperature!: number;

  @Column({ type: 'int', default: 400 })
  maxTokens!: number;

  @Column({ type: 'int', default: 30 })
  humanTakeoverMinutes!: number;

  @Column({ type: 'int', default: 3 })
  debounceSeconds!: number;

  @Column({ type: 'boolean', default: false })
  transcribeAudio!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  groqApiKey!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'whisper-large-v3-turbo' })
  whisperModel!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
