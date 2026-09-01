import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { catchError, firstValueFrom } from 'rxjs';
import { DrizzleService } from '../../database/drizzle.service';
import { RlsContext } from '../../database/rls.helper';

/** Postgres error code for a row-level-security policy violation. */
const RLS_VIOLATION_CODE = '42501';

/**
 * Wraps the rest of an HTTP request in a tenant-scoped database transaction whenever
 * RbacScopeGuard resolved one (see request.rlsContext there). Everything the route
 * handler and every service it calls awaits — however many layers deep — sees the
 * scoped transaction through DrizzleService.db, with no explicit passing required.
 *
 * Routes RbacScopeGuard never ran for (no @RequirePermission, or a guard list that
 * omits RbacScopeGuard entirely) get no rlsContext and this interceptor no-ops for
 * them; those routes either don't touch RLS-protected tables or scope themselves
 * explicitly (see EntryEventsService.getVisitorPhotoForUser).
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(private readonly drizzle: DrizzleService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const rlsContext: RlsContext | undefined = request?.rlsContext;

    if (!rlsContext) {
      return next.handle();
    }

    return from(
      this.drizzle.withTenantContext(rlsContext, () =>
        firstValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    ).pipe(
      catchError((err) => {
        // A WITH CHECK / policy violation can legitimately happen when an
        // application-layer check misses a cross-tenant write that RLS then catches —
        // that's the point of having both layers. Surface it as a clean 403 instead of
        // the raw Postgres error.
        if (err?.code === RLS_VIOLATION_CODE) {
          return throwError(
            () => new ForbiddenException('This action is not permitted for the current tenant context'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
