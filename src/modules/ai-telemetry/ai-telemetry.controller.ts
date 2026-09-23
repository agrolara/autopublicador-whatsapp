import { Controller, Get, Put, Delete, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiTelemetryService } from './ai-telemetry.service';
import { AiBalanceSummaryDto, UpdateAiBudgetDto, QueryAiLogsDto } from './dto/ai-telemetry.dto';
import { AiBudgetConfig } from './entities/ai-budget-config.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('ai-telemetry')
@Controller('ai-telemetry')
export class AiTelemetryController {
  constructor(private readonly aiTelemetryService: AiTelemetryService) {}

  @Get('balances')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Obtener saldos, costos estimados y métricas en vivo de OpenRouter, Groq y TypeSafe' })
  @ApiResponse({ status: 200, description: 'Resumen consolidado de saldos y consumo' })
  async getBalances(): Promise<AiBalanceSummaryDto> {
    return this.aiTelemetryService.getBalances();
  }

  @Get('budget')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Obtener configuración de presupuesto y saldos iniciales' })
  @ApiResponse({ status: 200, description: 'Configuración de presupuesto actual' })
  async getBudget(): Promise<AiBudgetConfig> {
    return this.aiTelemetryService.getBudgetConfig();
  }

  @Put('budget')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Actualizar configuración de presupuesto y saldos iniciales' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  async updateBudget(@Body() dto: UpdateAiBudgetDto): Promise<AiBudgetConfig> {
    return this.aiTelemetryService.updateBudget(dto);
  }

  @Get('logs')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Listar historial cronológico de consumos de IA' })
  @ApiResponse({ status: 200, description: 'Lista de registros de uso' })
  async getLogs(@Query() query: QueryAiLogsDto): Promise<AiUsageLog[]> {
    return this.aiTelemetryService.getLogs(query);
  }

  @Delete('logs')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Limpiar registros históricos de consumo de IA' })
  @ApiResponse({ status: 200, description: 'Historial eliminado' })
  async clearLogs(): Promise<{ success: boolean }> {
    return this.aiTelemetryService.clearLogs();
  }
}
