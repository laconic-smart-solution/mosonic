import { WechatNotifyService } from './wechat-notify.service';
import type { WechatConnectionService } from './wechat-connection.service';
import type { WechatService } from './wechat.service';

describe('WechatNotifyService', () => {
  const connections = {
    findByUserId: jest.fn(),
  };
  const wechat = {
    sendText: jest.fn(),
  };

  let service: WechatNotifyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WechatNotifyService(
      connections as unknown as WechatConnectionService,
      wechat as unknown as WechatService,
    );
  });

  it('no-ops when user has no connection', async () => {
    connections.findByUserId.mockResolvedValue(null);
    await service.notifyUser('u1', 'hello');
    expect(wechat.sendText).not.toHaveBeenCalled();
  });

  it('sends when connected', async () => {
    connections.findByUserId.mockResolvedValue({
      wechatOpenId: 'oABC',
    });
    await service.notifyUser('u1', 'hello');
    expect(wechat.sendText).toHaveBeenCalledWith('oABC', 'hello');
  });

  it('swallows send errors', async () => {
    connections.findByUserId.mockResolvedValue({
      wechatOpenId: 'oABC',
    });
    wechat.sendText.mockRejectedValue(new Error('down'));
    await expect(service.notifyUser('u1', 'hello')).resolves.toBeUndefined();
  });
});
