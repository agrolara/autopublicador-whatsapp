import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RadarSetting } from './entities/radar-setting.entity';
import { RadarClient } from './entities/radar-client.entity';
import { RadarLeadService } from './radar-lead.service';
import { RadarLeadController } from './radar-lead.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RadarSetting, RadarClient], 'data'),
  ],
  controllers: [RadarLeadController],
  providers: [RadarLeadService],
  exports: [RadarLeadService],
})
export class RadarLeadModule {}
