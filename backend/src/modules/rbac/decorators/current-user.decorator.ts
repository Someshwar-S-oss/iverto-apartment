import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (prop: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return null;
    if (prop === 'sub' || prop === 'userId' || prop === 'id') {
      return user.sub || user.userId || user.id;
    }
    return prop ? user[prop] : user;
  },
);
