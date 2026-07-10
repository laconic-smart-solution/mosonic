export class RedNoteSessionInvalidError extends Error {
  readonly code = 'REDNOTE_SESSION_INVALID' as const;
  constructor(message = 'RedNote session is invalid or needs re-authentication') {
    super(message);
    this.name = 'RedNoteSessionInvalidError';
  }
}

export class RedNoteConcurrentPublishError extends Error {
  readonly code = 'REDNOTE_CONCURRENT_PUBLISH' as const;
  constructor(message = 'Another RedNote publish is in progress for this account') {
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
  constructor(message = 'RedNote page selectors no longer match — UI may have changed') {
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

export class RedNoteNotConfiguredError extends Error {
  readonly code = 'REDNOTE_NOT_CONFIGURED' as const;
  constructor(message = 'RedNote cookie encryption key is not configured') {
    super(message);
    this.name = 'RedNoteNotConfiguredError';
  }
}
