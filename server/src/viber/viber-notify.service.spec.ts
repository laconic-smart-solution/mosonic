import { ViberNotifyService } from './viber-notify.service';
import type { ViberConnectionService } from './viber-connection.service';
import type { ViberService } from './viber.service';

describe('ViberNotifyService', () => {
  const connections = {
    findByUserId: jest.fn(),
  };
  const viber = {
    sendText: jest.fn(),
  };

  let service: ViberNotifyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ViberNotifyService(
      connections as unknown as ViberConnectionService,
      viber as unknown as ViberService,
    );
  });

  it('no-ops when user has no connection', async () => {
    connections.findByUserId.mockResolvedValue(null);
    await service.notifyUser('u1', 'hello');
    expect(viber.sendText).not.toHaveBeenCalled();
  });

  it('sends when connected', async () => {
    connections.findByUserId.mockResolvedValue({
      viberUserId: '123',
    });
    await service.notifyUser('u1', 'hello');
    expect(viber.sendText).toHaveBeenCalledWith('123', 'hello');
  });

  it('swallows send errors', async () => {
    connections.findByUserId.mockResolvedValue({
      viberUserId: '123',
    });
    viber.sendText.mockRejectedValue(new Error('down'));
    await expect(service.notifyUser('u1', 'hello')).resolves.toBeUndefined();
  });
});
