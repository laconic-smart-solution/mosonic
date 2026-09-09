import { ImageDesignDirectionService } from './image-design-direction.service';

describe('ImageDesignDirectionService', () => {
  it('merges template and style prompts into one direction on success', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({
            content: '  A dense neon-lit urban scene with a strong central panel.  ',
          }),
      }),
    };
    const svc = new ImageDesignDirectionService(llm as never);

    const out = await svc.compose({
      templateName: 'Product Advertisement',
      templatePrompt: 'One dominant focal subject with clean negative space.',
      styleName: 'Cyberpunk',
      stylePrompt: 'Neon-lit dystopian urban futurism.',
    });

    expect(out).toBe('A dense neon-lit urban scene with a strong central panel.');
  });

  it('returns just the template prompt when no style is given', async () => {
    const llm = { getChatModelForPlainText: jest.fn() };
    const svc = new ImageDesignDirectionService(llm as never);

    const out = await svc.compose({
      templateName: 'Product Advertisement',
      templatePrompt: 'One dominant focal subject with clean negative space.',
    });

    expect(out).toBe('One dominant focal subject with clean negative space.');
    expect(llm.getChatModelForPlainText).not.toHaveBeenCalled();
  });

  it('falls back to a plain concatenation when the model call throws', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.reject(new Error('provider down')),
      }),
    };
    const svc = new ImageDesignDirectionService(llm as never);

    const out = await svc.compose({
      templateName: 'Product Advertisement',
      templatePrompt: 'One dominant focal subject.',
      styleName: 'Cyberpunk',
      stylePrompt: 'Neon-lit dystopian urban futurism.',
    });

    expect(out).toBe('One dominant focal subject. Neon-lit dystopian urban futurism.');
  });

  it('falls back to a plain concatenation when the response is empty', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: '   ' }),
      }),
    };
    const svc = new ImageDesignDirectionService(llm as never);

    const out = await svc.compose({
      templateName: 'Product Advertisement',
      templatePrompt: 'One dominant focal subject.',
      styleName: 'Cyberpunk',
      stylePrompt: 'Neon-lit dystopian urban futurism.',
    });

    expect(out).toBe('One dominant focal subject. Neon-lit dystopian urban futurism.');
  });
});
