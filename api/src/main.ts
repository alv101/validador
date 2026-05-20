import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function bootstrap() {
  dotenv.config();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const corsBaseConfig = {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'Idempotency-Key', 'X-Reset-Admin-Key'],
    credentials: false,
    maxAge: 86400,
  } as const;

  if (allowedOrigins.length > 0) {
    app.enableCors({
      ...corsBaseConfig,
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed by CORS'));
      },
    });
  } else if ((process.env.NODE_ENV ?? '').toLowerCase() !== 'production') {
    logger.warn('CORS_ALLOWED_ORIGINS is empty; allowing all origins outside production');
    app.enableCors({
      ...corsBaseConfig,
      origin: true,
    });
  } else {
    logger.warn('CORS remains disabled because CORS_ALLOWED_ORIGINS is empty in production');
  }

  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
