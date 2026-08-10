import { getLatestNews, type NewsArticle } from '../lib/fetch/news';

export async function GET() {
  // Typed, not `any[]`. The `any` is precisely why this shipped broken:
  // `mapNews` emits a single `date` field, this file read `publishedAt ||
  // dateCreated`, both resolved to undefined, and `new Date(undefined)
  // .toUTCString()` returns the literal string "Invalid Date" — which every
  // item on the live feed carried. A real type would have caught the rename.
  let articles: NewsArticle[] = [];
  try {
    articles = await getLatestNews(20);
  } catch { /* empty feed on failure */ }

  const siteUrl = 'https://kscw.ch';
  // Fallback for an article with no date, and the channel's own lastBuildDate.
  const buildDate = new Date().toUTCString();
  const escXml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const items = articles.map(a => {
    // Slug is admin-authored — URL-encode it for the link and XML-escape the
    // final URL so it cannot break the feed or inject markup into RSS readers.
    const link = escXml(`${siteUrl}/news/?article=${encodeURIComponent(a.slug || '')}`);
    // Fall back to the build date rather than emitting an invalid one: an
    // undated item is a cosmetic loss, an unparseable pubDate is a broken feed.
    const pubDate = a.date ? new Date(a.date).toUTCString() : buildDate;
    const category = escXml(a.category || 'club');
    return `    <item>
      <title>${escXml(a.title)}</title>
      <link>${link}</link>
      <description>${escXml(a.excerpt || '')}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${category}</category>
      <guid isPermaLink="true">${link}</guid>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KSC Wiedikon News</title>
    <link>${siteUrl}/news/</link>
    <description>Neuigkeiten vom KSC Wiedikon — Volleyball &amp; Basketball</description>
    <language>de-ch</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
