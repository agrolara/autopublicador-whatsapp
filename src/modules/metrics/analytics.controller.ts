import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('sessions/:sessionId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get campaign & analytics summary for a session' })
  async getSummary(@Param('sessionId') sessionId: string) {
    return this.analyticsService.getSummary(sessionId);
  }
}
