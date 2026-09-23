import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAiBudgetDto {
  @ApiPropertyOptional({ description: 'Saldo inicial / recarga asignada a Groq en USD', example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  groqInitialBalance?: number;

  @ApiPropertyOptional({ description: 'Saldo inicial / recarga asignada a TypeSafe (Jevs) en USD', example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  typesafeInitialBalance?: number;

  @ApiPropertyOptional({ description: 'Saldo inicial / recarga asignada a OpenRouter en USD (para tracking offline)', example: 10.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  openrouterInitialBalance?: number;

  @ApiPropertyOptional({ description: 'Umbral en USD para alertar cuando el saldo sea bajo', example: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  costAlertThresholdUsd?: number;

  @ApiPropertyOptional({ description: 'API Key global para consultas de OpenRouter' })
  @IsOptional()
  @IsString()
  openrouterApiKeyOverride?: string;

  @ApiPropertyOptional({ description: 'API Key global para Groq' })
  @IsOptional()
  @IsString()
  groqApiKeyOverride?: string;

  @ApiPropertyOptional({ description: 'API Key global para TypeSafe (Jevs)' })
  @IsOptional()
  @IsString()
  typesafeApiKeyOverride?: string;
}

export class QueryAiLogsDto {
  @ApiPropertyOptional({ description: 'Límite de registros', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filtrar por proveedor', enum: ['openrouter', 'groq', 'typesafe', 'gemini', 'openai'] })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Filtrar por tipo de servicio', enum: ['chat', 'audio_transcription', 'semantic_validation'] })
  @IsOptional()
  @IsString()
  serviceType?: string;
}

export interface OpenRouterBalanceInfo {
  status: 'connected' | 'error' | 'unconfigured';
  isLiveApi: boolean;
  totalCredits: number;
  totalUsage: number;
  remainingCredits: number;
  keyLabel?: string;
  limit?: number | null;
  isFreeTier?: boolean;
  rateLimit?: { requests?: number; interval?: string };
  localRequestsCount: number;
  localTokensCount: number;
  localEstimatedCostUsd: number;
  lastChecked: string;
  error?: string;
}

export interface GroqBalanceInfo {
  status: 'connected' | 'unconfigured';
  initialBalance: number;
  estimatedCostUsd: number;
  remainingBalanceUsd: number;
  transcriptionsCount: number;
  audioSecondsCount: number;
  audioMinutesCount: number;
  ratePerMinuteUsd: number;
  freeTierDailyEstimate: { maxAudiosPerDay: number; usedToday: number };
  lastActivity?: string;
}

export interface TypeSafeBalanceInfo {
  status: 'connected' | 'unconfigured';
  initialBalance: number;
  estimatedCostUsd: number;
  remainingBalanceUsd: number;
  evaluationsCount: number;
  approvedLeadsCount: number;
  discardedAdsCount: number;
  ratePerEvaluationUsd: number;
  lastActivity?: string;
}

export interface CombinedAiBalanceDto {
  totalRemainingBalanceUsd: number;
  totalSpentUsd: number;
  totalRequestsCount: number;
  hasLowBalanceAlert: boolean;
  alertMessages: string[];
}

export interface AiBalanceSummaryDto {
  combined: CombinedAiBalanceDto;
  openrouter: OpenRouterBalanceInfo;
  groq: GroqBalanceInfo;
  typesafe: TypeSafeBalanceInfo;
  thresholdUsd: number;
}
