import {
  parseIntakeMultipart,
  parseRuleExtractMultipart,
  parseUrlsMultipart,
} from './extract-multipart';
import type { RuleIntakeAnswers } from './rule-intake.types';

describe('parseIntakeMultipart', () => {
  it('returns undefined when empty', () => {
    expect(parseIntakeMultipart(undefined)).toBeUndefined();
    expect(parseIntakeMultipart('')).toBeUndefined();
  });

  it('parses express intake', () => {
    const intake = parseIntakeMultipart(
      JSON.stringify({ mode: 'express', contentPurpose: 'social_marketing' }),
    );
    expect(intake?.mode).toBe('express');
    expect(intake?.contentPurpose).toBe('social_marketing');
  });
});

describe('parseRuleExtractMultipart', () => {
  it('requires sources for express mode', () => {
    expect(() =>
      parseRuleExtractMultipart(
        [],
        '',
        undefined,
        JSON.stringify({ mode: 'express' }),
      ),
    ).toThrow();
  });

  it('allows guided intake without files', () => {
    const intake: RuleIntakeAnswers = {
      mode: 'guided',
      contentPurpose: 'internal_comms',
      channels: [{ channel: 'linkedin', priority: 'high' }],
    };
    const req = parseRuleExtractMultipart(
      [],
      '',
      undefined,
      JSON.stringify(intake),
    );
    expect(req.intake?.mode).toBe('guided');
    expect(req.input).toBe('');
  });

  it('still accepts text-only without intake', () => {
    const req = parseRuleExtractMultipart([], 'hello', undefined);
    expect(req.input).toBe('hello');
  });
});

describe('parseUrlsMultipart', () => {
  it('parses url array', () => {
    expect(parseUrlsMultipart(JSON.stringify(['https://example.com']))).toEqual(
      ['https://example.com/'],
    );
  });

  it('normalizes bare hosts', () => {
    expect(parseUrlsMultipart(JSON.stringify(['zenichub.com/en']))).toEqual([
      'https://zenichub.com/en',
    ]);
  });
});

describe('parseRuleExtractMultipart urls from text', () => {
  it('extracts urls pasted only in input', () => {
    const req = parseRuleExtractMultipart(
      [],
      'Create a rule from https://zenichub.com/en',
      undefined,
    );
    expect(req.urls).toEqual(['https://zenichub.com/en']);
  });
});
