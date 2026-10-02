import { Module, forwardRef } from '@nestjs/common';
import { QuilicuraController } from './quilicura.controller';
import { QuilicuraService } from './quilicura.service';
import { ContactModule } from '../contact/contact.module';

@Module({
  imports: [forwardRef(() => ContactModule)],
  controllers: [QuilicuraController],
  providers: [QuilicuraService],
  exports: [QuilicuraService],
})
export class QuilicuraModule {}
