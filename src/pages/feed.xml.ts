import { getLatestNews } from '../lib/fetch/news';

export async function GET() {
  let articles: any[] = [];
  try {
    articles = await getLatestNews(20);
  } catch { /* empty feed on failure */ }

  const siteUrl = 'https://kscw.ch';
  const escXml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const items = articles.map(a => {
    // Slug is admin-authored — URL-encode it for the link and XML-escape the
    // final URL so it cannot break the feed or inject markup into RSS readers.
    const link = escXml(`${siteUrl}/de/news/?article=${encodeURIComponent(a.slug || '')}`);
    const pubDate = new Date(a.publishedAt || a.dateCreated).toUTCString();
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
    <link>${siteUrl}/de/news/</link>
    <description>Neuigkeiten vom KSC Wiedikon — Volleyball &amp; Basketball</description>
    <language>de-ch</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
