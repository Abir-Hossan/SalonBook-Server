export class AppError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly code: string, public readonly details: unknown[] = []) {
    super(message); this.name = 'AppError';
  }
}
export class AuthIntegrationPendingError extends AppError {
  constructor() { super(501, 'Authentication is not configured yet; protected routes require Phase 04.', 'AUTH_INTEGRATION_PENDING'); }
}
