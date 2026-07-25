import { Injectable } from '@nestjs/common';
import { GeneratedContent } from '@prisma/client';

import { ExportFormat } from './dto/export-content.dto';

export interface ExportedFile {
  filename: string;
  contentType: string;
  body: string;
}

const CSV_COLUMNS = [
  'id',
  'type',
  'title',
  'body',
  'format',
  'status',
  'version',
  'isEdited',
  'model',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Turns stored agent output into a downloadable file.
 *
 * JSON is the lossless format and always carries `payload` exactly as the
 * agent returned it. Markdown and CSV are renderings of the readable fields,
 * falling back to the serialised payload when the agent sent no `body`.
 */
@Injectable()
export class ContentExportService {
  export(
    contents: GeneratedContent[],
    format: ExportFormat,
    baseName: string,
  ): ExportedFile {
    const filename = `${this.slugify(baseName)}-content`;

    switch (format) {
      case ExportFormat.MARKDOWN:
        return {
          filename: `${filename}.md`,
          contentType: 'text/markdown; charset=utf-8',
          body: this.toMarkdown(contents),
        };
      case ExportFormat.CSV:
        return {
          filename: `${filename}.csv`,
          contentType: 'text/csv; charset=utf-8',
          body: this.toCsv(contents),
        };
      case ExportFormat.JSON:
      default:
        return {
          filename: `${filename}.json`,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(contents, null, 2),
        };
    }
  }

  private toMarkdown(contents: GeneratedContent[]): string {
    if (contents.length === 0) {
      return '_No generated content._\n';
    }

    return contents
      .map((content) => {
        const heading = content.title ?? content.type;
        const meta = `_${content.type} · v${content.version} · ${content.status}${
          content.isEdited ? ' · edited' : ''
        }_`;

        return `## ${heading}\n\n${meta}\n\n${this.readableBody(content)}\n`;
      })
      .join('\n---\n\n');
  }

  private toCsv(contents: GeneratedContent[]): string {
    const header = CSV_COLUMNS.join(',');
    const rows = contents.map((content) =>
      CSV_COLUMNS.map((column) =>
        this.escapeCsv(
          column === 'body'
            ? this.readableBody(content)
            : this.stringify(content[column]),
        ),
      ).join(','),
    );

    return [header, ...rows].join('\n') + '\n';
  }

  /** Prefers the agent's readable body, otherwise serialises its payload. */
  private readableBody(content: GeneratedContent): string {
    if (content.body) {
      return content.body;
    }

    if (content.payload !== null && content.payload !== undefined) {
      return JSON.stringify(content.payload, null, 2);
    }

    return content.error ? `Generation failed: ${content.error}` : '';
  }

  private stringify(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value) ?? '';
  }

  private escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    return slug || 'export';
  }
}
