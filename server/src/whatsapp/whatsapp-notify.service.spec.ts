import { WhatsAppNotifyService } from './whatsapp-notify.service';
import type { WhatsAppConnectionService } from './whatsapp-connection.service';
import type { WhatsAppService } from './whatsapp.service';

describe('WhatsAppNotifyService', () => {
  const connections = {
    findByUserId: jest.fn(),
  };
  const whatsapp = {
    sendText: jest.fn(),
  };

  let service: WhatsAppNotifyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppNotifyService(
      connections as unknown as WhatsAppConnectionService,
      whatsapp as unknown as WhatsAppService,
    );
  });

  it('no-ops when user has no connection', async () => {
    connections.findByUserId.mockResolvedValue(null);
    await service.notifyUser('u1', 'hello');
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('sends when connected', async () => {
    connections.findByUserId.mockResolvedValue({
      whatsappWaId: '15551234567',
    });
    await service.notifyUser('u1', 'hello');
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '15551234567',
      'hello',
      'u1',
    );
  });

  it('swallows send errors', async () => {
    connections.findByUserId.mockResolvedValue({
      whatsappWaId: '15551234567',
    });
    whatsapp.sendText.mockRejectedValue(new Error('down'));
    await expect(service.notifyUser('u1', 'hello')).resolves.toBeUndefined();
  });
});
