import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ContentFilterService } from '../content-filter.service';
import { getFilterableFields } from '../decorators/filterable.decorator';

@Injectable()
export class ContentFilterPipe implements PipeTransform {
  constructor(private readonly filterService: ContentFilterService) {}

  async transform(value: any, metadata: ArgumentMetadata) {
    // Only process body params (not query, not param)
    if (metadata.type !== 'body' || !value || typeof value !== 'object') {
      return value;
    }

    const fields = getFilterableFields(value);
    if (fields.length === 0) return value;

    for (const field of fields) {
      const text = value[field];
      if (!text || typeof text !== 'string') continue;

      const result = await this.filterService.analyzeText(text);

      if (result.action === 'REJECT') {
        throw new BadRequestException({
          statusCode: 400,
          message: result.userMessage,
          error: 'Content Filter Violation',
          field,
          severity: result.severity,
        });
      }

      // Attach filter results for downstream use
      if (!value.__contentFilter) value.__contentFilter = {};
      value.__contentFilter[field] = result;
    }

    return value;
  }
}
