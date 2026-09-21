const fs = require('fs');
const path = require('path');
const XLSX = require('./node_modules/xlsx');

const apiKey = 'dub_y5pahzyYDTBIXdat1Mr0teP6';
const domain = 'luis-merka.com';

const whatsappItems = [
  // RAM
  { slug: 'wa-ram-700', modelo: 'RAM 700', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_ram_700#auto-ram-700' },
  { slug: 'wa-ram-1200', modelo: 'RAM 1200', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_ram_1200#auto-ram-1200' },
  { slug: 'wa-ram-1200-chasis', modelo: 'RAM 1200 Chasis', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_ram_1200_chasis#auto-ram-1200-chasis' },
  { slug: 'wa-ram-4000', modelo: 'RAM 4000', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_ram_4000#auto-ram-4000' },
  { slug: 'wa-promaster', modelo: 'Promaster', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_promaster#auto-ram-promaster' },

  // DODGE
  { slug: 'wa-attitude', modelo: 'Dodge Attitude SXT', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-dodge.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_attitude#auto-dodge-attitude' },
  { slug: 'wa-charger', modelo: 'Dodge Charger', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-dodge.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_charger#auto-dodge-1787102237711' },
  { slug: 'wa-durango', modelo: 'Dodge Durango', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-dodge.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_durango#auto-dodge-1787109067140' },

  // JEEP
  { slug: 'wa-renegade', modelo: 'Jeep Renegade', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_renegade#auto-jeep-renegade' },
  { slug: 'wa-compass', modelo: 'Jeep Compass', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_compass#auto-jeep-compass' },
  { slug: 'wa-grand-cherokee', modelo: 'Grand Cherokee Altitude 4x2', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_grand_cherokee#auto-jeep-grand-cherokee' },
  { slug: 'wa-rubicon', modelo: 'Rubicon Unlimited', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_rubicon#auto-jeep-rubicon' },
  { slug: 'wa-jt-rubicon', modelo: 'JT Rubicon', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_jt_rubicon#auto-jeep-jt' },

  // FIAT
  { slug: 'wa-pulse', modelo: 'Fiat PULSE', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-fiat.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_pulse#auto-fiat-pulse' },
  { slug: 'wa-fastback', modelo: 'Fiat Fastback', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-fiat.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_fastback#auto-fiat-fastback' },
  { slug: 'wa-abarth', modelo: 'Fiat Abarth', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-fiat.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_abarth#auto-fiat-abarth' },

  // PEUGEOT
  { slug: 'wa-peugeot-2008', modelo: 'Peugeot 2008', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_2008#auto-peugeot-2008' },
  { slug: 'wa-peugeot-3008', modelo: 'Peugeot 3008', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_3008#auto-peugeot-3008' },
  { slug: 'wa-rifter', modelo: 'Rifter', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_rifter#auto-peugeot-rifter' },
  { slug: 'wa-expert', modelo: 'Expert Furgon', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_expert#auto-peugeot-expert' },
  { slug: 'wa-partner-maxi', modelo: 'Partner maxi', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_partner_maxi#auto-peugeot-partner-maxi' },
  { slug: 'wa-manager', modelo: 'Manager', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_manager#auto-peugeot-manager' },

  // LEAPMOTOR
  { slug: 'wa-b10', modelo: 'Leapmotor B10', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-leapmotor.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_b10#auto-leapmotor-1788121201596' },

  // DEMOS
  { slug: 'wa-demos', modelo: 'Área General de Demos', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-demos.html?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=lead_demos' }
];

async function createLink(item) {
  try {
    const response = await fetch('https://api.dub.co/links', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: item.url,
        domain: domain,
        key: item.slug
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`[OK] ${item.slug} -> ${data.shortLink}`);
      return data.shortLink;
    } else {
      // Si ya existe (ej. wa-renegade), lo construimos directamente
      if (data.error && data.error.message && data.error.message.includes('already exists')) {
        const existing = `https://${domain}/${item.slug}`;
        console.log(`[EXISTE] ${item.slug} -> ${existing}`);
        return existing;
      }
      console.error(`[ERROR] ${item.slug}:`, data);
      return `https://${domain}/${item.slug}`;
    }
  } catch (err) {
    console.error(`[EXCEPCION] ${item.slug}:`, err.message);
    return `https://${domain}/${item.slug}`;
  }
}

async function main() {
  console.log('--- Iniciando creación de 24 enlaces de WhatsApp en Dub.co ---');
  const shortLinksMap = {};

  for (const item of whatsappItems) {
    const shortLink = await createLink(item);
    shortLinksMap[item.modelo] = shortLink;
    // Pequeña pausa para no saturar rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n--- Actualizando archivo links_utm_stellantis.xlsx ---');
  const excelPath = path.resolve('links_utm_stellantis.xlsx');
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  rows.forEach(row => {
    if (row['Medio (utm_medium)'] === 'whatsapp') {
      const modelo = row['Modelo / Sección'];
      const shortUrl = shortLinksMap[modelo];
      if (shortUrl) {
        row['Enlace Corto (Cuttly / Acortador)'] = shortUrl;
        row['Copy / Mensaje Sugerido'] = `¡Hola! Conoce las promociones exclusivas que tenemos para ti en el ${modelo}: ${shortUrl}`;
      }
    }
  });

  const updatedWs = XLSX.utils.json_to_sheet(rows);
  updatedWs['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 80 },
    { wch: 35 },
    { wch: 80 }
  ];

  wb.Sheets[wb.SheetNames[0]] = updatedWs;
  XLSX.writeFile(wb, excelPath);

  console.log('¡Archivo Excel actualizado exitosamente con todos los enlaces de WhatsApp de Dub.co!');
}

main();
