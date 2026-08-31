import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Behind Caddy/Nginx: trust the first proxy so req.ip is the real client
  // (correct rate-limit keys, secure-cookie handling).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('api'); // URI versioning (/api/v1) added in a later sprint
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  app.enableCors({ origin: webOrigin.split(','), credentials: true });

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api`);
}

bootstrap();
