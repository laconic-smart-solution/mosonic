import {
  buildFileStorageFolderPath,
  resolveFileStorageEnvironment,
} from './file-storage-path.util';

describe('file-storage-path.util', () => {
  const prev = process.env.CURRENT_ENVIRONMENT;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.CURRENT_ENVIRONMENT;
    } else {
      process.env.CURRENT_ENVIRONMENT = prev;
    }
  });

  it('resolveFileStorageEnvironment returns testing or production only', () => {
    process.env.CURRENT_ENVIRONMENT = 'testing';
    expect(resolveFileStorageEnvironment()).toBe('testing');
    process.env.CURRENT_ENVIRONMENT = 'PRODUCTION';
    expect(resolveFileStorageEnvironment()).toBe('production');
    process.env.CURRENT_ENVIRONMENT = 'dev';
    expect(resolveFileStorageEnvironment()).toBeNull();
  });

  it('buildFileStorageFolderPath prefixes testing', () => {
    process.env.CURRENT_ENVIRONMENT = 'testing';
    expect(buildFileStorageFolderPath('videos', 'pipe-1')).toBe(
      'testing/neural-tex/videos/pipe-1',
    );
  });

  it('buildFileStorageFolderPath prefixes production', () => {
    process.env.CURRENT_ENVIRONMENT = 'production';
    expect(buildFileStorageFolderPath('images')).toBe(
      'production/neural-tex/images',
    );
  });

  it('buildFileStorageFolderPath keeps legacy path when env unset', () => {
    delete process.env.CURRENT_ENVIRONMENT;
    expect(buildFileStorageFolderPath('videos')).toBe('neural-tex/videos');
  });
});
