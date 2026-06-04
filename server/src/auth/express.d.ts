import type { RequestAuthContext } from './auth.types';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: RequestAuthContext;
  }
}
