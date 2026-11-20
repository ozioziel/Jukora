import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ENV, type Env } from './config/env';

async function bootstrap() {
  // rawBody: necesario para verificar la firma HMAC de los webhooks (Didit).
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: [env.APP_PUBLIC_URL], credentials: true });
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  await app.listen(env.API_PORT, '0.0.0.0');
  Logger.log(
    `API en :${env.API_PORT} · red ${env.STELLAR_NETWORK}${env.DEMO_MODE ? ' · DEMO' : ''} · IA ${env.AI_PROVIDER} · búsqueda ${env.SEARCH_PROVIDER}`,
    'Bootstrap',
  );
}

bootstrap().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
