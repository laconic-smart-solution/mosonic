import { splitThoughtAndAnswer } from './split-thought.util';

describe('splitThoughtAndAnswer', () => {
  it('returns the whole text as the answer when there is no Thought prefix', () => {
    expect(splitThoughtAndAnswer('Just a post.')).toEqual({
      thought: null,
      answer: 'Just a post.',
    });
  });

  it('splits a Thought line from the answer', () => {
    expect(
      splitThoughtAndAnswer(
        'Thought: Brand brief is enough, no search.\n\nHere is the post.',
      ),
    ).toEqual({
      thought: 'Brand brief is enough, no search.',
      answer: 'Here is the post.',
    });
  });

  it('treats a Thought-only message as thought with an empty answer', () => {
    expect(splitThoughtAndAnswer('Thought: I will search the PDF.')).toEqual({
      thought: 'I will search the PDF.',
      answer: '',
    });
  });

  it('collapses a sentence the model echoed twice in a row', () => {
    expect(
      splitThoughtAndAnswer(
        "Thought: Need the brand name first.\n\nWhat's your brand name?\nWhat's your brand name?",
      ),
    ).toEqual({
      thought: 'Need the brand name first.',
      answer: "What's your brand name?",
    });
  });

  it('strips several stacked Thought lines and markdown Thought prefixes', () => {
    expect(
      splitThoughtAndAnswer(
        'Thought: First.\nThought: Second.\n\nHere you go.',
      ),
    ).toEqual({ thought: 'First. Second.', answer: 'Here you go.' });
    expect(splitThoughtAndAnswer('**Thought:** Plan.\nAnswer.')).toEqual({
      thought: 'Plan.',
      answer: 'Answer.',
    });
  });

  it('never returns a raw Thought prefix as the answer', () => {
    const { answer } = splitThoughtAndAnswer('Thought: only a plan, nothing else');
    expect(answer).toBe('');
    expect(answer).not.toMatch(/thought:/i);
  });
});
