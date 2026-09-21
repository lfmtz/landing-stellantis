const fs = require('fs');
const path = require('path');
const XLSX = require('./node_modules/xlsx');

const apiKey = '5e903ddd40b838e984c170cc4d3740fb01116';
const resultsFile = path.resolve('scratch/cuttly_sms_results.json');
const excelPath = path.resolve('links_utm_stellantis.xlsx');

const items = [
  { id: 'ram-700', modelo: 'RAM 700', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_ram_700#auto-ram-700' },
  { id: 'ram-1200', modelo: 'RAM 1200', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_ram_1200#auto-ram-1200' },
  { id: 'ram-1200-chasis', modelo: 'RAM 1200 Chasis', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_ram_1200_chasis#auto-ram-1200-chasis' },
  { id: 'ram-4000', modelo: 'RAM 4000', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_ram_4000#auto-ram-4000' },
  { id: 'ram-promaster', modelo: 'Promaster', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-ram.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_promaster#auto-ram-promaster' },
  { id: 'dodge-attitude', modelo: 'Dodge Attitude SXT', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-dodge.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_attitude#auto-dodge-attitude' },
  { id: 'dodge-charger', modelo: 'Dodge Charger', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-dodge.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_charger#auto-dodge-1787102237711' },
  { id: 'dodge-durango', modelo: 'Dodge Durango', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-dodge.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_durango#auto-dodge-1787109067140' },
  { id: 'jeep-renegade', modelo: 'Jeep Renegade', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_renegade#auto-jeep-renegade' },
  { id: 'jeep-compass', modelo: 'Jeep Compass', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_compass#auto-jeep-compass' },
  { id: 'jeep-grand-cherokee', modelo: 'Grand Cherokee Altitude 4x2', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_grand_cherokee#auto-jeep-grand-cherokee' },
  { id: 'jeep-rubicon', modelo: 'Rubicon Unlimited', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_rubicon#auto-jeep-rubicon' },
  { id: 'jeep-jt', modelo: 'JT Rubicon', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-jeep.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_jt_rubicon#auto-jeep-jt' },
  { id: 'fiat-pulse', modelo: 'Fiat PULSE', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-fiat.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_pulse#auto-fiat-pulse' },
  { id: 'fiat-fastback', modelo: 'Fiat Fastback', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-fiat.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_fastback#auto-fiat-fastback' },
  { id: 'fiat-abarth', modelo: 'Fiat Abarth', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-fiat.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_abarth#auto-fiat-abarth' },
  { id: 'peugeot-2008', modelo: 'Peugeot 2008', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_2008#auto-peugeot-2008' },
  { id: 'peugeot-3008', modelo: 'Peugeot 3008', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_3008#auto-peugeot-3008' },
  { id: 'peugeot-rifter', modelo: 'Rifter', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_rifter#auto-peugeot-rifter' },
  { id: 'peugeot-expert', modelo: 'Expert Furgon', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_expert#auto-peugeot-expert' },
  { id: 'peugeot-partner-maxi', modelo: 'Partner maxi', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_partner_maxi#auto-peugeot-partner-maxi' },
  { id: 'peugeot-manager', modelo: 'Manager', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-peugeot.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_manager#auto-peugeot-manager' },
  { id: 'leapmotor-b10', modelo: 'Leapmotor B10', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-leapmotor.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_b10#auto-leapmotor-1788121201596' },
  { id: 'demos', modelo: 'Área General de Demos', url: 'https://lfmtz.github.io/landing-stellantis/paginas_promo/promo-demos.html?utm_source=sms&utm_medium=sms&utm_campaign=lead_demos' }
];

let results = {};
if (fs.existsSync(resultsFile)) {
  try {
    results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
  } catch (e) {}
}

// Known test result
results['jeep-renegade'] = 'https://cutt.ly/hycZq6CS';

async function shortenUrl(url) {
  const apiUrl = `https://cutt.ly/api/api.php?key=${apiKey}&short=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  const data = await res.json();
  if (data && data.url && (data.url.status === 7 || data.url.status === 1)) {
    return data.url.shortLink;
  } else {
    throw new Error(`Cuttly error status ${data?.url?.status}: ${JSON.stringify(data)}`);
  }
}

async function updateExcel() {
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  rows.forEach(row => {
    if (row['Medio (utm_medium)'] === 'sms') {
      const modelo = row['Modelo / Sección'];
      const item = items.find(i => i.modelo === modelo);
      if (item && results[item.id]) {
        const shortUrl = results[item.id];
        row['Enlace Corto (Cuttly / Acortador)'] = shortUrl;
        row['Copy / Mensaje Sugerido'] = `Estrena tu ${modelo} con bono especial y tasa preferencial. Conoce más aquí: ${shortUrl}`;
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
}

async function verifyAllSmsLinks() {
  console.log('\n--- Verificando los 24 enlaces de SMS (con pausas de 2.5s) ---');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const shortUrl = results[item.id];
    if (!shortUrl) {
      console.error(`[FALTA] ${item.modelo} no tiene enlace acortado.`);
      failCount++;
      continue;
    }

    try {
      const res = await fetch(shortUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (res.status === 200 && res.url.includes('landing-stellantis')) {
        successCount++;
        console.log(`[${i+1}/24] OK (200) - ${item.modelo}: ${shortUrl} -> ${res.url}`);
      } else {
        failCount++;
        console.error(`[${i+1}/24] ERROR (${res.status}) - ${item.modelo}: ${shortUrl}`);
      }
    } catch(err) {
      failCount++;
      console.error(`[${i+1}/24] ERROR de red en ${item.modelo}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 2500));
  }

  console.log(`\n=== RESULTADO FINAL SMS ===`);
  console.log(`Exitosos: ${successCount} de ${items.length}`);
  console.log(`Fallidos: ${failCount}`);
}

async function main() {
  console.log('Iniciando proceso de acortado en Cutt.ly para SMS...');
  console.log('Total a procesar: 24 enlaces.');
  console.log('Velocidad programada: 1 solicitud cada 21 segundos (respetando límite de Cutt.ly Free: 3/minuto).\n');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (results[item.id]) {
      console.log(`[${i+1}/24] ${item.modelo} ya existe: ${results[item.id]}`);
      continue;
    }

    try {
      console.log(`[${i+1}/24] Acortando ${item.modelo}...`);
      const shortUrl = await shortenUrl(item.url);
      results[item.id] = shortUrl;
      fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
      console.log(` -> [OK] ${item.modelo}: ${shortUrl}`);
      await updateExcel();
    } catch (err) {
      console.error(` -> [ERROR] en ${item.modelo}:`, err.message);
    }

    if (i < items.length - 1) {
      console.log('Esperando 21 segundos para respetar el límite de Cutt.ly...');
      await new Promise(r => setTimeout(r, 21000));
    }
  }

  await updateExcel();
  console.log('\n=== ACORTADO DE SMS FINALIZADO ===');
  console.log('Comenzando verificación de enlaces...');
  await verifyAllSmsLinks();
}

main();
