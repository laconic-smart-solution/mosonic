import {
  sanitizeRedNoteCaption,
  sanitizeRedNoteTitle,
  sanitizeRedNoteTopicLabel,
} from './sanitize-rednote-text.util';

describe('sanitizeRedNoteTopicLabel', () => {
  it('strips punctuation and symbols', () => {
    expect(sanitizeRedNoteTopicLabel('AI-Content!')).toBe('AIContent');
    expect(sanitizeRedNoteTopicLabel('游戏_2026')).toBe('游戏2026');
  });
});

describe('sanitizeRedNoteCaption', () => {
  it('cleans double-hash topics', () => {
    expect(sanitizeRedNoteCaption('Hello #AI-Content!# world')).toBe(
      'Hello #AIContent# world',
    );
  });

  it('drops empty topics after sanitize', () => {
    expect(sanitizeRedNoteCaption('Hi #!!!# there')).toBe('Hi there');
  });

  it('cleans western hashtags', () => {
    expect(sanitizeRedNoteCaption('Post #Black-Friday! sale')).toBe(
      'Post #BlackFriday sale',
    );
  });
});

describe('sanitizeRedNoteTitle', () => {
  it('takes first line, strips hash, caps at 20', () => {
    expect(sanitizeRedNoteTitle('#Hello world\nmore')).toBe('Hello world');
    expect(sanitizeRedNoteTitle('abcdefghijklmnopqrstuvwxyz')).toBe(
      'abcdefghijklmnopqrst',
    );
  });
});
