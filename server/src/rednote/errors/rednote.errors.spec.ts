import {
  isRedNoteSessionInvalidError,
  isRedNoteSessionInvalidMessage,
  RedNoteSessionInvalidError,
} from './rednote.errors';

describe('isRedNoteSessionInvalidError', () => {
  it('matches instanceof', () => {
    expect(isRedNoteSessionInvalidError(new RedNoteSessionInvalidError())).toBe(
      true,
    );
  });

  it('matches BullMQ-serialized shape', () => {
    expect(
      isRedNoteSessionInvalidError({
        name: 'RedNoteSessionInvalidError',
        message: 'RedNote session is invalid or needs re-authentication',
      }),
    ).toBe(true);
  });

  it('matches message-only failures from job.waitUntilFinished', () => {
    expect(
      isRedNoteSessionInvalidError(
        new Error('RedNote session is invalid or needs re-authentication'),
      ),
    ).toBe(true);
  });

  it('does not match selector errors', () => {
    expect(
      isRedNoteSessionInvalidError(new Error('Video upload input not found')),
    ).toBe(false);
  });
});

describe('isRedNoteSessionInvalidMessage', () => {
  it('matches expired copy', () => {
    expect(
      isRedNoteSessionInvalidMessage(
        'RedNote session expired. Reconnect in Settings.',
      ),
    ).toBe(true);
  });
});
