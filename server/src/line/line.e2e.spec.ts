// The real guard pulls in `jose`, which ships ESM that jest's transform rejects.
// Auth is not what these tests exercise, so stand the guard down at module level.
jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class {
    canActivate() {
      return true;
    }
  },
}));

import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LineController } from './line.controller';
import { LineWebhookController } from './line-webhook.controller';
import { LineService } from './line.service';
import type { LineQrCode } from './line.types';

/**
 * Drives the NestJS side against a live line-service. Start it first with:
 *   GATEWAY_SECRET=hello go run ./app/line-service/cmd
 * Skipped automatically when LINE_SERVICE_URL is not exported.
 */
const LIVE_URL = process.env.LINE_SERVICE_URL;
const describeLive = LIVE_URL ? describe : describe.skip;

const ENV: Record<string, string> = {
  LINE_SERVICE_URL: LIVE_URL ?? '',
  COMMUNICATION_GATEWAY_SECRET: 'hello',
  LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
  LINE_BASIC_ID: '@136laxkx',
  LINE_CALLBACK_TOKEN: 'callback-secret',
  LINE_WELCOME_MESSAGE: 'Welcome aboard!',
};

describeLive('LINE integration (e2e against live line-service)', () => {
  let app: INestApplication;
  let line: LineService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [LineController, LineWebhookController],
      providers: [
        LineService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => ENV[key] },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    line = moduleRef.get(LineService);
    await app.init();
  });

  afterEach(() => {
    // spyOn reuses one mock per method, so call history leaks across tests.
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /line/qr returns the @136laxkx add-friend URL and a PNG data URI', async () => {
    const res = await request(app.getHttpServer()).get('/line/qr').expect(200);

    const body = res.body as LineQrCode;
    expect(body).toMatchObject({
      basicId: '@136laxkx',
      addFriendUrl: 'https://line.me/R/ti/p/%40136laxkx',
    });
    expect(body.qrImage).toMatch(/^data:image\/png;base64,iVBOR/);
  });

  it('GET /line/qr.png streams a real PNG', async () => {
    const res = await request(app.getHttpServer())
      .get('/line/qr.png?size=300')
      .expect(200)
      .expect('Content-Type', 'image/png');

    // PNG magic number.
    const png = res.body as Buffer;
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('GET /line/qr works with no LINE token configured (QR never reaches LINE)', async () => {
    const bare = new LineService({
      get: (key: string) =>
        key === 'LINE_CHANNEL_ACCESS_TOKEN' ? undefined : ENV[key],
    } as unknown as ConfigService);

    await expect(bare.getQrCode()).resolves.toMatchObject({
      basicId: '@136laxkx',
    });
    // Sending does reach LINE, so it must still fail loudly.
    await expect(bare.sendText('U123', 'hi')).rejects.toThrow(
      'LINE_CHANNEL_ACCESS_TOKEN is not configured',
    );
  });

  it('GET /line/qr blames the caller (400, not 503) for a bad basicId', async () => {
    const res = await request(app.getHttpServer())
      .get('/line/qr?basicId=not%20valid')
      .expect(400);

    expect((res.body as { message: string }).message).toContain('basic_id');
  });

  it('GET /line/qr rejects an out-of-range size before calling line-service', async () => {
    await request(app.getHttpServer()).get('/line/qr?size=5000').expect(400);
  });

  it('POST /line/webhook auto-greets a user who added the OA as a friend', async () => {
    const sendText = jest.spyOn(line, 'sendText').mockResolvedValue();

    await request(app.getHttpServer())
      .post('/line/webhook?token=callback-secret')
      .send({
        events: [{ type: 'follow', user_id: 'U123', reply_token: 'rt' }],
      })
      .expect(200, { received: true });

    // handleEvents is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    expect(sendText).toHaveBeenCalledWith('U123', 'Welcome aboard!');
  });

  it('POST /line/webhook ignores non-follow events', async () => {
    const sendText = jest.spyOn(line, 'sendText').mockResolvedValue();

    await request(app.getHttpServer())
      .post('/line/webhook?token=callback-secret')
      .send({ events: [{ type: 'message', user_id: 'U123', text: 'hi' }] })
      .expect(200);

    await new Promise((r) => setImmediate(r));
    expect(sendText).not.toHaveBeenCalled();
  });

  it('POST /line/webhook rejects a wrong or missing callback token', async () => {
    await request(app.getHttpServer())
      .post('/line/webhook?token=nope')
      .send({ events: [] })
      .expect(401);

    await request(app.getHttpServer())
      .post('/line/webhook')
      .send({ events: [] })
      .expect(401);
  });
});
