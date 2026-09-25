import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateClientAccountDto, UpdateClientAccountDto, ClientAccountResponseDto } from './dto';
import { RequireRole } from './decorators/auth.decorators';
import { ApiKeyRole } from './entities/api-key.entity';

@ApiTags('clients')
@Controller('auth/clients')
@RequireRole(ApiKeyRole.ADMIN)
export class ClientsController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'List all client accounts (admin only)' })
  @ApiResponse({ status: 200, type: [ClientAccountResponseDto] })
  async listClients(): Promise<ClientAccountResponseDto[]> {
    const clients = await this.authService.listClientAccounts();
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      username: c.username,
      phone: c.phone,
      role: c.role,
      allowedSessions: c.allowedSessions || undefined,
      paymentStatus: c.paymentStatus || 'active',
      isActive: c.isActive,
      monthlyFee: c.monthlyFee || 0,
      nextBillingDate: c.nextBillingDate || undefined,
      lastUsedAt: c.lastUsedAt || undefined,
      createdAt: c.createdAt,
      notes: c.notes || undefined,
      clientToken: c.clientToken || undefined,
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client account by ID (admin only)' })
  @ApiResponse({ status: 200, type: ClientAccountResponseDto })
  async getClient(@Param('id') id: string): Promise<ClientAccountResponseDto> {
    const c = await this.authService.getClientAccount(id);
    return {
      id: c.id,
      name: c.name,
      username: c.username,
      phone: c.phone,
      role: c.role,
      allowedSessions: c.allowedSessions || undefined,
      paymentStatus: c.paymentStatus || 'active',
      isActive: c.isActive,
      monthlyFee: c.monthlyFee || 0,
      nextBillingDate: c.nextBillingDate || undefined,
      lastUsedAt: c.lastUsedAt || undefined,
      createdAt: c.createdAt,
      notes: c.notes || undefined,
      clientToken: c.clientToken || undefined,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create new client account (admin only)' })
  @ApiResponse({ status: 201, type: ClientAccountResponseDto })
  async createClient(@Body() dto: CreateClientAccountDto): Promise<ClientAccountResponseDto> {
    const { client, rawKey } = await this.authService.createClientAccount(dto);
    return {
      id: client.id,
      name: client.name,
      username: client.username,
      phone: client.phone,
      role: client.role,
      allowedSessions: client.allowedSessions || undefined,
      paymentStatus: client.paymentStatus,
      isActive: client.isActive,
      monthlyFee: client.monthlyFee,
      nextBillingDate: client.nextBillingDate || undefined,
      lastUsedAt: client.lastUsedAt || undefined,
      createdAt: client.createdAt,
      notes: client.notes || undefined,
      clientToken: rawKey,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client account or toggle payment status (admin only)' })
  @ApiResponse({ status: 200, type: ClientAccountResponseDto })
  async updateClient(
    @Param('id') id: string,
    @Body() dto: UpdateClientAccountDto,
  ): Promise<ClientAccountResponseDto> {
    const c = await this.authService.updateClientAccount(id, dto);
    return {
      id: c.id,
      name: c.name,
      username: c.username,
      phone: c.phone,
      role: c.role,
      allowedSessions: c.allowedSessions || undefined,
      paymentStatus: c.paymentStatus,
      isActive: c.isActive,
      monthlyFee: c.monthlyFee,
      nextBillingDate: c.nextBillingDate || undefined,
      lastUsedAt: c.lastUsedAt || undefined,
      createdAt: c.createdAt,
      notes: c.notes || undefined,
      clientToken: c.clientToken || undefined,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete client account (admin only)' })
  @ApiResponse({ status: 204 })
  async deleteClient(@Param('id') id: string): Promise<void> {
    await this.authService.deleteClientAccount(id);
  }
}
