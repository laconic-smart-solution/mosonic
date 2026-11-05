import { createAskUserTool } from './ask-user.tool';

describe('createAskUserTool', () => {
  const ask = createAskUserTool();

  it('defaults yes_no to Yes/No when options are omitted', async () => {
    const raw = await ask.invoke({ type: 'yes_no', question: 'Create the profile?' });
    expect(JSON.parse(raw as string)).toEqual({
      action: 'ask_user',
      type: 'yes_no',
      question: 'Create the profile?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    });
  });

  it('rejects single/multi without enough options', async () => {
    const raw = await ask.invoke({
      type: 'multi',
      question: 'Which platforms?',
      options: [{ id: 'ig', label: 'Instagram' }],
    });
    expect(raw).toContain('at least two options');
  });

  it('marks website/URL options (or explicit inputType) as needing a URL field', async () => {
    const raw = await ask.invoke({
      type: 'single',
      question: 'How should we start?',
      options: [
        { id: 'name_industry', label: 'I can share the name and industry' },
        { id: 'website_url', label: 'I have a website URL' },
        { id: 'site', label: 'Paste it', inputType: 'url' },
      ],
    });
    expect(JSON.parse(raw as string).options).toEqual([
      { id: 'name_industry', label: 'I can share the name and industry' },
      { id: 'website_url', label: 'I have a website URL', inputType: 'url' },
      { id: 'site', label: 'Paste it', inputType: 'url' },
    ]);
  });
});
