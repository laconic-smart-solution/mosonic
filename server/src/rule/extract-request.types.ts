import type { Express } from 'express';
import type { RuleIntakeAnswers } from './rule-intake.types';

/** Multer file shape used by rule extraction / preprocessing. */
export type RuleExtractFile = Pick<
  Express.Multer.File,
  'buffer' | 'originalname' | 'mimetype'
>;

export type RuleExtractRequest = {
  input: string;
  files: RuleExtractFile[];
  urls: string[];
  intake?: RuleIntakeAnswers;
};
