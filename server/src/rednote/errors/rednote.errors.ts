export class RedNoteSessionInvalidError extends Error {
  readonly code = 'REDNOTE_SESSION_INVALID' as const;
  constructor(
    message = 'RedNote session is invalid or needs re-authentication',
  ) {
    super(message);
    this.name = 'RedNoteSessionInvalidError';
  }
}

/** BullMQ / serialized errors lose `instanceof` — match by code, name, or message. */
export function isRedNoteSessionInvalidError(err: unknown): boolean {
  if (err instanceof RedNoteSessionInvalidError) return true;
  if (!err || typeof err !== 'object') {
    if (typeof err === 'string') {
      return isRedNoteSessionInvalidMessage(err);
    }
    return false;
  }
  const e = err as { name?: string; code?: string; message?: string };
  if (e.code === 'REDNOTE_SESSION_INVALID') return true;
  if (e.name === 'RedNoteSessionInvalidError') return true;
  return isRedNoteSessionInvalidMessage(e.message);
}

export function isRedNoteSessionInvalidMessage(
  message: string | null | undefined,
): boolean {
  const m = (message ?? '').toLowerCase();
  if (!m.includes('session')) return false;
  return (
    m.includes('invalid') ||
    m.includes('re-auth') ||
    m.includes('reconnect') ||
    m.includes('expired') ||
    m.includes('not detected') ||
    m.includes('could not verify') ||
    m.includes('creator session')
  );
}

export class RedNoteConcurrentPublishError extends Error {
  readonly code = 'REDNOTE_CONCURRENT_PUBLISH' as const;
  constructor(
    message = 'Another RedNote publish is in progress for this account',
  ) {
    super(message);
    this.name = 'RedNoteConcurrentPublishError';
  }
}

export class RedNoteLoginInProgressError extends Error {
  readonly code = 'REDNOTE_LOGIN_IN_PROGRESS' as const;
  constructor(message = 'RedNote QR login is already in progress') {
    super(message);
    this.name = 'RedNoteLoginInProgressError';
  }
}

export class RedNoteSelectorMismatchError extends Error {
  readonly code = 'REDNOTE_SELECTOR_MISMATCH' as const;
  constructor(
    message = 'RedNote page selectors no longer match — UI may have changed',
  ) {
    super(message);
    this.name = 'RedNoteSelectorMismatchError';
  }
}

export class RedNoteUploadTimeoutError extends Error {
  readonly code = 'REDNOTE_UPLOAD_TIMEOUT' as const;
  constructor(message = 'RedNote media upload timed out') {
    super(message);
    this.name = 'RedNoteUploadTimeoutError';
  }
}

/** Publish button was clicked but the success confirmation page never appeared. */
export class RedNotePublishUnconfirmedError extends Error {
  readonly code = 'REDNOTE_PUBLISH_UNCONFIRMED' as const;
  constructor(
    message = 'RedNote publish was not confirmed — success page did not appear',
  ) {
    super(message);
    this.name = 'RedNotePublishUnconfirmedError';
  }
}

export class RedNoteNotConfiguredError extends Error {
  readonly code = 'REDNOTE_NOT_CONFIGURED' as const;
  constructor(message = 'RedNote cookie encryption key is not configured') {
    super(message);
    this.name = 'RedNoteNotConfiguredError';
  }
}
