import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Model } from 'mongoose';
import type { UploadDocument } from '../upload/schemas/upload.schema';
import type { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import type { WebhookEventDocument } from './webhook-event.schema';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  function makeService(secret: string | undefined) {
    const config = {
      get: jest.fn((k: string) =>
        k === 'ZERNIO_WEBHOOK_SECRET' ? secret : undefined,
      ),
    } as unknown as ConfigService;
    return new WebhookService(
      config,
      {} as Model<WebhookEventDocument>,
      {} as Model<UploadDocument>,
      {} as EventsService,
      {} as UsersService,
    );
  }

  it('verifySignature throws when secret is missing', () => {
    const svc = makeService(undefined);
    expect(() =>
      svc.verifySignature('abc', Buffer.from('{}')),
    ).toThrow(InternalServerErrorException);
  });

  it('verifySignature throws when signature header is missing', () => {
    const svc = makeService('s3cr3t');
    expect(() => svc.verifySignature(undefined, Buffer.from('{}'))).toThrow(
      UnauthorizedException,
    );
  });

  it('verifySignature accepts hex HMAC matching raw body', () => {
    const secret = 'test-secret';
    const body = Buffer.from(JSON.stringify({ event: 'post.published' }));
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const svc = makeService(secret);
    expect(() => svc.verifySignature(expected, body)).not.toThrow();
  });

  it('verifySignature accepts sha256= prefix', () => {
    const secret = 'test-secret';
    const body = Buffer.from('{"a":1}');
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    const svc = makeService(secret);
    expect(() => svc.verifySignature(`sha256=${hex}`, body)).not.toThrow();
  });

  it('verifySignature rejects wrong MAC', () => {
    const secret = 'test-secret';
    const body = Buffer.from('{}');
    const svc = makeService(secret);
    const bad = createHmac('sha256', 'other').update(body).digest('hex');
    expect(() => svc.verifySignature(bad, body)).toThrow(UnauthorizedException);
  });

  it('handleEvent skips processing on duplicate eventId (11000)', async () => {
    const secret = 's';
    const config = {
      get: jest.fn((k: string) =>
        k === 'ZERNIO_WEBHOOK_SECRET' ? secret : undefined,
      ),
    } as unknown as ConfigService;
    const create = jest.fn().mockRejectedValue({ code: 11000 });
    const findUpload = jest.fn();
    const webhookModel = { create } as unknown as Model<WebhookEventDocument>;
    const uploadModel = {
      findOne: findUpload,
    } as unknown as Model<UploadDocument>;
    const svc = new WebhookService(
      config,
      webhookModel,
      uploadModel,
      {} as EventsService,
      {} as UsersService,
    );
    const body = Buffer.from(
      JSON.stringify({ event: 'post.published', post: { _id: 'p1' } }),
    );
    await svc.handleEvent('evt-dup', body);
    expect(create).toHaveBeenCalled();
    expect(findUpload).not.toHaveBeenCalled();
  });
});
