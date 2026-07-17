import { LineNotifyService } from './line-notify.service';
import type { LineConnectionService } from './line-connection.service';
import type { LineService } from './line.service';

describe('LineNotifyService', () => {
  const connections = {
    findByUserId: jest.fn(),
  };
  const line = {
    sendText: jest.fn(),
  };
  let service: LineNotifyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LineNotifyService(
      connections as unknown as LineConnectionService,
      line as unknown as LineService,
    );
  });

  it('no-ops when user has no LINE connection', async () => {
    connections.findByUserId.mockResolvedValue(null);
    await service.notifyUser('user-1', 'hello');
    expect(line.sendText).not.toHaveBeenCalled();
  });

  it('sends text to linked LINE user id', async () => {
    connections.findByUserId.mockResolvedValue({
      userId: 'user-1',
      lineUserId: 'Uabc',
    });
    await service.notifyUser('user-1', 'Pipeline complete');
    expect(line.sendText).toHaveBeenCalledWith('Uabc', 'Pipeline complete');
  });

  it('does not throw when send fails', async () => {
    connections.findByUserId.mockResolvedValue({
      userId: 'user-1',
      lineUserId: 'Uabc',
    });
    line.sendText.mockRejectedValue(new Error('line-service down'));
    await expect(
      service.notifyUser('user-1', 'hello'),
    ).resolves.toBeUndefined();
  });
});
