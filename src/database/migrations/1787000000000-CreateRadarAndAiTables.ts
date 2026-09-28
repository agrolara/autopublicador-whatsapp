import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRadarAndAiTables1787000000000 implements MigrationInterface {
  name = 'CreateRadarAndAiTables1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';

    if (isPostgres) {
      await this.upPostgres(queryRunner);
    } else {
      await this.upSqlite(queryRunner);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';

    if (isPostgres) {
      await this.downPostgres(queryRunner);
    } else {
      await this.downSqlite(queryRunner);
    }
  }

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    // 1. radar_settings
    if (!(await queryRunner.hasTable('radar_settings'))) {
      await queryRunner.query(`
        CREATE TABLE "radar_settings" (
          "id" varchar(32) PRIMARY KEY NOT NULL,
          "enabled" boolean NOT NULL DEFAULT true,
          "minTextLength" integer NOT NULL DEFAULT 8,
          "ignoreMediaWithoutCaption" boolean NOT NULL DEFAULT true,
          "groupFilterMode" varchar(32) NOT NULL DEFAULT 'ALL',
          "groupCategoryKeywords" text NOT NULL DEFAULT 'quilicura,valle lo campino,valle grande',
          "groupCategoryTags" text NOT NULL DEFAULT '[]',
          "whitelistedGroupIds" text NOT NULL DEFAULT '[]',
          "activeScanningSessions" text NOT NULL DEFAULT '[]',
          "dedupWindowSeconds" integer NOT NULL DEFAULT 30,
          "crossGroupDedupMinutes" integer NOT NULL DEFAULT 60,
          "aiSemanticEnabled" boolean NOT NULL DEFAULT true,
          "aiProvider" varchar(32) NOT NULL DEFAULT 'typesafe',
          "typesafeApiKey" text NOT NULL DEFAULT '',
          "globalBlacklistedSenders" text NOT NULL DEFAULT '[]',
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 2. radar_clients
    if (!(await queryRunner.hasTable('radar_clients'))) {
      await queryRunner.query(`
        CREATE TABLE "radar_clients" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "name" varchar(128) NOT NULL,
          "rubroKey" varchar(64) NOT NULL,
          "targetPhone" varchar(32) NOT NULL,
          "senderSessionId" varchar(64) NOT NULL DEFAULT '',
          "localKeywords" text NOT NULL DEFAULT '',
          "jevPromptCriteria" text NULL,
          "useAiFilter" boolean NOT NULL DEFAULT true,
          "alertTemplate" text NOT NULL,
          "active" boolean NOT NULL DEFAULT true,
          "blacklistedSenders" text NOT NULL DEFAULT '[]',
          "negativePhrases" text NOT NULL DEFAULT '[]',
          "groupFilterMode" varchar(32) NOT NULL DEFAULT 'GLOBAL',
          "groupCategoryKeywords" text NOT NULL DEFAULT '',
          "groupCategoryTags" text NOT NULL DEFAULT '[]',
          "whitelistedGroupIds" text NOT NULL DEFAULT '[]',
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 3. radar_lead_logs
    if (!(await queryRunner.hasTable('radar_lead_logs'))) {
      await queryRunner.query(`
        CREATE TABLE "radar_lead_logs" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "clientId" varchar(64) NULL,
          "clientName" varchar(128) NOT NULL,
          "rubroKey" varchar(64) NOT NULL DEFAULT '',
          "sessionId" varchar(64) NOT NULL DEFAULT '',
          "groupId" varchar(128) NOT NULL DEFAULT '',
          "groupName" varchar(255) NOT NULL DEFAULT '',
          "buyerPhone" varchar(32) NOT NULL DEFAULT '',
          "messageText" text NOT NULL,
          "matchedKeyword" varchar(128) NOT NULL DEFAULT '',
          "aiEvaluated" boolean NOT NULL DEFAULT false,
          "aiScore" real NULL,
          "status" varchar(32) NOT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_radar_logs_clientId" ON "radar_lead_logs" ("clientId")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_radar_logs_createdAt" ON "radar_lead_logs" ("createdAt")`);
    }

    // 4. session_ai_configs
    if (!(await queryRunner.hasTable('session_ai_configs'))) {
      await queryRunner.query(`
        CREATE TABLE "session_ai_configs" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "sessionId" varchar(64) NOT NULL,
          "enabled" boolean NOT NULL DEFAULT false,
          "provider" varchar(32) NOT NULL DEFAULT 'openrouter',
          "apiKey" varchar(255) NULL,
          "model" varchar(128) NOT NULL DEFAULT 'deepseek/deepseek-chat',
          "baseUrl" varchar(255) NULL,
          "systemPrompt" text NULL,
          "temperature" real NOT NULL DEFAULT 0.7,
          "maxTokens" integer NOT NULL DEFAULT 1200,
          "humanTakeoverMinutes" integer NOT NULL DEFAULT 30,
          "debounceSeconds" integer NOT NULL DEFAULT 3,
          "transcribeAudio" boolean NOT NULL DEFAULT false,
          "groqApiKey" varchar(255) NULL,
          "whisperModel" varchar(64) NOT NULL DEFAULT 'whisper-large-v3-turbo',
          "audioPrompt" text NULL,
          "blacklistedSenders" text NOT NULL DEFAULT '[]',
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UQ_session_ai_configs_sessionId" UNIQUE ("sessionId")
        )
      `);
    }

    // 5. ai_budget_configs
    if (!(await queryRunner.hasTable('ai_budget_configs'))) {
      await queryRunner.query(`
        CREATE TABLE "ai_budget_configs" (
          "id" varchar(32) PRIMARY KEY NOT NULL DEFAULT 'default',
          "groqInitialBalance" real NOT NULL DEFAULT 5.0,
          "typesafeInitialBalance" real NOT NULL DEFAULT 5.0,
          "openrouterInitialBalance" real NOT NULL DEFAULT 10.0,
          "costAlertThresholdUsd" real NOT NULL DEFAULT 1.0,
          "openrouterApiKeyOverride" varchar(255) NULL,
          "groqApiKeyOverride" varchar(255) NULL,
          "typesafeApiKeyOverride" varchar(255) NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // 6. ai_usage_logs
    if (!(await queryRunner.hasTable('ai_usage_logs'))) {
      await queryRunner.query(`
        CREATE TABLE "ai_usage_logs" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "provider" varchar(32) NOT NULL,
          "serviceType" varchar(32) NOT NULL,
          "model" varchar(128) NOT NULL,
          "sessionId" varchar(64) NULL,
          "promptTokens" integer NOT NULL DEFAULT 0,
          "completionTokens" integer NOT NULL DEFAULT 0,
          "totalTokens" integer NOT NULL DEFAULT 0,
          "audioSeconds" real NOT NULL DEFAULT 0.0,
          "costUsd" real NOT NULL DEFAULT 0.0,
          "success" boolean NOT NULL DEFAULT true,
          "errorDetails" text NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_provider" ON "ai_usage_logs" ("provider")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_serviceType" ON "ai_usage_logs" ("serviceType")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_sessionId" ON "ai_usage_logs" ("sessionId")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_createdAt" ON "ai_usage_logs" ("createdAt")`);
    }
  }

  private async upSqlite(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('radar_settings'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "radar_settings" (
          "id" varchar(32) PRIMARY KEY NOT NULL,
          "enabled" boolean NOT NULL DEFAULT (1),
          "minTextLength" integer NOT NULL DEFAULT (8),
          "ignoreMediaWithoutCaption" boolean NOT NULL DEFAULT (1),
          "groupFilterMode" varchar(32) NOT NULL DEFAULT ('ALL'),
          "groupCategoryKeywords" text NOT NULL DEFAULT ('quilicura,valle lo campino,valle grande'),
          "groupCategoryTags" text NOT NULL DEFAULT ('[]'),
          "whitelistedGroupIds" text NOT NULL DEFAULT ('[]'),
          "activeScanningSessions" text NOT NULL DEFAULT ('[]'),
          "dedupWindowSeconds" integer NOT NULL DEFAULT (30),
          "crossGroupDedupMinutes" integer NOT NULL DEFAULT (60),
          "aiSemanticEnabled" boolean NOT NULL DEFAULT (1),
          "aiProvider" varchar(32) NOT NULL DEFAULT ('typesafe'),
          "typesafeApiKey" text NOT NULL DEFAULT (''),
          "globalBlacklistedSenders" text NOT NULL DEFAULT ('[]'),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
    }

    if (!(await queryRunner.hasTable('radar_clients'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "radar_clients" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "name" varchar(128) NOT NULL,
          "rubroKey" varchar(64) NOT NULL,
          "targetPhone" varchar(32) NOT NULL,
          "senderSessionId" varchar(64) NOT NULL DEFAULT (''),
          "localKeywords" text NOT NULL DEFAULT (''),
          "jevPromptCriteria" text NULL,
          "useAiFilter" boolean NOT NULL DEFAULT (1),
          "alertTemplate" text NOT NULL,
          "active" boolean NOT NULL DEFAULT (1),
          "blacklistedSenders" text NOT NULL DEFAULT ('[]'),
          "negativePhrases" text NOT NULL DEFAULT ('[]'),
          "groupFilterMode" varchar(32) NOT NULL DEFAULT ('GLOBAL'),
          "groupCategoryKeywords" text NOT NULL DEFAULT (''),
          "groupCategoryTags" text NOT NULL DEFAULT ('[]'),
          "whitelistedGroupIds" text NOT NULL DEFAULT ('[]'),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
    }

    if (!(await queryRunner.hasTable('radar_lead_logs'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "radar_lead_logs" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "clientId" varchar(64) NULL,
          "clientName" varchar(128) NOT NULL,
          "rubroKey" varchar(64) NOT NULL DEFAULT (''),
          "sessionId" varchar(64) NOT NULL DEFAULT (''),
          "groupId" varchar(128) NOT NULL DEFAULT (''),
          "groupName" varchar(255) NOT NULL DEFAULT (''),
          "buyerPhone" varchar(32) NOT NULL DEFAULT (''),
          "messageText" text NOT NULL,
          "matchedKeyword" varchar(128) NOT NULL DEFAULT (''),
          "aiEvaluated" boolean NOT NULL DEFAULT (0),
          "aiScore" real NULL,
          "status" varchar(32) NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_radar_logs_clientId" ON "radar_lead_logs" ("clientId")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_radar_logs_createdAt" ON "radar_lead_logs" ("createdAt")`);
    }

    if (!(await queryRunner.hasTable('session_ai_configs'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "session_ai_configs" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "sessionId" varchar(64) NOT NULL,
          "enabled" boolean NOT NULL DEFAULT (0),
          "provider" varchar(32) NOT NULL DEFAULT ('openrouter'),
          "apiKey" varchar(255) NULL,
          "model" varchar(128) NOT NULL DEFAULT ('deepseek/deepseek-chat'),
          "baseUrl" varchar(255) NULL,
          "systemPrompt" text NULL,
          "temperature" real NOT NULL DEFAULT (0.7),
          "maxTokens" integer NOT NULL DEFAULT (1200),
          "humanTakeoverMinutes" integer NOT NULL DEFAULT (30),
          "debounceSeconds" integer NOT NULL DEFAULT (3),
          "transcribeAudio" boolean NOT NULL DEFAULT (0),
          "groqApiKey" varchar(255) NULL,
          "whisperModel" varchar(64) NOT NULL DEFAULT ('whisper-large-v3-turbo'),
          "audioPrompt" text NULL,
          "blacklistedSenders" text NOT NULL DEFAULT ('[]'),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          CONSTRAINT "UQ_session_ai_configs_sessionId" UNIQUE ("sessionId")
        )
      `);
    }

    if (!(await queryRunner.hasTable('ai_budget_configs'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "ai_budget_configs" (
          "id" varchar(32) PRIMARY KEY NOT NULL DEFAULT ('default'),
          "groqInitialBalance" real NOT NULL DEFAULT (5.0),
          "typesafeInitialBalance" real NOT NULL DEFAULT (5.0),
          "openrouterInitialBalance" real NOT NULL DEFAULT (10.0),
          "costAlertThresholdUsd" real NOT NULL DEFAULT (1.0),
          "openrouterApiKeyOverride" varchar(255) NULL,
          "groqApiKeyOverride" varchar(255) NULL,
          "typesafeApiKeyOverride" varchar(255) NULL,
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
    }

    if (!(await queryRunner.hasTable('ai_usage_logs'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
          "id" varchar(36) PRIMARY KEY NOT NULL,
          "provider" varchar(32) NOT NULL,
          "serviceType" varchar(32) NOT NULL,
          "model" varchar(128) NOT NULL,
          "sessionId" varchar(64) NULL,
          "promptTokens" integer NOT NULL DEFAULT (0),
          "completionTokens" integer NOT NULL DEFAULT (0),
          "totalTokens" integer NOT NULL DEFAULT (0),
          "audioSeconds" real NOT NULL DEFAULT (0.0),
          "costUsd" real NOT NULL DEFAULT (0.0),
          "success" boolean NOT NULL DEFAULT (1),
          "errorDetails" text NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_provider" ON "ai_usage_logs" ("provider")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_serviceType" ON "ai_usage_logs" ("serviceType")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_sessionId" ON "ai_usage_logs" ("sessionId")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_createdAt" ON "ai_usage_logs" ("createdAt")`);
    }
  }

  private async downPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_budget_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_ai_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "radar_lead_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "radar_clients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "radar_settings"`);
  }

  private async downSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_budget_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_ai_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "radar_lead_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "radar_clients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "radar_settings"`);
  }
}
