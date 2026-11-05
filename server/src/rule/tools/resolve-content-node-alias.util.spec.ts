import { resolveContentNodeAlias } from './resolve-content-node-alias.util';

describe('resolveContentNodeAlias', () => {
  const nodes = [
    { nodeId: 'node-img-1', type: 'image_generation' },
    { nodeId: 'node-text-1', type: 'text_generation' },
  ];

  it('returns exact when the requested id is already a real node id', () => {
    expect(resolveContentNodeAlias('node-img-1', nodes)).toEqual({
      kind: 'exact',
      nodeId: 'node-img-1',
    });
  });

  it('resolves a type word to the single matching node', () => {
    expect(resolveContentNodeAlias('image', nodes)).toEqual({
      kind: 'resolved',
      nodeId: 'node-img-1',
      matchedType: 'image_generation',
    });
  });

  it('is case/hyphen/space insensitive for type words', () => {
    expect(resolveContentNodeAlias('Text Generation', nodes)).toEqual({
      kind: 'resolved',
      nodeId: 'node-text-1',
      matchedType: 'text_generation',
    });
  });

  it('reports ambiguous when multiple nodes share the matched type', () => {
    const multi = [
      { nodeId: 'img-a', type: 'image_generation' },
      { nodeId: 'img-b', type: 'image_generation' },
    ];
    expect(resolveContentNodeAlias('image', multi)).toEqual({
      kind: 'ambiguous',
      candidates: ['img-a', 'img-b'],
      matchedType: 'image_generation',
    });
  });

  it('reports not_found for a hallucinated id that matches neither a real id nor a known alias', () => {
    expect(resolveContentNodeAlias('53d2abea-6eeb-415a-908a-a4a26b', nodes)).toEqual({
      kind: 'not_found',
    });
  });

  it('reports not_found for an empty string', () => {
    expect(resolveContentNodeAlias('   ', nodes)).toEqual({ kind: 'not_found' });
  });

  it('resolves transcription / subtitle words', () => {
    const media = [
      { nodeId: 'tr-1', type: 'transcription' },
      { nodeId: 'sub-1', type: 'subtitle' },
    ];
    expect(resolveContentNodeAlias('transcript', media)).toMatchObject({ kind: 'resolved', nodeId: 'tr-1' });
    expect(resolveContentNodeAlias('subtitles', media)).toMatchObject({ kind: 'resolved', nodeId: 'sub-1' });
    expect(resolveContentNodeAlias('srt', media)).toMatchObject({ kind: 'resolved', nodeId: 'sub-1' });
  });
});
