// Actualiza el feed RSS de "La mañana de la diaria" buscando la URL del
// audio del día directamente en el código fuente de la página del programa.

const fs = require('fs');

const SHOW_URL = 'https://radio.ladiaria.com.uy/la-manana-de-la-diaria';
const EPISODES_FILE = 'episodes.json';
const FEED_FILE = 'feed.xml';
const MAX_EPISODIOS = 60;

function extraerFechaDeUrl(url) {
  // Patrón DD_MM_AAAA, ej: ..._17_07_2026_...
  let m = url.match(/_(\d{2})_(\d{2})_(20\d{2})_/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Date.UTC(+yyyy, +mm - 1, +dd, 12, 0, 0));
  }

  // Patrón AAMMDD pegado, ej: ..._260716_...
  m = url.match(/_(\d{2})(\d{2})(\d{2})_/);
  if (m) {
    const [, yy, mm, dd] = m;
    const yyyy = 2000 + parseInt(yy, 10);
    return new Date(Date.UTC(yyyy, +mm - 1, +dd, 12, 0, 0));
  }

  return null;
}

async function main() {
  const res = await fetch(SHOW_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    console.log('La página respondió con error:', res.status);
    return;
  }

  const html = await res.text();

  const regex = /https?:\/\/[^\s"'\\]+\.mp3(?:\.mpeg)?/g;
  const matches = [...new Set(html.match(regex) || [])];

  console.log('URLs de audio encontradas en la página:', matches);

  if (matches.length === 0) {
    console.log('No se encontró ninguna URL de audio hoy. No se agrega nada.');
    return;
  }

  // Si aparece más de una URL, nos quedamos con la que tenga más cara de
  // episodio del programa (contiene "manana" o "audiologue" en el path).
  const audioUrl =
    matches.find((u) => /manana|audiologue/i.test(u)) || matches[0];

  let episodes = [];
  if (fs.existsSync(EPISODES_FILE)) {
    episodes = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  }

  const yaExiste = episodes.some((ep) => ep.url === audioUrl);
  if (yaExiste) {
    console.log('Este episodio ya estaba guardado. No se agrega de nuevo.');
    return;
  }

  const fecha = extraerFechaDeUrl(audioUrl) || new Date();
  episodes.unshift({
    date: fecha.toISOString(),
    title:
      'La mañana de la diaria — ' +
      fecha.toLocaleDateString('es-UY', { timeZone: 'UTC' }),
    url: audioUrl
  });
  episodes = episodes.slice(0, MAX_EPISODIOS);

  fs.writeFileSync(EPISODES_FILE, JSON.stringify(episodes, null, 2));
  console.log('Episodio nuevo agregado:', audioUrl);

  const rss = buildRss(episodes);
  fs.writeFileSync(FEED_FILE, rss);
  console.log('feed.xml actualizado con', episodes.length, 'episodios.');
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRss(episodes) {
  const items = episodes
    .map((ep) => {
      const pubDate = new Date(ep.date).toUTCString();
      return `<item>
<title>${escapeXml(ep.title)}</title>
<link>https://radio.ladiaria.com.uy/la-manana-de-la-diaria</link>
<guid isPermaLink="false">${escapeXml(ep.url)}</guid>
<pubDate>${pubDate}</pubDate>
<enclosure url="${escapeXml(ep.url)}" type="audio/mpeg" length="0"/>
</item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title>La mañana de la diaria</title>
<link>https://radio.ladiaria.com.uy/la-manana-de-la-diaria</link>
<description>Feed extraoficial generado automáticamente a partir de los archivos públicos de audio de la diaria Radio.</description>
<language>es-uy</language>
<itunes:author>la diaria Radio</itunes:author>
${items}
</channel>
</rss>
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
