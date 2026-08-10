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
   * Creates then starts one fixed run id without holding an HTTP request open
   * for the full model workflow. Mastra's `start-async` route can hit an
   * upstream 504 while the run itself continues; `start` returns immediately
   * and we inspect that exact run until it settles.
   */
  async startRun<TResult>(
    workflowId: MastraWorkflowId,
    runId: string,
    inputData: unknown,
  ): Promise<MastraWorkflowResult<TResult>> {
    this.logger.log(`Starting ${workflowId} run ${runId}`);

    // Mastra's non-blocking `start` endpoint deliberately requires a run that
    // has already been created. Supplying our database's UUID here keeps the
    // UI, backend record, and Studio entry tied to one execution.
    await this.request(
      'POST',
      `/api/workflows/${workflowId}/create-run?runId=${encodeURIComponent(runId)}`,
    );
    await this.request(
      'POST',
      `/api/workflows/${workflowId}/start?runId=${encodeURIComponent(runId)}`,
      { inputData },
    );
    return this.waitForRun<TResult>(workflowId, runId);
  }

  /**
   * Resumes a suspended run. `step` names the suspended step Mastra is waiting
   * on; `resumeData` is whatever that step's resume schema expects. `step` is
   * omitted from the body entirely when the caller does not supply one, so
   * Mastra can fall back to the single suspended step rather than being handed
   * an explicit `undefined`.
   */
  async resumeRun<TResult>(
    workflowId: MastraWorkflowId,
    runId: string,
    step: string | string[] | undefined,
    resumeData: unknown,
  ): Promise<MastraWorkflowResult<TResult>> {
    this.logger.log(`Resuming ${workflowId} run ${runId}`);

    await this.request(
      'POST',
      `/api/workflows/${workflowId}/resume?runId=${encodeURIComponent(runId)}`,
      { ...(step === undefined ? {} : { step }), resumeData },
    );
    return this.waitForRun<TResult>(workflowId, runId);
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

  async indexKnowledgeSource(input: {
    projectId: string;
    sourceId: string;
    sourceType: string;
    name: string;
    url?: string | null;
    content: string;
    documents?: Array<{ pageId: string; title: string; url: string; content: string }>;
  }): Promise<{ chunkCount: number; embeddingModel?: string; indexVersion?: string }> {
    const token = this.config.get<string>('mastra.internalToken');
    if (!token) {
      throw new MastraRequestError(
        'MASTRA_INTERNAL_TOKEN is required before knowledge indexing can run',
      );
    }
    return this.request(
      'POST',
      '/internal/knowledge/index',
      input,
      { 'X-Mastra-Internal-Token': token },
    );
  }

  async deleteKnowledgeSource(sourceId: string): Promise<void> {
    const token = this.config.get<string>('mastra.internalToken');
    if (!token) return;
    await this.request(
      'POST',
      '/internal/knowledge/delete',
      { sourceId },
      { 'X-Mastra-Internal-Token': token },
    );
  }

  async queryProjectKnowledge(projectId: string, sourceIds: string[], query: string): Promise<{ answer: string; citations: Array<{
    sourceId: string; pageId?: string; chunkId?: string; sourceType: string; title: string; url?: string; excerpt: string; score: number;
  }> }> {
    const token = this.config.get<string>('mastra.internalToken');
    if (!token) throw new MastraRequestError('MASTRA_INTERNAL_TOKEN is required before knowledge retrieval can run');
    return this.request<{ answer: string; citations: Array<{
      sourceId: string; pageId?: string; chunkId?: string; sourceType: string; title: string; url?: string; excerpt: string; score: number;
    }> }>('POST', '/internal/knowledge/query', { projectId, sourceIds, query }, { 'X-Mastra-Internal-Token': token });
  }

  private async waitForRun<TResult>(
    workflowId: MastraWorkflowId,
    runId: string,
  ): Promise<MastraWorkflowResult<TResult>> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const state = (await this.getRun(workflowId, runId)) as {
        status?: string;
        result?: TResult;
        error?: unknown;
        steps?: Record<string, unknown>;
        suspended?: unknown;
      };

      if (
        state.status === 'success' ||
        state.status === 'failed' ||
        state.status === 'suspended'
      ) {
        return {
          status: state.status,
          result: state.result,
          error: state.error,
          steps: state.steps,
          suspended: state.suspended,
        };
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
    }

    throw new MastraRequestError(
      `Mastra run ${runId} did not settle within ${this.timeoutMs}ms`,
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers:
          body || extraHeaders
            ? { ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }
            : undefined,
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
