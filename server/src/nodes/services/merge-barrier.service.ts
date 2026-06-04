import { Injectable } from '@nestjs/common';
import type { NodeExecutionInput, NodeExecutionResult } from '../types/node-execution.types';

/** Fan-in barrier — no LLM; marks merge point in the DAG. */
@Injectable()
export class MergeBarrierService {
  async execute(_input: NodeExecutionInput): Promise<NodeExecutionResult> {
    return {
      output: JSON.stringify({ merged: true }),
    };
  }
}
