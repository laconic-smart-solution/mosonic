import { TelegramNotifyService } from './telegram-notify.service';
import type { TelegramConnectionService } from './telegram-connection.service';
import type { TelegramService } from './telegram.service';

describe('TelegramNotifyService', () => {
  const connections = {
    findByUserId: jest.fn(),
  };
  const telegram = {
    sendText: jest.fn(),
  };

  let service: TelegramNotifyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramNotifyService(
      connections as unknown as TelegramConnectionService,
      telegram as unknown as TelegramService,
    );
  });

  it('no-ops when user has no connection', async () => {
    connections.findByUserId.mockResolvedValue(null);
    await service.notifyUser('u1', 'hello');
    expect(telegram.sendText).not.toHaveBeenCalled();
  });

  it('sends when connected', async () => {
    connections.findByUserId.mockResolvedValue({
      telegramChatId: '123',
    });
    await service.notifyUser('u1', 'hello');
    expect(telegram.sendText).toHaveBeenCalledWith('123', 'hello');
  });

  it('swallows send errors', async () => {
    connections.findByUserId.mockResolvedValue({
      telegramChatId: '123',
    });
    telegram.sendText.mockRejectedValue(new Error('down'));
    await expect(service.notifyUser('u1', 'hello')).resolves.toBeUndefined();
  });
});
