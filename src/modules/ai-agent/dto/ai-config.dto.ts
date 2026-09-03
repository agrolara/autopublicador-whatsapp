import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateAiConfigDto {
  @ApiPropertyOptional({ description: 'Enable or disable AI agent for this session' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'AI Provider', enum: ['openrouter', 'gemini', 'openai', 'custom'] })
  @IsOptional()
  @IsEnum(['openrouter', 'gemini', 'openai', 'custom'])
  provider?: 'openrouter' | 'gemini' | 'openai' | 'custom';

  @ApiPropertyOptional({ description: 'API Key for the provider' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Model identifier (e.g. gemini-2.0-flash, deepseek/deepseek-chat, gpt-4o-mini)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  @ApiPropertyOptional({ description: 'Base URL for custom OpenAI-compatible endpoints' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'System prompt / context of the business' })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ description: 'Sampling temperature (0.0 - 1.0)', default: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Maximum tokens to generate', default: 400 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2000)
  maxTokens?: number;

  @ApiPropertyOptional({ description: 'Minutes to silence AI if human operator replies', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  humanTakeoverMinutes?: number;

  @ApiPropertyOptional({ description: 'Seconds to buffer incoming burst messages', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  debounceSeconds?: number;

  @ApiPropertyOptional({ description: 'Enable voice notes transcription via Groq Whisper', default: false })
  @IsOptional()
  @IsBoolean()
  transcribeAudio?: boolean;

  @ApiPropertyOptional({ description: 'API Key for Groq Whisper' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  groqApiKey?: string;

  @ApiPropertyOptional({ description: 'Groq Whisper model', default: 'whisper-large-v3-turbo' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  whisperModel?: string;
}

export class TestAiPromptDto {
  @ApiProperty({ description: 'Provider to test', enum: ['openrouter', 'gemini', 'openai', 'custom'] })
  @IsEnum(['openrouter', 'gemini', 'openai', 'custom'])
  provider!: 'openrouter' | 'gemini' | 'openai' | 'custom';

  @ApiPropertyOptional({ description: 'API Key to test' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ description: 'Model identifier' })
  @IsString()
  model!: string;

  @ApiPropertyOptional({ description: 'Base URL for custom endpoint' })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiProperty({ description: 'System prompt to test' })
  @IsString()
  systemPrompt!: string;

  @ApiProperty({ description: 'User test message' })
  @IsString()
  userMessage!: string;

  @ApiPropertyOptional({ description: 'Temperature' })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Max tokens' })
  @IsOptional()
  @IsInt()
  maxTokens?: number;
}
