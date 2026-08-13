/**
 * Static export.
 *
 * Cloudflare Pages can run Next.js server-side through `@cloudflare/next-on-pages`,
 * but this site is one page of text with no data, no auth and nothing dynamic.
 * `output: 'export'` produces plain HTML that Pages serves from its CDN with no
 * adapter, no worker, no build plugin and nothing that can break on a Next
 * major. Revisit the moment the site needs a server.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  // Pages serves /path/ as /path/index.html; trailing slashes keep the two agreeing.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
