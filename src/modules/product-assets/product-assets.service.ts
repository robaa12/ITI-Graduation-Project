import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

export interface UploadedProductAsset {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SELECTED_ASSETS = 5;

@Injectable()
export class ProductAssetsService {
  private readonly bucket?: string;
  private readonly client?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    config: ConfigService,
  ) {
    const endpoint = config.get<string>('productAssets.endpoint');
    const bucket = config.get<string>('productAssets.bucket');
    const accessKeyId = config.get<string>('productAssets.accessKeyId');
    const secretAccessKey = config.get<string>('productAssets.secretAccessKey');
    this.bucket = bucket;
    if (endpoint && bucket && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint,
        region: config.get<string>('productAssets.region') ?? 'us-east-1',
        forcePathStyle: config.get<boolean>('productAssets.forcePathStyle') ?? true,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async list(userId: string, projectId: string) {
    await this.projects.findOwnedOrFail(userId, projectId);
    const assets = await this.prisma.productAsset.findMany({
      where: { projectId }, orderBy: { createdAt: 'desc' },
    });
    return Promise.all(assets.map(async (asset) => ({
      ...asset,
      previewUrl: await this.signedUrl(asset.objectKey),
    })));
  }

  async upload(userId: string, projectId: string, file: UploadedProductAsset) {
    this.ensureConfigured();
    await this.projects.findOwnedOrFail(userId, projectId);
    this.validateFile(file);
    const extension = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype.split('/')[1];
    const objectKey = `projects/${projectId}/product-assets/${randomUUID()}.${extension}`;
    await this.client!.send(new PutObjectCommand({
      Bucket: this.bucket!, Key: objectKey, Body: file.buffer,
      ContentType: file.mimetype, CacheControl: 'private, max-age=3600',
    }));
    const asset = await this.prisma.productAsset.create({
      data: {
        projectId, objectKey, mimeType: file.mimetype, sizeBytes: file.size,
        name: file.originalname.slice(0, 160),
      },
    });
    return { ...asset, previewUrl: await this.signedUrl(asset.objectKey) };
  }

  async remove(userId: string, projectId: string, assetId: string) {
    this.ensureConfigured();
    await this.projects.findOwnedOrFail(userId, projectId);
    const asset = await this.prisma.productAsset.findFirst({ where: { id: assetId, projectId } });
    if (!asset) throw new NotFoundException(`Product asset ${assetId} not found`);
    await this.prisma.productAsset.delete({ where: { id: asset.id } });
    await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucket!, Key: asset.objectKey }));
  }

  async assertOwned(projectId: string, assetIds: string[]) {
    if (assetIds.length > MAX_SELECTED_ASSETS) {
      throw new BadRequestException(`Select at most ${MAX_SELECTED_ASSETS} product images`);
    }
    if (new Set(assetIds).size !== assetIds.length) {
      throw new BadRequestException('Product images must not be repeated');
    }
    const count = await this.prisma.productAsset.count({ where: { projectId, id: { in: assetIds } } });
    if (count !== assetIds.length) throw new BadRequestException('One or more product images do not belong to this project');
  }

  async resolveForWorkflow(projectId: string, assetIds: string[]) {
    await this.assertOwned(projectId, assetIds);
    const found = await this.prisma.productAsset.findMany({ where: { projectId, id: { in: assetIds } } });
    const byId = new Map(found.map((asset) => [asset.id, asset]));
    return Promise.all(assetIds.map(async (id) => {
      const asset = byId.get(id)!;
      return { id: asset.id, name: asset.name, mimeType: asset.mimeType, url: await this.signedUrl(asset.objectKey) };
    }));
  }

  private validateFile(file: UploadedProductAsset) {
    if (!ACCEPTED_TYPES.has(file.mimetype)) throw new BadRequestException('Upload a JPEG, PNG, or WebP product image');
    if (!file.size || file.size > MAX_FILE_BYTES) throw new BadRequestException('Product images must be 10 MB or smaller');
    if (!file.buffer?.length) throw new BadRequestException('The uploaded product image is empty');
    if (!matchesImageSignature(file.buffer, file.mimetype)) throw new BadRequestException('The file contents do not match the selected image type');
  }

  private async signedUrl(objectKey: string) {
    this.ensureConfigured();
    return getSignedUrl(this.client!, new GetObjectCommand({ Bucket: this.bucket!, Key: objectKey }), { expiresIn: 60 * 30 });
  }

  private ensureConfigured() {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Product image storage is not configured');
  }
}

function matchesImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}
