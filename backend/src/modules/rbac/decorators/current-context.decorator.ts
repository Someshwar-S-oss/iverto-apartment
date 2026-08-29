import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-active-context-id'] as string | undefined;
  },
);
