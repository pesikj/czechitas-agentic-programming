// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // The dev toolbar is not part of the product and adds noise to browser tests.
  devToolbar: { enabled: false },
  security: {
    checkOrigin: true,
    // Behind the HTTPS reverse proxy, take the public protocol and host from its X-Forwarded-*
    // headers; otherwise the app sees http://localhost:4321 and the origin check rejects every
    // form post. Only the proxy can reach the app in production (Railway), and it sets these
    // headers itself. The domain is set at runtime, so any https host is accepted.
    allowedDomains: [{ protocol: 'https' }],
    // Scripts and styles are allowed by hash (Astro adds them); everything else only from this site.
    // External images are deliberately not loaded: they would bypass sign-in and expose learners.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ],
    },
  },
});
