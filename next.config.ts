import type { NextConfig } from 'next';
import { ROUTE_SLUGS } from './src/lib/domain/routes';

const PAGES = Object.entries(ROUTE_SLUGS) as [keyof typeof ROUTE_SLUGS, string][];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Old, readable paths redirect to the opaque ones so bookmarks keep working.
  async redirects() {
    return PAGES.map(([page, slug]) => ({ source: `/${page}`, destination: `/${slug}`, permanent: false }));
  },
  // The opaque path serves the real page while the address bar keeps the slug.
  async rewrites() {
    return PAGES.map(([page, slug]) => ({ source: `/${slug}`, destination: `/${page}` }));
  }
};

export default nextConfig;
