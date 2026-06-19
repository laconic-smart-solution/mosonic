export {
  UserRole,
  UserStatus,
  type UserRecord,
  type ZernioConnectedAccountJson,
} from '../../domain/users/user.types';

import type { UserRecord } from '../../domain/users/user.types';

/** Compatibility barrel — prefer `UserRecord` from domain. */
export type User = UserRecord;
export type UserDocument = UserRecord;

export interface ZernioConnectedAccount {
  channel: string;
  accountId: string;
  connectedAt: Date | string;
}
