import type { SocialAccountRecord } from '../domain/users/social-account.types';
import type { PublishPayload, PublishResult } from './social-publish.types';

export type PublishContext = {
  provider: string;
  accountRef: string;
  userId: string;
  channel: string;
};

export interface SocialProviderAdapter {
  getContext(account: SocialAccountRecord): Promise<PublishContext>;
  publish(
    context: PublishContext,
    payload: PublishPayload,
  ): Promise<PublishResult>;
  disconnect(account: SocialAccountRecord): Promise<void>;
  checkHealth(account: SocialAccountRecord): Promise<'active' | 'needs_reauth'>;
}
