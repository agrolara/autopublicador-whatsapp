import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiAgentService } from './ai-agent.service';
import { KnowledgeBaseService, KnowledgeDocumentDto } from './knowledge-base.service';
import { UpdateAiConfigDto, TestAiPromptDto } from './dto/ai-config.dto';
import { SessionAiConfig } from './entities/session-ai-config.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('ai-agent')
@Controller('sessions/:sessionId/ai-config')
export class AiAgentController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

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
    @Param('sessionId') sessionId: string,
    @Body() dto: TestAiPromptDto,
  ): Promise<{ reply: string; durationMs: number }> {
    return this.aiAgentService.testPrompt(dto, sessionId);
  }

  @Post('reset-silence')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Reset human handover silence for a session or specific chat' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({ name: 'chatId', required: false, description: 'Optional chat ID to reset' })
  @ApiResponse({ status: 200, description: 'Reset result' })
  async resetSilence(
    @Param('sessionId') sessionId: string,
    @Query('chatId') chatId?: string,
  ): Promise<{ success: boolean; clearedCount: number }> {
    return this.aiAgentService.resetHandoverSilence(sessionId, chatId);
  }

  @Get('documents')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List knowledge base documents for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'List of knowledge base documents' })
  async listDocuments(@Param('sessionId') sessionId: string): Promise<KnowledgeDocumentDto[]> {
    return this.knowledgeBaseService.listDocuments(sessionId);
  }

  @Post('documents')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Upload a document to the knowledge base (.pdf, .docx, .txt, .csv)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Document file' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadDocument(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file?: { originalname: string; buffer: Buffer; mimetype?: string; size: number },
  ): Promise<KnowledgeDocumentDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Archivo no subido o inválido.');
    }
    return this.knowledgeBaseService.addDocument(sessionId, file);
  }

  @Delete('documents/:documentId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete a document from the knowledge base' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document deleted' })
  async deleteDocument(
    @Param('sessionId') sessionId: string,
    @Param('documentId') documentId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.knowledgeBaseService.deleteDocument(sessionId, documentId);
    return { success };
  }
}
