import {
  extractRelativePathFromFileProxy,
  resolveAbsoluteMediaUrl,
  sourceImageFetchUrls,
} from './resolve-absolute-media-url.util';

describe('resolveAbsoluteMediaUrl', () => {
  const ctx = {
    fileServiceUrl: 'https://pdn-api-files.laconic.co.th/api/file/v1',
    publicBaseUrl: 'https://app.example.com',
  };

  it('returns https URLs unchanged', () => {
    const url = 'https://cdn.example.com/video.mp4';
    expect(resolveAbsoluteMediaUrl(url, ctx)).toBe(url);
  });

  it('repairs port-stripped file proxy URLs', () => {
    const relativePath =
      'testing/neural-tex/videos/7ae54de3-dc1c-472a-b0bd-f301e434c0d7/e1c753e0-9136-4e67-abf8-107587cb833f.mp4';
    const broken = `4001/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`;
    expect(resolveAbsoluteMediaUrl(broken, ctx)).toBe(
      `https://pdn-api-files.laconic.co.th/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`,
    );
  });

  it('resolves /api/file/v1/file paths via file service', () => {
    const relativePath = 'testing/neural-tex/videos/a.mp4';
    const path = `/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`;
    expect(resolveAbsoluteMediaUrl(path, ctx)).toBe(
      `https://pdn-api-files.laconic.co.th/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`,
    );
  });

  it('resolves root-relative paths via public base', () => {
    expect(resolveAbsoluteMediaUrl('/uploads/video.mp4', ctx)).toBe(
      'https://app.example.com/uploads/video.mp4',
    );
  });

  it('resolves bare relative paths via file service query', () => {
    const relativePath = 'testing/neural-tex/videos/a.mp4';
    expect(resolveAbsoluteMediaUrl(relativePath, ctx)).toBe(
      `https://pdn-api-files.laconic.co.th/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`,
    );
  });

  it('extracts relativePath from a port-stripped file proxy URL', () => {
    const relativePath =
      'testing/neural-tex/workflow-images/wf/1e313621-4500-404a-ad45-455a4c00eaae.png';
    const broken = `4001/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`;
    expect(extractRelativePathFromFileProxy(broken)).toBe(relativePath);
  });

  it('builds fetchable http URLs from a 4001/api/file image ref', () => {
    const relativePath = 'rule-assets/cf317/logo.png';
    const urls = sourceImageFetchUrls(
      {
        fileUrl: `4001/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`,
      },
      ctx,
    );
    expect(urls.every((url) => url.startsWith('https://'))).toBe(true);
    expect(urls.some((url) => url.includes(encodeURIComponent(relativePath)))).toBe(
      true,
    );
  });
});
