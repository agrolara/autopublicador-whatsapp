import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { GroupTagsService } from './group-tags.service';
import { ContactCategoriesService } from './contact-categories.service';
import { LidMapping } from '../../engine/identity/lid-mapping.entity';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LidMapping], 'data'),
    forwardRef(() => SessionModule),
  ],
  controllers: [ContactController],
  providers: [ContactService, GroupTagsService, ContactCategoriesService],
  exports: [ContactService, GroupTagsService, ContactCategoriesService],
})
export class ContactModule {}
