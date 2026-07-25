// Actualiza el feed RSS de "La mañana de la diaria".
//
// La diaria no publica un patrón de nombre de archivo 100% fijo para sus
// audios (a veces cambia la extensión, a veces cambia hasta la estructura
// del nombre). Este script prueba varias combinaciones conocidas para la
// fecha de hoy y se queda con la primera que exista de verdad en el
// servidor. Si algún día aparece un patrón nuevo que no está en esta lista,
// el script no va a encontrar nada ese día — en ese caso hay que agregar el
// patrón nuevo a mano (avisar a Claude con la URL real encontrada).

const fs = require('fs');

const EPISODES_FILE = 'episodes.json';
const FEED_FILE = 'feed.xml';
const MAX_EPISODIOS = 60;
const BASE = 'https://ladiaria.com.uy/media/audiologue/';

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Genera la lista de URLs candidatas para una fecha dada, cubriendo todos
// los patrones de nombre que ya vimos usar a la diaria.
function candidatosParaFecha(fecha) {
  const yy = pad2(fecha.getUTCFullYear() % 100);
  const mm = pad2(fecha.getUTCMonth() + 1);
  const dd = pad2(fecha.getUTCDate());
  const yyyy = fecha.getUTCFullYear();

  const yymmdd = yy + mm + dd; // ej: 260724
  const ddmmyyyy = dd + '_' + mm + '_' + yyyy; // ej: 24_07_2026

  const nombresConAcento = [
    'LaMa%C3%B1anaDeLaDiaria' // "LaMañanaDeLaDiaria" URL-encoded
  ];
  const nombresSinAcento = ['La_manana_de_la_diaria'];

  const candidatos = [];

  // Patrón "LaMañanaDeLaDiaria_YYMMDD_CMS.EXT"
  nombresConAcento.forEach((nombre) => {
    ['mp3', 'mov', 'mp3.mpeg', 'm4a'].forEach((ext) => {
      candidatos.push(BASE + nombre + '_' + yymmdd + '_CMS.' + ext);
    });
  });

  // Patrón "La_manana_de_la_diaria_DD_MM_YYYY_PGM_Completo.EXT"
  nombresSinAcento.forEach((nombre) => {
    ['mp3.mpeg', 'mp3', 'mov', 'm4a'].forEach((ext) => {
      candidatos.push(
        BASE + nombre + '_' + ddmmyyyy + '_PGM_Completo.' + ext
      );
    });
  });

  return candidatos;
}

async function existe(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' }
    });
    return res.status === 200 || res.status === 206;
  } catch (err) {
    return false;
  }
}

async function buscarAudioDeHoy() {
  const hoy = new Date();
  const candidatos = candidatosParaFecha(hoy);

  console.log('Probando', candidatos.length, 'URLs candidatas para hoy...');

  for (const url of candidatos) {
    const ok = await existe(url);
    console.log(ok ? 'ENCONTRADO ->' : 'no existe  ->', url);
    if (ok) return { url, fecha: hoy };
  }

  return null;
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

async function main() {
  const encontrado = await buscarAudioDeHoy();

  if (!encontrado) {
    console.log(
      'No se encontró ningún archivo de audio hoy con los patrones conocidos. ' +
        'Puede ser que hoy no haya programa, o que la diaria haya usado un ' +
        'nombre de archivo nuevo que todavía no conocemos.'
    );
    return;
  }

  let episodes = [];
  if (fs.existsSync(EPISODES_FILE)) {
    episodes = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  }

  const yaExiste = episodes.some((ep) => ep.url === encontrado.url);
  if (yaExiste) {
    console.log('Este episodio ya estaba guardado. No se agrega de nuevo.');
    return;
  }

  const fecha = encontrado.fecha;
  episodes.unshift({
    date: fecha.toISOString(),
    title:
      'La mañana de la diaria — ' +
      fecha.toLocaleDateString('es-UY', { timeZone: 'UTC' }),
    url: encontrado.url
  });
  episodes = episodes.slice(0, MAX_EPISODIOS);

  fs.writeFileSync(EPISODES_FILE, JSON.stringify(episodes, null, 2));
  console.log('Episodio nuevo agregado:', encontrado.url);

  const rss = buildRss(episodes);
  fs.writeFileSync(FEED_FILE, rss);
  console.log('feed.xml actualizado con', episodes.length, 'episodios.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
