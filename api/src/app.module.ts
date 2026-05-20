import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { ProtectedController } from './protected.controller';
import { UsersModule } from './users/users.module';
import { ValidationsModule } from './validations/validations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      errorMessage: 'Too many requests, please slow down.',
      throttlers: [
        {
          name: 'default',
          ttl: minutes(1),
          limit: 180,
        },
      ],
    }),
    DbModule,
    AuthModule,
    UsersModule,
    ValidationsModule,
  ],
  controllers: [ProtectedController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
