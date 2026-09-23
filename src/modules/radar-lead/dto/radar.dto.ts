import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { GroupFilterMode } from '../entities/radar-setting.entity';

export class UpdateRadarSettingsDto {
  @ApiPropertyOptional({ description: 'Interruptor Maestro del Radar de Leads' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Longitud mínima de texto para analizar', default: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  minTextLength?: number;

  @ApiPropertyOptional({ description: 'Ignorar fotos/videos/stickers sin texto explicativo', default: true })
  @IsOptional()
  @IsBoolean()
  ignoreMediaWithoutCaption?: boolean;

  @ApiPropertyOptional({ description: 'Modo de filtrado de grupos', enum: ['ALL', 'CATEGORY', 'WHITELIST'] })
  @IsOptional()
  @IsEnum(['ALL', 'CATEGORY', 'WHITELIST'])
  groupFilterMode?: GroupFilterMode;

  @ApiPropertyOptional({ description: 'Palabras clave en el nombre del grupo para filtrar por categoría' })
  @IsOptional()
  @IsString()
  groupCategoryKeywords?: string;

  @ApiPropertyOptional({ description: 'Lista blanca de IDs de grupos permitidos', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whitelistedGroupIds?: string[];

  @ApiPropertyOptional({ description: 'IDs de sesiones de WhatsApp que realizan el escaneo', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activeScanningSessions?: string[];

  @ApiPropertyOptional({ description: 'Ventana de deduplicación en segundos para evitar alertas dobles', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  dedupWindowSeconds?: number;

  @ApiPropertyOptional({ description: 'Habilitar validación semántica con IA (filtro anti-vendedores)', default: true })
  @IsOptional()
  @IsBoolean()
  aiSemanticEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Proveedor de IA para análisis semántico (ej: typesafe)', default: 'typesafe' })
  @IsOptional()
  @IsString()
  aiProvider?: string;

  @ApiPropertyOptional({ description: 'API Key de TypeSafe para el modelo jev-latest' })
  @IsOptional()
  @IsString()
  typesafeApiKey?: string;

  @ApiPropertyOptional({ description: 'Lista negra global de teléfonos emisores a descartar en 0 ms', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  globalBlacklistedSenders?: string[];
}

export class CreateRadarClientDto {
  @ApiProperty({ description: 'Nombre del cliente o negocio', example: 'Pizzería La Mascada' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Clave única del rubro', example: 'pizza' })
  @IsString()
  rubroKey!: string;

  @ApiProperty({ description: 'Teléfono destino de WhatsApp que recibe la alerta (con código de país)', example: '56912345678' })
  @IsString()
  targetPhone!: string;

  @ApiPropertyOptional({ description: 'ID de la sesión de WhatsApp emisora de la alerta' })
  @IsOptional()
  @IsString()
  senderSessionId?: string;

  @ApiProperty({ description: 'Palabras clave locales separadas por coma', example: 'pizza,pizzer,bajon,queso,familiar,churre' })
  @IsString()
  localKeywords!: string;

  @ApiPropertyOptional({ description: 'Criterio semántico o notas del cliente' })
  @IsOptional()
  @IsString()
  jevPromptCriteria?: string;

  @ApiPropertyOptional({ description: 'Activar filtro de intención con IA para este rubro', default: true })
  @IsOptional()
  @IsBoolean()
  useAiFilter?: boolean;

  @ApiPropertyOptional({ description: 'Plantilla de mensaje de alerta para WhatsApp' })
  @IsOptional()
  @IsString()
  alertTemplate?: string;

  @ApiPropertyOptional({ description: 'Estado activo/pausado del cliente', default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Lista de teléfonos emisores bloqueados para este cliente', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedSenders?: string[];

  @ApiPropertyOptional({ description: 'Lista de frases/palabras clave negativas a auto-descartar', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  negativePhrases?: string[];
}

export class UpdateRadarClientDto {
  @ApiPropertyOptional({ description: 'Nombre del cliente o negocio' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Clave única del rubro' })
  @IsOptional()
  @IsString()
  rubroKey?: string;

  @ApiPropertyOptional({ description: 'Teléfono destino de WhatsApp que recibe la alerta' })
  @IsOptional()
  @IsString()
  targetPhone?: string;

  @ApiPropertyOptional({ description: 'ID de la sesión de WhatsApp emisora de la alerta' })
  @IsOptional()
  @IsString()
  senderSessionId?: string;

  @ApiPropertyOptional({ description: 'Palabras clave locales separadas por coma' })
  @IsOptional()
  @IsString()
  localKeywords?: string;

  @ApiPropertyOptional({ description: 'Criterio semántico o notas del cliente' })
  @IsOptional()
  @IsString()
  jevPromptCriteria?: string;

  @ApiPropertyOptional({ description: 'Activar filtro de intención con IA para este rubro' })
  @IsOptional()
  @IsBoolean()
  useAiFilter?: boolean;

  @ApiPropertyOptional({ description: 'Plantilla de mensaje de alerta para WhatsApp' })
  @IsOptional()
  @IsString()
  alertTemplate?: string;

  @ApiPropertyOptional({ description: 'Estado activo/pausado del cliente' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Lista de teléfonos emisores bloqueados para este cliente', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedSenders?: string[];

  @ApiPropertyOptional({ description: 'Lista de frases/palabras clave negativas a auto-descartar', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  negativePhrases?: string[];
}

export class TestEvaluateDto {
  @ApiProperty({ description: 'Mensaje de prueba simulado', example: 'Hola vecinos, ¿alguien vende pizzas familiares a domicilio ahora?' })
  @IsString()
  text!: string;

  @ApiPropertyOptional({ description: 'Nombre del grupo simulado', example: 'Vecinos Quilicura Valle Lo Campino' })
  @IsOptional()
  @IsString()
  groupName?: string;

  @ApiPropertyOptional({ description: 'Teléfono simulado del comprador', example: '56987654321' })
  @IsOptional()
  @IsString()
  senderPhone?: string;

  @ApiPropertyOptional({ description: 'Sesión simulada', example: 'pizzeria' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Guardar evento en historial de telemetría', default: true })
  @IsOptional()
  @IsBoolean()
  recordLog?: boolean;
}

export class QueryRadarLogsDto {
  @ApiPropertyOptional({ description: 'Límite de registros a retornar', default: 50 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtrar por ID de cliente' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado: DISPATCHED, DISCARDED_AI o FALSE_POSITIVE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class FlagNegativeLeadDto {
  @ApiPropertyOptional({ description: 'Bloquear el teléfono del remitente del mensaje', default: true })
  @IsOptional()
  @IsBoolean()
  blockPhone?: boolean;

  @ApiPropertyOptional({ description: 'Lista explícita de teléfonos a bloquear', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockPhones?: string[];

  @ApiPropertyOptional({ description: 'Otros teléfonos encontrados en el texto a bloquear', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraPhonesToBlock?: string[];

  @ApiPropertyOptional({ description: 'Frase o texto a agregar a la lista de auto-descarte' })
  @IsOptional()
  @IsString()
  negativePhrase?: string;

  @ApiPropertyOptional({ description: 'Alcance del bloqueo (client o global)', default: 'client' })
  @IsOptional()
  @IsString()
  scope?: 'client' | 'global' | 'CLIENT' | 'GLOBAL';

  @ApiPropertyOptional({ description: 'Alcance del bloqueo: CLIENT (solo este cliente) o GLOBAL (todos los clientes)', default: 'CLIENT' })
  @IsOptional()
  @IsString()
  blockScope?: 'CLIENT' | 'GLOBAL';
}

export interface ClientMetricsDto {
  clientId: string;
  clientName: string;
  rubroKey: string;
  totalMatches: number;
  approvedLeads: number;
  discardedAds: number;
  falsePositives: number;
  accuracyRate: number;
  blacklistedCount: number;
}

export interface RadarMetricsSummaryDto {
  global: {
    totalMatches: number;
    approvedLeads: number;
    discardedAds: number;
    falsePositives: number;
    accuracyRate: number;
  };
  byClient: ClientMetricsDto[];
}
