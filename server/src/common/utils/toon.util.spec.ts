// `@toon-format/toon` is ESM-only; Jest's default transform can't parse its
// .mjs build. Mock it so this file tests `toPromptToon`'s own try/catch/
// fallback contract, not the vendor library's encoding correctness (that's
// the package's own concern, not ours to re-verify).
jest.mock('@toon-format/toon', () => ({
  encode: jest.fn(),
}));

import { encode } from '@toon-format/toon';
import { toPromptToon } from './toon.util';

const mockEncode = encode as jest.Mock;

describe('toPromptToon', () => {
  afterEach(() => {
    mockEncode.mockReset();
  });

  it('returns the TOON-encoded string on success', () => {
    mockEncode.mockReturnValue('users[1]{id,name}:\n  1,Ada');
    const data = { users: [{ id: 1, name: 'Ada' }] };

    expect(toPromptToon(data)).toBe('users[1]{id,name}:\n  1,Ada');
    expect(mockEncode).toHaveBeenCalledWith(data);
  });

  it('falls back to pretty JSON when encode throws', () => {
    mockEncode.mockImplementation(() => {
      throw new Error('encode failed');
    });
    const data = { a: 1, b: [1, 2, 3] };

    expect(toPromptToon(data)).toBe(JSON.stringify(data, null, 2));
  });

  it('falls back to a plain string when both encode and JSON.stringify fail', () => {
    mockEncode.mockImplementation(() => {
      throw new Error('encode failed');
    });
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    expect(toPromptToon(circular)).toEqual(expect.any(String));
  });
});
