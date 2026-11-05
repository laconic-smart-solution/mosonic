import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { useSystemCaCertificates } from './common/tls-system-ca';

useSystemCaCertificates();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.use(cookieParser());
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (!req.url.includes('/docs') && !req.url.includes('/health')) {
        console.log(`[HTTP] ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Public dev assets: GET /uploads/* → ./uploads (URLs use APP_URL or PUBLIC_URL + /uploads/...).
  const uploadsDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  const swaggerEnabled =
    (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Mosonic API')
      .setDescription('Mosonic backend API')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'bearer',
      )
      .addSecurityRequirements('bearer')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(process.env.SWAGGER_PATH ?? 'docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
