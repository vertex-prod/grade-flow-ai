/** Opaque, fixed paths for each page. The readable route files stay private behind next.config.ts rewrites. */
import type { PageId } from '@/lib/domain/types';

export const ROUTE_SLUGS: Record<PageId, string> = {
  upload: 'k8m2q7',
  verification: 'v4n9x2',
  'report-card': 'p6t3z8',
  'generated-reports': 'g2w5r9',
  sf10: 's7c1d4',
  summary: 'm3b8k6',
  history: 'h9j4y2',
  settings: 'e5u7n3',
  help: 'l2o6a8'
};

export function pathFor(page: PageId): string {
  return `/${ROUTE_SLUGS[page]}`;
}

export function pageForPath(pathname: string): PageId | undefined {
  const slug = pathname.replace(/^\/+|\/+$/g, '');
  return (Object.keys(ROUTE_SLUGS) as PageId[]).find((page) => ROUTE_SLUGS[page] === slug);
}
