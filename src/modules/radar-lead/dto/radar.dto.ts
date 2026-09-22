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

  @ApiPropertyOptional({ description: 'Plantilla de mensaje de alerta para WhatsApp' })
  @IsOptional()
  @IsString()
  alertTemplate?: string;

  @ApiPropertyOptional({ description: 'Estado activo/pausado del cliente', default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
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

  @ApiPropertyOptional({ description: 'Plantilla de mensaje de alerta para WhatsApp' })
  @IsOptional()
  @IsString()
  alertTemplate?: string;

  @ApiPropertyOptional({ description: 'Estado activo/pausado del cliente' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
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
}
