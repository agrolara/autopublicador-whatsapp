import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionAiConfig } from './entities/session-ai-config.entity';
import { Message } from '../message/entities/message.entity';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionAiConfig, Message], 'data'),
  ],
  controllers: [AiAgentController],
  providers: [AiAgentService, KnowledgeBaseService],
  exports: [AiAgentService, KnowledgeBaseService],
})
export class AiAgentModule {}
