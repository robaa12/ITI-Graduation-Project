import {
  ArgumentMetadata,
  Injectable,
  PipeTransform,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class AdminPaginationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'query') {
      return value;
    }

    const { page, limit, search, sortBy, sortOrder } = value as {
      page?: string;
      limit?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
    };

    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const searchStr = search || undefined;
    const sortByStr = sortBy || undefined;
    const sortOrderStr = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    if (pageNum < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }

    return {
      page: pageNum,
      limit: limitNum,
      search: searchStr,
      sortBy: sortByStr,
      sortOrder: sortOrderStr,
    };
  }
}