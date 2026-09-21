const fs = require('fs');
const path = require('path');

// Try loading xlsx from scratch or local
let XLSX;
try {
  XLSX = require('./scratch/node_modules/xlsx');
} catch (e) {
  try {
    XLSX = require('xlsx');
  } catch (err) {
    console.error("XLSX not found:", err);
    process.exit(1);
  }
}

const baseUrl = 'https://lfmtz.github.io/landing-stellantis/paginas_promo/';

const items = [
  // RAM
  { marca: 'RAM', modelo: 'RAM 700', autoSlug: 'ram_700', page: 'promo-ram.html', anchor: '#auto-ram-700' },
  { marca: 'RAM', modelo: 'RAM 1200', autoSlug: 'ram_1200', page: 'promo-ram.html', anchor: '#auto-ram-1200' },
  { marca: 'RAM', modelo: 'RAM 1200 Chasis', autoSlug: 'ram_1200_chasis', page: 'promo-ram.html', anchor: '#auto-ram-1200-chasis' },
  { marca: 'RAM', modelo: 'RAM 4000', autoSlug: 'ram_4000', page: 'promo-ram.html', anchor: '#auto-ram-4000' },
  { marca: 'RAM', modelo: 'Promaster', autoSlug: 'promaster', page: 'promo-ram.html', anchor: '#auto-ram-promaster' },

  // DODGE
  { marca: 'DODGE', modelo: 'Dodge Attitude SXT', autoSlug: 'attitude', page: 'promo-dodge.html', anchor: '#auto-dodge-attitude' },
  { marca: 'DODGE', modelo: 'Dodge Charger', autoSlug: 'charger', page: 'promo-dodge.html', anchor: '#auto-dodge-1787102237711' },
  { marca: 'DODGE', modelo: 'Dodge Durango', autoSlug: 'durango', page: 'promo-dodge.html', anchor: '#auto-dodge-1787109067140' },

  // JEEP
  { marca: 'JEEP', modelo: 'Jeep Renegade', autoSlug: 'renegade', page: 'promo-jeep.html', anchor: '#auto-jeep-renegade' },
  { marca: 'JEEP', modelo: 'Jeep Compass', autoSlug: 'compass', page: 'promo-jeep.html', anchor: '#auto-jeep-compass' },
  { marca: 'JEEP', modelo: 'Grand Cherokee Altitude 4x2', autoSlug: 'grand_cherokee', page: 'promo-jeep.html', anchor: '#auto-jeep-grand-cherokee' },
  { marca: 'JEEP', modelo: 'Rubicon Unlimited', autoSlug: 'rubicon', page: 'promo-jeep.html', anchor: '#auto-jeep-rubicon' },
  { marca: 'JEEP', modelo: 'JT Rubicon', autoSlug: 'jt_rubicon', page: 'promo-jeep.html', anchor: '#auto-jeep-jt' },

  // FIAT
  { marca: 'FIAT', modelo: 'Fiat PULSE', autoSlug: 'pulse', page: 'promo-fiat.html', anchor: '#auto-fiat-pulse' },
  { marca: 'FIAT', modelo: 'Fiat Fastback', autoSlug: 'fastback', page: 'promo-fiat.html', anchor: '#auto-fiat-fastback' },
  { marca: 'FIAT', modelo: 'Fiat Abarth', autoSlug: 'abarth', page: 'promo-fiat.html', anchor: '#auto-fiat-abarth' },

  // PEUGEOT
  { marca: 'PEUGEOT', modelo: 'Peugeot 2008', autoSlug: '2008', page: 'promo-peugeot.html', anchor: '#auto-peugeot-2008' },
  { marca: 'PEUGEOT', modelo: 'Peugeot 3008', autoSlug: '3008', page: 'promo-peugeot.html', anchor: '#auto-peugeot-3008' },
  { marca: 'PEUGEOT', modelo: 'Rifter', autoSlug: 'rifter', page: 'promo-peugeot.html', anchor: '#auto-peugeot-rifter' },
  { marca: 'PEUGEOT', modelo: 'Expert Furgon', autoSlug: 'expert', page: 'promo-peugeot.html', anchor: '#auto-peugeot-expert' },
  { marca: 'PEUGEOT', modelo: 'Partner maxi', autoSlug: 'partner_maxi', page: 'promo-peugeot.html', anchor: '#auto-peugeot-partner-maxi' },
  { marca: 'PEUGEOT', modelo: 'Manager', autoSlug: 'manager', page: 'promo-peugeot.html', anchor: '#auto-peugeot-manager' },

  // LEAPMOTOR
  { marca: 'LEAPMOTOR', modelo: 'Leapmotor B10', autoSlug: 'b10', page: 'promo-leapmotor.html', anchor: '#auto-leapmotor-1788121201596' },

  // DEMOS GENERAL
  { marca: 'DEMOS', modelo: 'Área General de Demos', autoSlug: 'demos', page: 'promo-demos.html', anchor: '' }
];

const mediums = ['email', 'whatsapp', 'sms'];

const rows = [];

items.forEach(item => {
  mediums.forEach(medium => {
    const campaign = `lead_${item.autoSlug}`;
    const source = medium; // estándar para tracking de canales
    const utmParams = `utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}`;
    const fullUrl = `${baseUrl}${item.page}?${utmParams}${item.anchor}`;

    let copySugerido = '';
    if (medium === 'whatsapp') {
      copySugerido = `¡Hola! Conoce las promociones exclusivas que tenemos para ti en el ${item.modelo}: ${fullUrl}`;
    } else if (medium === 'sms') {
      copySugerido = `Estrena tu ${item.modelo} con bono especial y tasa preferencial. Conoce más aquí: ${fullUrl}`;
    } else if (medium === 'email') {
      copySugerido = `Descubre las ofertas del mes y cotiza tu ${item.modelo} directamente en nuestro showroom digital: ${fullUrl}`;
    }

    rows.push({
      'Marca': item.marca,
      'Modelo / Sección': item.modelo,
      'Medio (utm_medium)': medium,
      'Fuente (utm_source)': source,
      'Campaña (utm_campaign)': campaign,
      'URL Completa UTM': fullUrl,
      'Enlace Corto (Cuttly / Acortador)': '', // Columna para que el usuario coloque su enlace corto o se automatice
      'Copy / Mensaje Sugerido': copySugerido
    });
  });
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);

// Configurar anchos de columnas
ws['!cols'] = [
  { wch: 14 }, // Marca
  { wch: 28 }, // Modelo
  { wch: 18 }, // Medio
  { wch: 18 }, // Fuente
  { wch: 22 }, // Campaña
  { wch: 80 }, // URL Completa UTM
  { wch: 30 }, // Enlace Corto
  { wch: 80 }  // Copy sugerido
];

// Añadir hoja al libro
XLSX.utils.book_append_sheet(wb, ws, 'Enlaces UTM');

const outputPath = path.resolve('links_utm_stellantis.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`¡Archivo Excel generado exitosamente en: ${outputPath}!`);
console.log(`Total de enlaces generados: ${rows.length}`);
