import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MastraRequestError,
  MastraWorkflowId,
  MastraWorkflowResult,
} from './mastra.types';

/**
 * Thin HTTP client for the Mastra service.
 *
 * The Mastra workspace is a separate ESM/Node 22 project that is deliberately
 * not part of this repo, so it is reached over HTTP and never imported. Every
 * path lives in one place here: if the Mastra REST surface shifts, this file is
 * the only thing that has to change.
 */
@Injectable()
export class MastraClient {
  private readonly logger = new Logger(MastraClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    // Trailing slashes would produce `//api/...` once joined.
    this.baseUrl = this.config
      .getOrThrow<string>('mastra.baseUrl')
      .replace(/\/+$/, '');
    this.timeoutMs = this.config.getOrThrow<number>('mastra.timeoutMs');
  }

  /**
   * Reserves a run id without starting any work. Called before the run so the
   * id can be persisted first — a crash mid-start then leaves a row that still
   * points at something inspectable on the Mastra side.
   */
  async createRun(workflowId: MastraWorkflowId): Promise<string> {
    const body = await this.request<{ runId?: string }>(
      'POST',
      `/api/workflows/${workflowId}/create-run`,
    );

    if (!body?.runId) {
      throw new MastraRequestError(
        `Mastra did not return a runId when creating a run for ${workflowId}`,
      );
    }

    return body.runId;
  }

  /**
   * Runs the workflow to completion (or to a suspend point) and returns the
   * envelope. This blocks for as long as the workflow takes, which is why it is
   * only ever called from a queue worker and never from a request handler.
   */
  async startRun<TResult>(
    workflowId: MastraWorkflowId,
    runId: string,
    inputData: unknown,
  ): Promise<MastraWorkflowResult<TResult>> {
    this.logger.log(`Starting ${workflowId} run ${runId}`);

    return this.request<MastraWorkflowResult<TResult>>(
      'POST',
      `/api/workflows/${workflowId}/start-async?runId=${encodeURIComponent(runId)}`,
      { inputData },
    );
  }

  /**
   * Resumes a suspended run. `step` names the suspended step Mastra is waiting
   * on; `resumeData` is whatever that step's resume schema expects.
   */
  async resumeRun<TResult>(
    workflowId: MastraWorkflowId,
    runId: string,
    step: string | string[],
    resumeData: unknown,
  ): Promise<MastraWorkflowResult<TResult>> {
    this.logger.log(`Resuming ${workflowId} run ${runId}`);

    return this.request<MastraWorkflowResult<TResult>>(
      'POST',
      `/api/workflows/${workflowId}/resume-async?runId=${encodeURIComponent(runId)}`,
      { step, resumeData },
    );
  }

  /**
   * Current server-side state of a run. Only needed for diagnostics — the
   * authoritative status for clients is the row in our own database, which the
   * worker keeps up to date.
   */
  async getRun(workflowId: MastraWorkflowId, runId: string): Promise<unknown> {
    return this.request(
      'GET',
      `/api/workflows/${workflowId}/runs/${encodeURIComponent(runId)}`,
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body === undefined ? undefined : JSON.stringify(body),
        // A workflow chains six or seven agents, so the ceiling is minutes, not
        // seconds. Without it a hung Mastra process would pin a worker forever.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new MastraRequestError(
        `Could not reach Mastra at ${url}: ${reason}`,
      );
    }

    const text = await response.text();

    if (!response.ok) {
      throw new MastraRequestError(
        `Mastra returned ${response.status} for ${method} ${path}`,
        response.status,
        text.slice(0, 2_000),
      );
    }

    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new MastraRequestError(
        `Mastra returned a non-JSON body for ${method} ${path}`,
        response.status,
        text.slice(0, 2_000),
      );
    }
  }
}
