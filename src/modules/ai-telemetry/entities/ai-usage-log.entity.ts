import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type AiTelemetryProvider = 'openrouter' | 'groq' | 'typesafe' | 'gemini' | 'openai';
export type AiServiceType =
  | 'chat'
  | 'audio_transcription'
  | 'semantic_validation'
  | 'chat_llm'
  | 'audio_stt'
  | 'radar_eval'
  | 'custom';

@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  provider!: AiTelemetryProvider;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  serviceType!: AiServiceType;

  @Column({ type: 'varchar', length: 128 })
  model!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId!: string | null;

  @Column({ type: 'int', default: 0 })
  promptTokens!: number;

  @Column({ type: 'int', default: 0 })
  completionTokens!: number;

  @Column({ type: 'int', default: 0 })
  totalTokens!: number;

  @Column({ type: 'float', default: 0.0 })
  audioSeconds!: number;

  @Column({ type: 'float', default: 0.0 })
  costUsd!: number;

  @Column({ type: 'boolean', default: true })
  success!: boolean;

  @Column({ type: 'text', nullable: true })
  errorDetails!: string | null;

  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
