import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

export function setupDocs(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('RenewalDesk API')
    .setDescription(
      'Same-origin API. Login creates an HttpOnly cookie. Fetch /api/v1/auth/csrf and send its csrf_token as X-CSRF-Token for mutations. Origin must equal APP_ORIGIN. POST retries use the immutable operation key; GET checks do not count as POST attempts.',
    )
    .setVersion('1.0')
    .addCookieAuth('renewaldesk_session', { type: 'apiKey', in: 'cookie' }, 'session')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs/swagger', app, document, {
    jsonDocumentUrl: '/docs/openapi.json',
    swaggerOptions: { persistAuthorization: false, withCredentials: true },
  });
  const assets = path.resolve(__dirname, '..', '..', 'public', 'docs');
  app.useStaticAssets(assets, {
    prefix: '/docs/assets/',
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
  app.use('/docs', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || (req.path !== '/' && req.path !== '')) {
      next();
      return;
    }
    res
      .type('html')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RenewalDesk API</title><link rel="stylesheet" href="/docs/assets/styles.min.css"><script src="/docs/assets/web-components.min.js" defer></script></head><body style="margin:0;height:100vh"><elements-api apiDescriptionUrl="/docs/openapi.json" router="hash" layout="sidebar" tryItCredentialsPolicy="same-origin"></elements-api></body></html>`,
      );
  });
}
