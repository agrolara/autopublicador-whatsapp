import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StatsModule } from '../stats/stats.module';
import { MessageModule } from '../message/message.module';
import { ContactModule } from '../contact/contact.module';
import { RequestMetricsInterceptor } from '../../common/interceptors/request-metrics.interceptor';
import { requestMetricsBoundaryMiddleware } from '../../common/middleware/request-metrics.middleware';

@Module({
  imports: [ConfigModule, StatsModule, MessageModule, ContactModule],
  controllers: [MetricsController, AnalyticsController],
  providers: [
    MetricsService,
    AnalyticsService,
    // Global: one HTTP RED observation per inbound request, skipped for /api/health and /api/metrics.
    { provide: APP_INTERCEPTOR, useClass: RequestMetricsInterceptor },
  ],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestMetricsBoundaryMiddleware).forRoutes('*');
  }
}
