import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { GroupTagsService } from './group-tags.service';

@Module({
  controllers: [ContactController],
  providers: [ContactService, GroupTagsService],
  exports: [ContactService, GroupTagsService],
})
export class ContactModule {}
