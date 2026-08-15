import { BadRequestException } from '@nestjs/common';

import { extractDocumentText } from './document-extractor';

describe('extractDocumentText', () => {
  it('accepts bounded plain text documents', async () => {
    await expect(
      extractDocumentText({
        originalname: 'brand.txt',
        mimetype: 'text/plain',
        size: 18,
        buffer: Buffer.from('  Approved claims  '),
      }),
    ).resolves.toBe('Approved claims');
  });

  it('rejects a file that claims to be a PDF without a PDF signature', async () => {
    await expect(
      extractDocumentText({
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: 12,
        buffer: Buffer.from('not a pdf'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
