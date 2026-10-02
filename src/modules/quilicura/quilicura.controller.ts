import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QuilicuraService } from './quilicura.service';
import { ReglasAlertasConfig } from './quilicura.types';

@Controller('quilicura')
export class QuilicuraController {
  constructor(private readonly quilicuraService: QuilicuraService) {}

  @Get('status')
  async getStatus() {
    return this.quilicuraService.getStatus();
  }

  @Get('reglas-alertas')
  async getReglasAlertas() {
    return this.quilicuraService.getReglasAlertas();
  }

  @Post('reglas-alertas')
  @HttpCode(HttpStatus.OK)
  async saveReglasAlertas(@Body() body: any) {
    const rules: ReglasAlertasConfig = body?.reglasAlertas || body;
    return this.quilicuraService.saveReglasAlertas(rules);
  }

  @Post('sync-grupos')
  @HttpCode(HttpStatus.OK)
  async syncGrupos(@Body() body: { grupos?: Array<{ id: string; name: string }> }) {
    return this.quilicuraService.syncGruposAlcaldia(body?.grupos);
  }
}
