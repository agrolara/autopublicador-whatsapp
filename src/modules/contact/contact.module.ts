import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { GroupTagsService } from './group-tags.service';
import { ContactCategoriesService } from './contact-categories.service';

@Module({
  controllers: [ContactController],
  providers: [ContactService, GroupTagsService, ContactCategoriesService],
  exports: [ContactService, GroupTagsService, ContactCategoriesService],
})
export class ContactModule {}
