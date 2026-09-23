import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTelemetryService } from './ai-telemetry.service';
import { AiTelemetryController } from './ai-telemetry.controller';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiBudgetConfig } from './entities/ai-budget-config.entity';
import { SessionAiConfig } from '../ai-agent/entities/session-ai-config.entity';
import { RadarSetting } from '../radar-lead/entities/radar-setting.entity';
import { RadarLeadLog } from '../radar-lead/entities/radar-lead-log.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        AiUsageLog,
        AiBudgetConfig,
        SessionAiConfig,
        RadarSetting,
        RadarLeadLog,
      ],
      'data',
    ),
  ],
  controllers: [AiTelemetryController],
  providers: [AiTelemetryService],
  exports: [AiTelemetryService],
})
export class AiTelemetryModule {}
