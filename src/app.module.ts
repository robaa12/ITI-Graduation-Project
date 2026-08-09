import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { validationSchema } from './config/env.validation';

// import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './modules/email/email.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ContentModule } from './modules/content/content.module';
import { StrategyModule } from './modules/strategy/strategy.module';
import { ContentWorkflowModule } from './modules/content-workflow/content-workflow.module';
import { HistoryModule } from './modules/history/history.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [configuration],
      validationSchema,
    }),
    // TypeOrmModule.forRootAsync({
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     type: 'postgres',
    //     host: configService.get('DB_HOST', 'localhost'),
    //     port: Number(configService.get('DB_PORT', 5432)),
    //     username: configService.get('DB_USERNAME', 'postgres'),
    //     password: configService.get('DB_PASSWORD', 'postgres'),
    //     database: configService.get('DB_DATABASE', 'iti_grad'),
    //     autoLoadEntities: true,
    //     synchronize: configService.get('NODE_ENV') !== 'production',
    //   }),
    // }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('redis.host'),
          port: configService.getOrThrow<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
    }),
    PrismaModule,
    EmailModule,
    AuthModule,
    ProjectsModule,
    CampaignsModule,
    ContentModule,
    StrategyModule,
    ContentWorkflowModule,
    HistoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
