import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Opt-in via the `Idempotency-Key` header: a guard's retry after a dropped connection
 * (gate wifi times out, guard presses again) replays the first response instead of
 * re-executing the handler — the same visitor admitted twice, a second OUT row for one
 * crossing, or a passcode use spent twice on one guest. The client generates the key
 * where the action happened, not where the request is sent, so a retry after a timeout
 * carries the *same* key.
 *
 * No header, no behaviour change — every route this decorates already worked fine
 * without one; this only ever replaces a duplicate execution, never blocks a distinct
 * one. Keyed on `(userId, controller.handler, key)` so two different guards (or two
 * different endpoints) reusing the same key value never collide.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers?.['idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return next.handle();
    }

    const userId = request.user?.sub || request.user?.userId || request.user?.id || 'anonymous';
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const cacheKey = `idem:${userId}:${route}:${idempotencyKey}`;

    return from(this.idempotency.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached !== null && cached !== undefined) {
          this.logger.debug(`Replaying cached response for idempotency key ${cacheKey}`);
          return of(cached);
        }

        // Only a successful response is worth replaying — if the original attempt threw,
        // a retry should get a real second attempt, not a cached failure.
        return next.handle().pipe(
          tap((response) => {
            this.idempotency
              .set(cacheKey, response, IDEMPOTENCY_TTL_SECONDS)
              .catch((err: any) => this.logger.warn(`Failed to persist idempotency record: ${err.message}`));
          }),
        );
      }),
    );
  }
}
