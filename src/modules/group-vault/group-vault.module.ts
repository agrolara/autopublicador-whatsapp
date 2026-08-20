import { Module } from '@nestjs/common';
import { GroupVaultService } from './group-vault.service';
import { GroupVaultController } from './group-vault.controller';

@Module({
  controllers: [GroupVaultController],
  providers: [GroupVaultService],
  exports: [GroupVaultService],
})
export class GroupVaultModule {}
