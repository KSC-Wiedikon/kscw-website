import { fetchItems, assetUrl } from '../directus'

interface DirectusNews {
  id: number; title: string; title_en: string | null; slug: string;
  excerpt: string | null; body: string; category: string; author: string;
  published_at: string; is_published: boolean; image: string | null; date_created: string;
}

export interface NewsArticle {
  id: string; title: string; titleEn: string | null; slug: string;
  excerpt: string | null; body: string; category: string; author: string;
  date: string; imageUrl: string | null;
}

function mapNews(n: DirectusNews): NewsArticle {
  return {
    id: String(n.id), title: n.title, titleEn: n.title_en, slug: n.slug,
    excerpt: n.excerpt, body: n.body, category: n.category, author: n.author,
    date: n.published_at || n.date_created,
    imageUrl: assetUrl(n.image, 'width=800&quality=80'),
  }
}

/**
 * Published-only, as a second line of defence (audit 2026-09-28, F-07).
 *
 * The real gate is the Public role's row filter in wiedisync's
 * setup-permissions.mjs. It used to test only `published_at`, so "Archive" —
 * which PATCHes `is_published:false` and leaves the date in the past — kept an
 * article on the homepage, /news, the `?news=` modal and /feed.xml. (The old
 * comment here claimed the role filter already enforced published-only; it did
 * not.) This filter makes the site correct even if that row filter regresses.
 *
 * ⚠ Filtering on a field the Public role cannot read 403s the WHOLE query, so
 * `is_published` must be in PUBLIC_NEWS_FIELDS before this ships.
 *
 * The runtime twins (index.astro, news/index.astro, public/js/news-modal.js)
 * send the same filter; tests/unit/public-runtime-audit-2026-09-28.test.ts (F-07) pins all four.
 */
export const PUBLISHED_NEWS_FILTER = {
  is_published: { _eq: true },
  published_at: { _lte: '$NOW' },
} as const

export async function getLatestNews(limit = 6): Promise<NewsArticle[]> {
  const items = await fetchItems<DirectusNews>('news', {
    filter: PUBLISHED_NEWS_FILTER,
    sort: ['-published_at'],
    fields: ['id', 'title', 'title_en', 'slug', 'excerpt', 'body', 'category', 'author', 'published_at', 'image', 'date_created'],
    limit,
  })
  return items.map(mapNews)
}
