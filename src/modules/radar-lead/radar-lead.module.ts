import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RadarSetting } from './entities/radar-setting.entity';
import { RadarClient } from './entities/radar-client.entity';
import { RadarLeadLog } from './entities/radar-lead-log.entity';
import { RadarLeadService } from './radar-lead.service';
import { RadarLeadController } from './radar-lead.controller';

import { ContactModule } from '../contact/contact.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RadarSetting, RadarClient, RadarLeadLog], 'data'),
    ContactModule,
  ],
  controllers: [RadarLeadController],
  providers: [RadarLeadService],
  exports: [RadarLeadService],
})
export class RadarLeadModule {}
