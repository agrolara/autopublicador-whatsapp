import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { GroupVaultService } from './group-vault.service';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('Group Vault')
@Controller('group-vault')
export class GroupVaultController {
  constructor(private readonly vaultService: GroupVaultService) {}

  @Get()
  @RequireRole(ApiKeyRole.VIEWER)
  @ApiOperation({ summary: 'List all groups stored in the central Group Vault catalog' })
  listGroups() {
    return this.vaultService.listGroups();
  }

  @Post('sync/:sessionId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Sync and update all group invite links from a live connected session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID to scan groups from' })
  syncFromSession(@Param('sessionId') sessionId: string) {
    return this.vaultService.syncFromSession(sessionId);
  }

  @Post('import')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Import plain-text WhatsApp invite links into the vault' })
  @ApiBody({ schema: { properties: { links: { type: 'array', items: { type: 'string' } } } } })
  importLinks(@Body('links') links: string[]) {
    return this.vaultService.importInviteLinks(Array.isArray(links) ? links : []);
  }

  @Post('auto-join/:sessionId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start rate-limited progressive auto-join of target session into vault groups' })
  @ApiParam({ name: 'sessionId', description: 'Target session to join groups' })
  startAutoJoin(
    @Param('sessionId') sessionId: string,
    @Body() dto: { groupIds?: string[]; intervalSeconds?: number },
  ) {
    return this.vaultService.startAutoJoin(sessionId, dto || {});
  }

  @Get('auto-join/status/:jobId')
  @RequireRole(ApiKeyRole.VIEWER)
  @ApiOperation({ summary: 'Get status and progress logs of an auto-join job' })
  @ApiParam({ name: 'jobId', description: 'Auto-join job ID' })
  getAutoJoinStatus(@Param('jobId') jobId: string) {
    return this.vaultService.getJobStatus(jobId);
  }

  @Post('auto-join/cancel/:jobId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Cancel a running auto-join job' })
  @ApiParam({ name: 'jobId', description: 'Auto-join job ID' })
  cancelAutoJoin(@Param('jobId') jobId: string) {
    return { success: this.vaultService.cancelJob(jobId) };
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Remove a group from the vault catalog' })
  @ApiParam({ name: 'id', description: 'Group ID or invite code' })
  deleteGroup(@Param('id') id: string) {
    return { success: this.vaultService.deleteGroup(id) };
  }
}
