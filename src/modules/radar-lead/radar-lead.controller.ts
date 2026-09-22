import { Controller, Get, Put, Post, Delete, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RadarLeadService } from './radar-lead.service';
import { RadarSetting } from './entities/radar-setting.entity';
import { RadarClient } from './entities/radar-client.entity';
import { CreateRadarClientDto, UpdateRadarClientDto, UpdateRadarSettingsDto, TestEvaluateDto } from './dto/radar.dto';
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
}
