const fs = require('fs');
const path = require('path');
const XLSX = require('./node_modules/xlsx');

async function testLinks() {
  console.log('--- Iniciando prueba de verificación de enlaces cortos de Cutt.ly ---');
  const excelPath = path.resolve('links_utm_stellantis.xlsx');
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const waRows = rows.filter(r => r['Medio (utm_medium)'] === 'whatsapp' && r['Enlace Corto (Cuttly / Acortador)']);

  console.log(`Verificando ${waRows.length} enlaces de WhatsApp...\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < waRows.length; i++) {
    const row = waRows[i];
    const shortUrl = row['Enlace Corto (Cuttly / Acortador)'];
    const expectedUrl = row['URL Completa UTM'];
    const modelo = row['Modelo / Sección'];

    try {
      // Usar fetch siguiendo redirecciones
      const res = await fetch(shortUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const finalUrl = res.url;
      const statusCode = res.status;

      // Verificar que el destino final sea exitoso (200 OK) y coincida con el dominio de la landing
      const isOk = statusCode === 200 && finalUrl.includes('landing-stellantis');

      if (isOk) {
        successCount++;
        console.log(`[${i+1}/${waRows.length}] OK (Status: ${statusCode}) - ${modelo}`);
        console.log(`       Corto:   ${shortUrl}`);
        console.log(`       Destino: ${finalUrl}\n`);
      } else {
        failCount++;
        console.error(`[${i+1}/${waRows.length}] FALLÓ (Status: ${statusCode}) - ${modelo}`);
        console.error(`       Corto:   ${shortUrl}`);
        console.error(`       Destino: ${finalUrl}\n`);
      }
    } catch (err) {
      failCount++;
      console.error(`[${i+1}/${waRows.length}] ERROR de red en ${modelo}:`, err.message, '\n');
    }

    // Pequeña pausa para no saturar
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('=== RESUMEN DE LA PRUEBA ===');
  console.log(`Total probados: ${waRows.length}`);
  console.log(`Exitosos:       ${successCount}`);
  console.log(`Fallidos:       ${failCount}`);
  if (failCount === 0) {
    console.log('\n¡TODOS LOS ENLACES CORTOS FUNCIONAN Y REDIRIGEN CORRECTAMENTE!');
  }
}

testLinks();
