import { Controller, Get, Put, Post, Delete, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RadarLeadService } from './radar-lead.service';
import { RadarSetting } from './entities/radar-setting.entity';
import { RadarClient } from './entities/radar-client.entity';
import { RadarLeadLog } from './entities/radar-lead-log.entity';
import {
  CreateRadarClientDto,
  UpdateRadarClientDto,
  UpdateRadarSettingsDto,
  TestEvaluateDto,
  QueryRadarLogsDto,
  FlagNegativeLeadDto,
  SaveGroupCategoryTagDto,
} from './dto/radar.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('radar')
@Controller('radar')
export class RadarLeadController {
  constructor(private readonly radarLeadService: RadarLeadService) {}

  @Get('settings')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Obtener configuración global del Radar de Leads' })
  @ApiResponse({ status: 200, description: 'Configuración del radar' })
  async getSettings(): Promise<RadarSetting> {
    return this.radarLeadService.getSettings();
  }

  @Put('settings')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Actualizar configuración global del Radar de Leads' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  async updateSettings(@Body() dto: UpdateRadarSettingsDto): Promise<RadarSetting> {
    return this.radarLeadService.updateSettings(dto);
  }

  @Get('clients')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Listar todos los clientes y rubros configurados' })
  @ApiResponse({ status: 200, description: 'Lista de clientes de radar' })
  async getClients(): Promise<RadarClient[]> {
    return this.radarLeadService.getClients();
  }

  @Post('clients')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Crear un nuevo cliente o rubro para monitoreo' })
  @ApiResponse({ status: 201, description: 'Cliente creado exitosamente' })
  async createClient(@Body() dto: CreateRadarClientDto): Promise<RadarClient> {
    return this.radarLeadService.createClient(dto);
  }

  @Put('clients/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Actualizar un cliente o rubro existente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente actualizado exitosamente' })
  async updateClient(
    @Param('id') id: string,
    @Body() dto: UpdateRadarClientDto,
  ): Promise<RadarClient> {
    return this.radarLeadService.updateClient(id, dto);
  }

  @Delete('clients/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Eliminar un cliente o rubro' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Resultado de eliminación' })
  async deleteClient(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.radarLeadService.deleteClient(id);
    return { success };
  }

  @Patch('clients/:id/toggle')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Alternar activación (pausar/activar) de un cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente actualizado' })
  async toggleClient(@Param('id') id: string): Promise<RadarClient> {
    return this.radarLeadService.toggleClient(id);
  }

  @Get('groups')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Listar grupos disponibles de las sesiones activas para selección' })
  @ApiResponse({ status: 200, description: 'Lista de grupos' })
  async getAvailableGroups(): Promise<Array<{ id: string; name: string; sessionCount: number; sessions: string[] }>> {
    return this.radarLeadService.getAvailableGroups();
  }

  @Post('test-evaluate')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Simular evaluación de mensaje para probar clientes y plantillas' })
  @ApiResponse({ status: 200, description: 'Resultado de la simulación' })
  async testEvaluate(@Body() dto: TestEvaluateDto) {
    return this.radarLeadService.testEvaluate(dto);
  }

  @Get('logs')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Obtener historial reciente de leads y eventos de radar' })
  @ApiResponse({ status: 200, description: 'Lista de logs de leads' })
  async getLogs(@Query() query: QueryRadarLogsDto): Promise<RadarLeadLog[]> {
    return this.radarLeadService.getLogs(query);
  }

  @Get('metrics')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Obtener métricas y contadores de rendimiento de radar' })
  @ApiResponse({ status: 200, description: 'Métricas de radar' })
  async getMetrics() {
    return this.radarLeadService.getMetrics();
  }

  @Delete('logs')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Vaciar historial de leads' })
  @ApiResponse({ status: 200, description: 'Historial eliminado' })
  async clearLogs(): Promise<{ success: boolean }> {
    return this.radarLeadService.clearLogs();
  }

  @Post('logs/:id/flag-negative')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Marcar lead como Falso Positivo / Negativo y bloquear teléfono/frases' })
  @ApiParam({ name: 'id', description: 'ID del log de lead' })
  @ApiResponse({ status: 200, description: 'Lead marcado como falso positivo y lista negra actualizada' })
  async flagNegativeLead(@Param('id') id: string, @Body() dto: FlagNegativeLeadDto) {
    return this.radarLeadService.flagNegativeLead(id, dto);
  }

  @Delete('clients/:id/blacklist/phones/:phone')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Desbloquear un teléfono de la lista negra del cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiParam({ name: 'phone', description: 'Teléfono a desbloquear' })
  @ApiResponse({ status: 200, description: 'Teléfono desbloqueado' })
  async unblockPhone(@Param('id') id: string, @Param('phone') phone: string) {
    return this.radarLeadService.unblockPhone(id, phone);
  }

  @Delete('clients/:id/blacklist/phrases')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Eliminar una frase de la lista negra del cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Frase eliminada de lista negra' })
  async removeNegativePhrase(@Param('id') id: string, @Query('phrase') phrase: string) {
    return this.radarLeadService.removeNegativePhrase(id, phrase);
  }

  @Get('group-tags')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Obtener todas las categorías y segmentaciones de grupos' })
  @ApiResponse({ status: 200, description: 'Lista de categorías de grupos' })
  async getGroupTags() {
    return this.radarLeadService.getGroupTags();
  }

  @Post('group-tags')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Crear o editar una categoría/segmentación de grupos' })
  @ApiResponse({ status: 201, description: 'Categoría guardada exitosamente' })
  async saveGroupTag(@Body() dto: SaveGroupCategoryTagDto) {
    return this.radarLeadService.saveGroupTag(dto);
  }

  @Delete('group-tags/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Eliminar una categoría/segmentación de grupos' })
  @ApiParam({ name: 'id', description: 'ID de la categoría' })
  @ApiResponse({ status: 200, description: 'Categoría eliminada' })
  async deleteGroupTag(@Param('id') id: string) {
    return this.radarLeadService.deleteGroupTag(id);
  }
}

