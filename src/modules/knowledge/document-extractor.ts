import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { BadRequestException } from '@nestjs/common';

const execFileAsync = promisify(execFile);
const MAX_EXTRACTED_CHARACTERS = 250_000;

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export async function extractDocumentText(
  file: UploadedDocumentFile,
): Promise<string> {
  if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
    return boundedText(file.buffer.toString('utf8'));
  }

  if (
    file.mimetype !== 'application/pdf' ||
    file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new BadRequestException('Upload a valid PDF, TXT, or Markdown file');
  }

  const directory = await mkdtemp(join(tmpdir(), 'knowledge-pdf-'));
  const inputPath = join(directory, 'source.pdf');
  try {
    await writeFile(inputPath, file.buffer, { flag: 'wx' });
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-layout', inputPath, '-'],
      { timeout: 20_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
    );
    return boundedText(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(
      message.includes('ENOENT')
        ? 'PDF extraction is unavailable because pdftotext is not installed'
        : 'The PDF could not be read or contains no extractable text',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function boundedText(value: string): string {
  const text = value.replaceAll('\u0000', '').trim();
  if (!text) {
    throw new BadRequestException('The document contains no readable text');
  }
  if (text.length > MAX_EXTRACTED_CHARACTERS) {
    throw new BadRequestException(
      `Extracted document text cannot exceed ${MAX_EXTRACTED_CHARACTERS} characters`,
    );
  }
  return text;
}
