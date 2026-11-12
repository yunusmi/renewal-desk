import { Injectable, PipeTransform } from '@nestjs/common';
import { ApiError } from '../common/errors';

/** Path IDs: bounded length and charset before reaching SQL (values are always bound). */
@Injectable()
export class IdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(value)) {
      throw new ApiError(400, 'validation_error', 'Некорректный идентификатор');
    }
    return value;
  }
}
