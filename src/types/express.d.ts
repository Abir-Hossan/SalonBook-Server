import type { Principal } from './domain';

declare global {
  namespace Express {
    interface Request { requestId: string; principal?: Principal }
  }
}
export {};
