import { BadRequestException } from '@nestjs/common';

import { jsonByteLength } from '../../common/validators/max-json-size.validator';

/** A resume payload is an approval or a small correction, never a document. */
const MAX_RESUME_BYTES = 32 * 1024;

export interface ResumeRequest {
  /**
   * Suspended step to resume. Optional: when the run is waiting on exactly one
   * step, Mastra resolves it itself.
   */
  step?: string | string[];
  /** Whatever that step's resume schema expects. */
  resumeData: unknown;
}

/**
 * Validates the shape a resume endpoint accepts. Only `step` is checked —
 * `resumeData` belongs to the workflow's own schema, so it is forwarded as-is
 * and Mastra rejects it if wrong, consistent with how run input is handled.
 */
export function parseResumeRequest(body: unknown): ResumeRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }

  const { step, resumeData } = body as Record<string, unknown>;

  const isValidStep =
    step === undefined ||
    typeof step === 'string' ||
    (Array.isArray(step) && step.every((s) => typeof s === 'string'));

  if (!isValidStep) {
    throw new BadRequestException(
      'step must be a string or an array of strings',
    );
  }

  if (jsonByteLength(resumeData) > MAX_RESUME_BYTES) {
    throw new BadRequestException(
      `resumeData must serialise to at most ${MAX_RESUME_BYTES} bytes`,
    );
  }

  return { step, resumeData };
}
