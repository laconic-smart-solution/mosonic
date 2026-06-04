import type { Express } from 'express';

/** Multer file shape used by rule extraction / preprocessing. */
export type RuleExtractFile = Pick<
  Express.Multer.File,
  'buffer' | 'originalname' | 'mimetype'
>;

export type RuleExtractRequest = {
  input: string;
  files: RuleExtractFile[];
  urls: string[];
};
