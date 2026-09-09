import { ContentStatus as PrismaContentStatus } from '@prisma/client';

export const ContentStatus = {
  ...PrismaContentStatus,
  Draft: PrismaContentStatus.draft,
  InReview: PrismaContentStatus.in_review,
  Approved: PrismaContentStatus.approved,
  Rejected: PrismaContentStatus.rejected,
} as const;

export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export interface ApprovalStepDef {
  role: string;
  required: boolean;
}

export interface ApprovalRecord {
  stepIndex: number;
  userId: string;
  at: Date;
  comment: string | null;
}

export interface ContentApprovalState {
  steps: ApprovalStepDef[];
  currentStepIndex: number;
  records: ApprovalRecord[];
}

export interface ContentOutputs {
  keywords?: string;
  text?: string;
  image?: string;
  translatedText?: string;
  video?: string;
  transcription?: string;
  summary?: string;
}

export interface ContentUserEdits {
  keywords?: string;
  text?: string;
  translatedText?: string;
  image?: string;
  video?: string;
  transcription?: string;
  summary?: string;
}

export interface ContentVersionEntry {
  versionNumber: number;
  outputs: ContentOutputs;
  userEdits: ContentUserEdits;
  nodePromptOverrides: Record<string, string>;
  createdAt: Date;
}

export interface Content {
  contentId: string;
  userId?: string;
  pipelineRef: string;
  workflowRef: string;
  ruleRef: string;
  outputs: ContentOutputs;
  userEdits: ContentUserEdits;
  nodePromptOverrides: Record<string, string>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
  laneOutputs: Record<string, Record<string, unknown>>;
  currentVersion?: number;
  versions?: ContentVersionEntry[];
  status: ContentStatus;
  approval: ContentApprovalState;
  variantId?: string | null;
  experimentId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContentDocument = Content;
