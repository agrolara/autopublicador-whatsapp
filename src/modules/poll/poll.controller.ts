import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import type { Response } from 'express';
import { PollService } from './poll.service';
import { CreatePollDto, UpdatePollDto, PollDetailResponse } from './dto/poll.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('polls')
@ApiSecurity('api-key')
@RequireRole(ApiKeyRole.OPERATOR)
@Controller('polls')
export class PollController {
  constructor(private readonly pollService: PollService) {}

  @Get()
  @ApiOperation({ summary: 'List all polls with summarized metrics' })
  @ApiResponse({ status: 200, description: 'Polls retrieved successfully' })
  async getPolls(@Query('sessionId') sessionId?: string): Promise<PollDetailResponse[]> {
    return this.pollService.getPolls(sessionId);
  }

  @Post()
  @ApiOperation({ summary: 'Create and launch a new WhatsApp native poll' })
  @ApiResponse({ status: 201, description: 'Poll created and dispatched' })
  async createPoll(@Body() dto: CreatePollDto) {
    return this.pollService.createPoll(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed poll statistics, voter list and custom responses' })
  @ApiResponse({ status: 200, description: 'Poll details retrieved' })
  async getPollById(@Param('id') id: string): Promise<PollDetailResponse> {
    return this.pollService.getPollById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update poll citation schedule or status' })
  @ApiResponse({ status: 200, description: 'Poll updated successfully' })
  async updatePoll(@Param('id') id: string, @Body() dto: UpdatePollDto): Promise<PollDetailResponse> {
    return this.pollService.updatePoll(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a poll' })
  @ApiResponse({ status: 200, description: 'Poll deleted successfully' })
  async deletePoll(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.pollService.deletePoll(id);
    return { success };
  }

  @Post(':id/cite')
  @ApiOperation({ summary: 'Trigger an immediate citation reminder of the poll' })
  @ApiResponse({ status: 200, description: 'Citation dispatched' })
  async citePollNow(@Param('id') id: string) {
    return this.pollService.citePollNow(id);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export poll results as CSV' })
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const poll = await this.pollService.getPollById(id);
    const rows = [
      ['ID Voto', 'Contacto / Nombre', 'Telefono', 'Opcion Seleccionada', 'Respuesta Abierta (Otras)', 'Fecha Voto'],
    ];

    for (const v of poll.votes) {
      rows.push([
        v.id,
        v.voterName || 'Anonimo',
        v.voterPhone || v.voterJid,
        v.selectedOptions.join('; '),
        v.customText || '',
        v.votedAt,
      ]);
    }

    const csvContent = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="encuesta_${poll.id.slice(0, 8)}.csv"`);
    res.status(HttpStatus.OK).send('\uFEFF' + csvContent);
  }
}
