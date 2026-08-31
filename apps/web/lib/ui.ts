/**
 * Page width system (single source of truth). Tie a page's outer container to
 * its content type instead of picking a width per page:
 *   - detail: reads and forms — constrained for comfortable line length
 *   - wide:   tables and list/overview pages — more room without going edge-to-edge
 *   - full:   boards and wide analytics — span the whole content area
 * Tune these once here and every page follows.
 */
export const PAGE = {
  detail: 'mx-auto w-full max-w-5xl',
  wide: 'mx-auto w-full max-w-7xl',
  full: 'w-full',
} as const;

export type PageVariant = keyof typeof PAGE;
