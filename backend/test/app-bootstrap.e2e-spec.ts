import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('AppModule Bootstrap E2E Suite', () => {
  // A pure compile-time check of the full DI graph. Unit tests mock every dependency,
  // so they can't catch a module import mistake (missing provider, circular import,
  // wrong exports array) — this is the one test that wires every real module together
  // the same way `main.ts` does and asserts Nest can actually resolve it.
  it('should compile the full application module graph without missing/circular providers', async () => {
    process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/testdb';
    process.env.JWT_SECRET ||= 'test-secret-for-bootstrap-check';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 30_000);
});
