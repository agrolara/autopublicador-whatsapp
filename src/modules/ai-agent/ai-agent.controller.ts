import { Controller, Get, Put, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';
import { UpdateAiConfigDto, TestAiPromptDto } from './dto/ai-config.dto';
import { SessionAiConfig } from './entities/session-ai-config.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('ai-agent')
@Controller('sessions/:sessionId/ai-config')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Get()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get AI agent configuration for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'AI agent configuration' })
  async getConfig(@Param('sessionId') sessionId: string): Promise<SessionAiConfig> {
    return this.aiAgentService.getConfig(sessionId);
  }

  @Put()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update AI agent configuration for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Updated AI agent configuration' })
  async updateConfig(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateAiConfigDto,
  ): Promise<SessionAiConfig> {
    return this.aiAgentService.updateConfig(sessionId, dto);
  }

  @Post('test')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Test AI prompt without sending to WhatsApp' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Simulated LLM response' })
  async testPrompt(
    @Param('sessionId') _sessionId: string,
    @Body() dto: TestAiPromptDto,
  ): Promise<{ reply: string; durationMs: number }> {
    return this.aiAgentService.testPrompt(dto);
  }
}
