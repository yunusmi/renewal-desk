import 'reflect-metadata';
import { loadApiConfig } from './config/env';
import { createApp } from './api/create-app';

async function bootstrap(): Promise<void> {
  const cfg = loadApiConfig();
  const app = await createApp(cfg);
  await app.listen(cfg.port, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      msg: 'api failed to start',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
