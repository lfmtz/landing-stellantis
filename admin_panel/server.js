const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..')));

// Create upload directories if they don't exist
const baseImgDir = path.join(__dirname, '..', 'imagenes');
if (!fs.existsSync(baseImgDir)) {
  fs.mkdirSync(baseImgDir, { recursive: true });
}

// Config Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const brand = req.params.brand || 'general';
    const dest = path.join(baseImgDir, brand);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.brand || 'auto'}-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });
const csvUpload = multer({ storage: multer.memoryStorage() });

const DATA_FILE = path.join(__dirname, 'data.json');

// Read database helper
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading database:', error);
    return {};
  }
}

// Write database helper
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing database:', error);
  }
}

// Optimize Cloudinary URLs helper
function optimizeCloudinaryUrl(url, brand = '') {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('cloudinary.com')) {
    if (!url.includes('/w_') && !url.includes('/h_') && !url.includes('/c_')) {
      if (brand === 'demos') {
        return url.replace(/(image\/upload\/)(v\d+)/, '$1w_1080,h_1080,c_fill,g_auto,f_auto,q_auto/$2');
      } else {
        return url.replace(/(image\/upload\/)(v\d+)/, '$1w_800,h_600,c_fill,g_auto,f_auto,q_auto/$2');
      }
    } else {
      if (!url.includes('f_auto') || !url.includes('q_auto')) {
        return url.replace(/(image\/upload\/)([^/]+)\/(v\d+)/, (match, p1, p2, p3) => {
          let opts = p2;
          if (!opts.includes('f_auto')) opts += ',f_auto';
          if (!opts.includes('q_auto')) opts += ',q_auto';
          return p1 + opts + '/' + p3;
        });
      }
    }
  }
  return url;
}

// Parse CSV text respecting quoted fields (RFC 4180 compliant)
function parseCsv(text) {
  const result = [];
  let row = [''];
  let inQuotes = false;
  let delimiter = null;

  const sample = text.slice(0, 500);
  if (sample.includes(';')) delimiter = ';';
  else if (sample.includes('\t')) delimiter = '\t';
  else delimiter = ',';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    result.push(row);
  }
  return result;
}

// Get all promos
app.get('/api/promos', (req, res) => {
  res.json(readData());
});

// Add a promotion (supports text and image upload, single or multiple)
app.post('/api/promos/:brand', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 50 }]), (req, res) => {
  const { brand } = req.params;
  const data = readData();

  if (!data[brand]) {
    data[brand] = [];
  }

  // Parse details
  const rawBenefits = req.body.benefits ? JSON.parse(req.body.benefits) : [];
  const benefits = Array.isArray(rawBenefits) ? rawBenefits.map(b => (typeof b === 'string' ? b.trim() : '')).filter(b => b.length > 0) : [];
  
  // Base image path (single image upload)
  let imgPath = req.body.imageURL || req.body.existingImage || '';
  if (req.files && req.files['image'] && req.files['image'][0]) {
    imgPath = `imagenes/${brand}/${req.files['image'][0].filename}`;
  }

  // Multiple images gallery processing
  let finalImages = [];
  if (req.body.imagesData) {
    try {
      const imagesData = JSON.parse(req.body.imagesData);
      imagesData.forEach(item => {
        if (item.type === 'url') {
          finalImages.push(item.val);
        } else if (item.type === 'file') {
          const fileIndex = item.index;
          if (req.files && req.files['images'] && req.files['images'][fileIndex]) {
            finalImages.push(`imagenes/${brand}/${req.files['images'][fileIndex].filename}`);
          }
        }
      });
    } catch (e) {
      console.error('Error parsing imagesData:', e);
    }
  }

  // Prioritize cover image (imgPath) as the first item of finalImages
  if (imgPath) {
    const existingIndex = finalImages.indexOf(imgPath);
    if (existingIndex > -1) {
      finalImages.splice(existingIndex, 1);
    }
    finalImages.unshift(imgPath);
  } else if (finalImages.length > 0) {
    imgPath = finalImages[0];
  }

  const newPromo = {
    id: req.body.id || `${brand}-${Date.now()}`,
    name: req.body.name,
    km: req.body.km || '',
    listPrice: req.body.listPrice || '',
    price: req.body.price,
    image: imgPath,
    images: finalImages, // Save gallery array
    whatsapp: req.body.whatsapp || `https://wa.me/525521787900?text=Hola,%20me%20interesa%20la%20gama%20${brand}`,
    description: req.body.description || '',
    descriptionSize: req.body.descriptionSize || '1.0rem',
    descriptionColor: req.body.descriptionColor || '#333333',
    benefits: benefits,
    fichaTecnica: req.body.fichaTecnica ? req.body.fichaTecnica.trim() : '',
    legal: req.body.legal || '* Promoción válida el mes en curso.',
    accentColor: req.body.accentColor || '#CC4400',
    underlineStyle: req.body.underlineStyle || 'solid',
    category: req.body.category || 'suv'
  };

  const existingIndex = data[brand].findIndex(p => p.id === newPromo.id);
  if (existingIndex > -1) {
    data[brand][existingIndex] = newPromo; // Edit
  } else {
    data[brand].push(newPromo); // Add new
  }

  writeData(data);

  // Re-generate the HTML file for this brand
  generateHtmlForBrand(brand, data[brand]);

  res.json({ success: true, promo: newPromo });
});

// Delete a promotion
app.delete('/api/promos/:brand/:id', (req, res) => {
  const { brand, id } = req.params;
  const data = readData();

  if (data[brand]) {
    data[brand] = data[brand].filter(p => p.id !== id);
    writeData(data);
    generateHtmlForBrand(brand, data[brand]);
    return res.json({ success: true });
  }

  res.status(404).json({ error: 'Brand not found' });
});

// CSV Mass Price Upload Endpoint (Excel generated CSV)
app.post('/api/upload-csv', csvUpload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  const csvData = req.file.buffer.toString('utf8');
  const lines = csvData.split(/\r?\n/);
  const dbData = readData();
  let updatedCount = 0;

  function parseCsvLine(line) {
    let inQuotes = false;
    let semiCount = 0;
    let commaCount = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (!inQuotes) {
        if (line[i] === ';') semiCount++;
        else if (line[i] === ',') commaCount++;
      }
    }
    const delim = semiCount >= commaCount ? ';' : ',';

    const result = [];
    let current = '';
    inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delim && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith('sep=') || trimmed.toLowerCase().startsWith('"marca"') || trimmed.toLowerCase().startsWith('marca')) {
      return;
    }
    
    const parts = parseCsvLine(trimmed);
    if (parts.length < 3) return;

    let csvBrand = parts[0].trim().toLowerCase();
    let csvCarName = '';
    let csvPrice = '';

    if (parts.length >= 4) {
      // Formato con columna Tipo: Marca;Tipo;Auto;Precio
      const tipo = parts[1].trim().toUpperCase();
      if (tipo === 'DEMO' || csvBrand === 'demos') {
        csvBrand = 'demos';
      }
      csvCarName = parts[2].trim();
      csvPrice = parts[3].trim();
    } else {
      // Formato clásico: Marca;Auto;Precio
      csvCarName = parts[1].trim();
      csvPrice = parts[2].trim();
    }

    if (dbData[csvBrand]) {
      const vehicle = dbData[csvBrand].find(v => v.name.trim().toLowerCase() === csvCarName.toLowerCase());
      if (vehicle) {
        vehicle.price = csvPrice;
        updatedCount++;
      }
    }
  });

  if (updatedCount > 0) {
    writeData(dbData);
    // Regenerate HTML for all updated brands
    Object.keys(dbData).forEach(b => {
      generateHtmlForBrand(b, dbData[b]);
    });
  }

  res.json({ success: true, updatedCount });
});

// CSV Mass Price Download Endpoint con soporte de filtro (nuevos, demos, ambos) y entrecomillado seguro
app.get('/api/download-csv', (req, res) => {
  const dbData = readData();
  const filter = (req.query.filter || req.query.type || 'ambos').toLowerCase();
  
  // Instrucción sep=; para apertura automática correcta en Excel de México y Latinoamérica
  let csvContent = 'sep=;\n"Marca";"Tipo";"Auto";"Precio"\n';
  
  let brandsToExport = [];
  if (filter === 'nuevos') {
    brandsToExport = ['ram', 'dodge', 'jeep', 'fiat', 'peugeot', 'leapmotor'];
  } else if (filter === 'demos') {
    brandsToExport = ['demos'];
  } else {
    brandsToExport = ['ram', 'dodge', 'jeep', 'fiat', 'peugeot', 'leapmotor', 'demos'];
  }
  
  brandsToExport.forEach(b => {
    const vehicles = dbData[b] || [];
    const tipo = b === 'demos' ? 'DEMO' : 'NUEVO';
    const brandLabel = b === 'demos' ? 'DEMOS' : b.toUpperCase();
    vehicles.forEach(v => {
      const cleanBrand = brandLabel.replace(/"/g, '""');
      const cleanName = (v.name || '').replace(/"/g, '""');
      const cleanPrice = (v.price || '').replace(/"/g, '""');
      csvContent += `"${cleanBrand}";"${tipo}";"${cleanName}";"${cleanPrice}"\n`;
    });
  });
  
  let filename = 'precios_stellantis_todos.csv';
  if (filter === 'nuevos') filename = 'precios_stellantis_nuevos.csv';
  if (filter === 'demos') filename = 'precios_stellantis_demos.csv';
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.status(200).send('\uFEFF' + csvContent); // BOM UTF-8
});

// CSV Demos Template Download Endpoint
app.get('/api/download-demos-template', (req, res) => {
  let csvContent = 'Marca;Modelo;Año;Color;Kilometraje;Precio;Inventario;WhatsApp;Clasificación\n';
  csvContent += 'RAM;1200 Crew Cab Tradesman;2026;Blanco;1500 km;$399,000;2 unidades;https://wa.me/525521787900?text=Hola,%20me%20interesa%20el%20demo%20RAM%201200;pickup\n';
  csvContent += 'Jeep;Compass Limited;2025;Gris;3400 km;$549,000;1 unidad;https://wa.me/525521787900?text=Hola,%20me%20interesa%20el%20demo%20Jeep%20Compass;suv\n';
  csvContent += 'Dodge;Attitude SXT;2025;Rojo;800 km;$359,000;3 unidades;https://wa.me/525521787900?text=Hola,%20me%20interesa%20el%20demo%20Dodge%20Attitude;sedan\n';
  csvContent += 'Fiat;Pulse Audace;2024;Azul;4200 km;$370,000;1 unidad;https://wa.me/525521787900?text=Hola,%20me%20interesa%20el%20demo%20Fiat%20Pulse;crossover\n';
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=plantilla_inventario_demos.csv');
  res.status(200).send('\uFEFF' + csvContent); // BOM UTF-8
});

// Landing Config Endpoint
app.post('/api/landing-config', (req, res) => {
  const dbData = readData();
  dbData.landing = req.body;
  writeData(dbData);
  
  // Regenerate index.html
  generateIndexHtml(dbData);
  
  // Regenerate all brand pages too since leasingPopupImage might have changed!
  const brands = ['ram', 'dodge', 'jeep', 'fiat', 'peugeot', 'leapmotor', 'demos'];
  brands.forEach(b => {
    generateHtmlForBrand(b, dbData[b] || []);
  });
  
  res.json({ success: true });
});

// Git Sync Endpoint
app.post('/api/git-sync', (req, res) => {
  const rootDir = path.join(__dirname, '..');
  
  exec('git add .', { cwd: rootDir }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: 'Error running git add', details: stderr });
    }
    
    const commitMsg = `Admin Update - ${new Date().toISOString()}`;
    exec(`git commit -m "${commitMsg}"`, { cwd: rootDir }, (err, stdout, stderr) => {
      // It is fine if there is nothing to commit, we can proceed to push anyway or handle it
      exec('git push', { cwd: rootDir }, (err, stdout, stderr) => {
        if (err) {
          return res.status(500).json({ error: 'Error running git push', details: stderr });
        }
        res.json({ success: true, message: 'Git updated and pushed successfully!' });
      });
    });
  });
});

// Helper to group models by their main family name
function getModelFamily(brand, modelName) {
  let cleanModel = modelName.replace(/["']/g, '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
  const brandUpper = brand.toUpperCase();
  if (cleanModel.toUpperCase().startsWith(brandUpper)) {
    cleanModel = cleanModel.slice(brandUpper.length).trim();
  }
  const words = cleanModel.split(' ');
  if (words.length === 0) return brand.toUpperCase() + ' UNIDAD';
  const firstWord = words[0].toUpperCase();
  if (firstWord === 'GRAND' && words[1]) {
    return brand.toUpperCase() + ' ' + firstWord + ' ' + words[1].toUpperCase();
  }
  return brand.toUpperCase() + ' ' + firstWord;
}

// Helper to refine classifications into granular categories
function getAutoClassification(categoryFromCsv, modelName) {
  if (!categoryFromCsv || !modelName) return 'suv';
  const modelUpper = modelName.toUpperCase();
  const catLower = categoryFromCsv.toLowerCase();
  
  if (catLower === 'trabajo' || catLower === 'pickup' || catLower === 'chasis' || catLower === 'van' || catLower === 'vans') {
    if (modelUpper.includes('CHASIS') || modelUpper.includes('CABINA')) {
      return 'chasis';
    }
    if (modelUpper.includes('FURGON') || modelUpper.includes('PARTNER') || modelUpper.includes('MANAGER') || modelUpper.includes('FIORINO') || modelUpper.includes('DUCATO') || modelUpper.includes('EXPERT') || modelUpper.includes('RIFTER') || modelUpper.includes('PROMASTER')) {
      return 'van';
    }
    if (modelUpper.includes('RAM 700') || modelUpper.includes('RAM 1200') || modelUpper.includes('RAM 1500') || modelUpper.includes('BIGHORN') || modelUpper.includes('LARAMIE') || modelUpper.includes('TRADESMAN') || modelUpper.includes('JT') || modelUpper.includes('TUNGSTEN') || modelUpper.includes('PICKUP')) {
      return 'pickup';
    }
  }
  return catLower;
}

// Generate HTML file dynamically for a brand
function generateHtmlForBrand(brand, vehicles) {
  const promoDir = path.join(__dirname, '..', 'paginas_promo');
  if (!fs.existsSync(promoDir)) {
    fs.mkdirSync(promoDir, { recursive: true });
  }

  const rulesPath = path.join(__dirname, 'chatbot_rules.json');
  let chatbotRules = {};
  if (fs.existsSync(rulesPath)) {
    try {
      chatbotRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    } catch (e) {
      console.error('Error loading chatbot rules:', e);
    }
  }

  const brandColors = {
    ram: '#000000',
    dodge: '#CC4400',
    jeep: '#4A7729',
    fiat: '#B30000',
    peugeot: '#001E62',
    leapmotor: '#3B93A9',
    demos: '#00e5ff'
  };

  const accentColor = brandColors[brand] || '#CC4400';

  const cardsHtml = vehicles.map(v => {
    // Generate benefits list (only non-empty items)
    const validBenefits = (v.benefits || []).map(b => (typeof b === 'string' ? b.trim() : '')).filter(b => b.length > 0);
    const benefitsListHtml = validBenefits.map(b => `
      <li>
        ${b}
      </li>
    `).join('');

    // Ficha Técnica Download Link
    let fichaTecnicaHtml = '';
    if (v.fichaTecnica && typeof v.fichaTecnica === 'string' && v.fichaTecnica.trim().length > 0) {
      const ftUrl = v.fichaTecnica.trim();
      fichaTecnicaHtml = `
        <div class="ficha-tecnica-container" style="margin-top: 12px; margin-bottom: 12px;">
          <a href="${ftUrl}" target="_blank" rel="noopener" class="btn-ficha-tecnica" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; color: #1e293b; padding: 8px 14px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 0.9rem; font-family: var(--fuente); transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.5px;" onclick="if(typeof gtag==='function') { gtag('event', 'download_ficha_tecnica', { 'car_name': '${v.name}', 'brand_name': '${brand}' }); }">
            <i class="fa-solid fa-file-pdf" style="color: #ef4444; font-size: 1.15rem;"></i> Descargar Ficha Técnica
          </a>
        </div>
      `;
    }

    // Highlight style for description
    const textStyle = `font-size: ${v.descriptionSize || '1rem'}; color: ${v.descriptionColor || '#333333'};`;
    const headingStyle = v.underlineStyle !== 'none' 
      ? `border-bottom: 2px ${v.underlineStyle} ${v.accentColor || accentColor}; padding-bottom: 3px; display: inline-block;` 
      : '';

    // Relative image path adjustment (pages are in paginas_promo, so they need to go up one folder '../imagenes/')
    let imageSrc = optimizeCloudinaryUrl(v.image, brand);
    if (imageSrc && !imageSrc.startsWith('http') && !imageSrc.startsWith('../')) {
      imageSrc = `../${imageSrc}`;
    }

    let imgContainerContent = '';
    if (v.images && Array.isArray(v.images) && v.images.length > 1) {
      const slidesHtml = v.images.map((imgUrl, idx) => {
        let src = optimizeCloudinaryUrl(imgUrl, brand);
        if (src && !src.startsWith('http') && !src.startsWith('../')) {
          src = `../${src}`;
        }
        return `
        <div class="carousel-slide">
          <img src="${src}" alt="${v.name} - Foto ${idx+1}" class="card-img-carousel" loading="lazy" />
        </div>`;
      }).join('');

      const indicatorsHtml = v.images.map((_, idx) => `
        <span class="indicator ${idx === 0 ? 'active' : ''}" onclick="setCarouselSlide('${v.id}', ${idx}, event)"></span>
      `).join('');

      imgContainerContent = `
      <div class="carousel" id="carousel-${v.id}">
        <div class="carousel-track-wrapper">
          <div class="carousel-track">
            ${slidesHtml}
          </div>
        </div>
        <button class="carousel-control prev" aria-label="Foto anterior" onclick="moveCarousel('${v.id}', -1, event)">&#10094;</button>
        <button class="carousel-control next" aria-label="Siguiente foto" onclick="moveCarousel('${v.id}', 1, event)">&#10095;</button>
        <div class="carousel-indicators">
          ${indicatorsHtml}
        </div>
      </div>`;
    } else {
      imgContainerContent = `<img alt="Promoción ${v.name}" class="card-img" decoding="async" height="450" loading="lazy" src="${imageSrc}" width="600"/>`;
    }

    // Check if there are any details to display in the accordion
    const hasDetails = Boolean(
      (v.km && v.km.trim()) ||
      validBenefits.length > 0 ||
      fichaTecnicaHtml ||
      (v.description && v.description.trim()) ||
      (v.legal && v.legal.trim())
    );

    let detailsAccordionHtml = '';
    if (hasDetails) {
      detailsAccordionHtml = `
          <!-- Acordeón Desplegable de Características, Kilometraje, Ficha Técnica y CTA -->
          <details class="card-details-accordion" ontoggle="if(this.open && typeof gtag==='function'){ gtag('event', 'view_car_details', { 'car_name': '${v.name}', 'brand_name': '${brand}' }); }" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 10px;">
            <summary style="cursor: pointer; font-weight: 700; font-family: var(--fuente); color: #111; font-size: 1.05rem; display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; user-select: none; transition: background 0.2s; outline: none;">
              <span><i class="fa-solid fa-list-ul" style="color: ${v.accentColor || accentColor}; margin-right: 6px;"></i> Ver Características y Detalles</span>
              <i class="fa-solid fa-chevron-down accordion-arrow" style="font-size: 0.85rem; color: ${v.accentColor || accentColor}; transition: transform 0.3s ease;"></i>
            </summary>
            <div class="card-accordion-body" style="padding: 15px 5px 5px 5px;">
              ${v.km && v.km.trim() ? `
                <div style="background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-family: var(--fuente); font-size: 0.95rem; margin-bottom: 12px; display: inline-flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-gauge-high"></i> Kilometraje: ${v.km}
                </div>
              ` : ''}

              ${validBenefits.length > 0 ? `
                <div style="margin-bottom: 12px;">
                  <div style="font-weight: bold; font-size: 0.9rem; text-transform: uppercase; color: #555; font-family: var(--fuente); margin-bottom: 6px;">Características Destacadas:</div>
                  <ul class="benefits-list" style="--acento-list: ${v.accentColor || accentColor}; margin: 0; padding-left: 20px;">
                    ${benefitsListHtml}
                  </ul>
                </div>
              ` : ''}

              ${fichaTecnicaHtml}

              ${v.description && v.description.trim() ? `
                <div class="promo-main" style="${textStyle} white-space: pre-line; line-height: 1.4; margin-bottom: 12px; background: #fafafa; border-left: 3px solid ${v.accentColor || accentColor}; padding: 10px 12px; border-radius: 0 4px 4px 0;">
                  <span>${v.description}</span>
                </div>
              ` : ''}

              ${v.legal && v.legal.trim() ? `
                <p class="legal" style="font-size: 0.75rem; color: #999; margin: 0; line-height: 1.3;">
                  ${v.legal}
                </p>
              ` : ''}
            </div>
          </details>
      `;
    }

    return `
    <article class="card" id="auto-${v.id}" data-id="${v.id}" data-category="${v.category || 'suv'}" style="border-top: 5px solid ${v.accentColor || accentColor}; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: transform 0.2s, box-shadow 0.2s;">
      <div class="img-container" style="cursor: pointer;" onclick="if(typeof gtag==='function') { gtag('event', 'click_car_card', { 'car_name': '${v.name}', 'brand_name': '${brand}' }); }">
        ${imgContainerContent}
      </div>
      
      <div class="card-content" style="padding: 20px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; background: #fff;">
        <div>
          <!-- Badge Comercial -->
          <span class="card-badge-comercial" style="background: #000; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 0.8rem; border-radius: 4px; display: inline-block; margin-bottom: 10px; font-family: var(--fuente); letter-spacing: 0.5px; text-transform: uppercase;">
            ${brand === 'demos' ? 'AUTOS DEMO - LIQUIDACIÓN' : 'TIENDA OFICIAL 0 KM'}
          </span>
          
          <!-- Nombre del Modelo -->
          <h2 class="model-name" style="margin: 0; font-family: var(--fuente); font-size: 1.4rem; font-weight: 700; text-transform: uppercase; color: #111; line-height: 1.2; cursor: pointer;" onclick="if(typeof gtag==='function') { gtag('event', 'click_car_card', { 'car_name': '${v.name}', 'brand_name': '${brand}' }); }">
            <span style="${headingStyle}">${v.name}</span>
          </h2>
          
          <!-- Marca + Icono de Verificado -->
          <div class="brand-subname" style="color: #666; font-size: 0.9rem; margin-top: 5px; display: flex; align-items: center; gap: 4px; font-weight: bold; text-transform: uppercase; font-family: var(--fuente);">
            ${brand.toUpperCase()} <i class="fa-solid fa-circle-check" style="color: #1d9bf0; font-size: 0.85rem;"></i>
          </div>
          
          <!-- Sección de Precios (Lista Tachado + Promoción Destacado) -->
          <div class="price-container" style="margin-top: 15px; border-top: 1px solid #f0f0f0; padding-top: 12px;">
            ${v.listPrice ? `
              <div style="font-size: 1rem; color: #888; text-decoration: line-through; font-family: var(--fuente); font-weight: bold; margin-bottom: 2px;">
                Precio de Lista: ${v.listPrice}
              </div>
            ` : ''}
            <span style="font-size: 0.85rem; color: #777; display: block; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; font-family: var(--fuente);">
              ${v.listPrice ? 'Precio Promoción / Liquidación' : 'Desde'}
            </span>
            <div class="model-price" style="color: ${v.accentColor || accentColor}; font-size: 2.2rem; font-weight: bold; font-family: var(--fuente); line-height: 1; margin-top: 2px;">
              ${v.price}
            </div>
          </div>
          
          ${detailsAccordionHtml}
        </div>
      </div>
      
      <!-- Botón de Cotización por WhatsApp (Fijo en la parte inferior) -->
      <div style="padding: 0 20px 20px 20px; background: #fff;">
        <a aria-label="Cotizar ${v.name} por WhatsApp" class="btn-wa" style="background-color: ${v.accentColor || accentColor}; color: #fff; text-decoration: none; padding: 12px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; gap: 8px; font-size: 1.05rem; transition: background 0.3s; width: 100%; border: none; font-family: var(--fuente); text-transform: uppercase; letter-spacing: 0.5px;" href="${v.whatsapp}" rel="noopener" target="_blank" onclick="if(typeof gtag==='function') { gtag('event', 'click_whatsapp_cotizar', { 'car_name': '${v.name}', 'brand_name': '${brand}' }); }">
          <svg viewBox="0 0 24 24" style="fill: white; width: 18px; height: 18px; display: inline-block; vertical-align: middle;">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path>
          </svg>
          <span>Cotizar por WhatsApp</span>
        </a>
      </div>
    </article>
    `;
  }).join('');

  // Generar enlaces de navegación dinámicos (marcando el activo)
  const brands = ['ram', 'dodge', 'jeep', 'fiat', 'peugeot', 'leapmotor', 'demos'];
  const navLinksHtml = brands.map(b => {
    const activeClass = b === brand ? 'active' : '';
    const label = b === 'demos' ? 'AUTOS DEMO' : b.toUpperCase();
    return `<li><a href="promo-${b}.html" class="nav-item-link ${activeClass}" id="link-${b}">${label}</a></li>`;
  }).join('');
  
  const dbDataLocal = readData();
  const landingConfigLocal = dbDataLocal.landing || {};
  
  const uniqueCategories = new Set();
  vehicles.forEach(v => {
    if (v.category) uniqueCategories.add(v.category.toLowerCase().trim());
  });

  const demosCsv = landingConfigLocal.demosTableCsv || '';

  // Extract from demos CSV if on demos page
  if (brand === 'demos' && demosCsv.trim()) {
    const parsedRows = parseCsv(demosCsv.trim());
    if (parsedRows.length > 0) {
      const headers = parsedRows[0].map(h => h.trim().replace(/^["']|["']$/g, ''));
      const catIdx = headers.findIndex(h => h.toLowerCase().includes('clasificaci') || h.toLowerCase().includes('categor'));
      for (let i = 1; i < parsedRows.length; i++) {
        const cols = parsedRows[i];
          const modelName = (cols[1] || '').trim().replace(/^["']|["']$/g, '');
          let catVal = (cols[catIdx] || 'suv').trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
          catVal = getAutoClassification(catVal, modelName);
          uniqueCategories.add(catVal);
      }
    }
  }

  // Cross-Promotion Section (Related Demos)
  let relatedDemosHtml = '';
  if (brand !== 'demos' && demosCsv.trim()) {
    const parsedRows = parseCsv(demosCsv.trim());
    if (parsedRows.length > 1) {
      const headers = parsedRows[0].map(h => h.trim().replace(/^["']|["']$/g, ''));
      const catIdx = headers.findIndex(h => h.toLowerCase().includes('clasificaci') || h.toLowerCase().includes('categor'));
      
      const relatedRows = parsedRows.slice(1).filter(cols => {
        if (cols.length === 0 || (cols.length === 1 && cols[0] === '')) return false;
        const rowBrand = (cols[0] || '').trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
        return rowBrand === brand.toLowerCase();
      });

      if (relatedRows.length > 0) {
        const familiesMap = {};
        
        relatedRows.forEach(cols => {
          const model = (cols[1] || '').trim().replace(/^["']|["']$/g, '').trim();
          const year = (cols[2] || '').trim().replace(/^["']|["']$/g, '').trim();
          const color = (cols[3] || '').trim().replace(/^["']|["']$/g, '').trim();
          const km = (cols[4] || '').trim().replace(/^["']|["']$/g, '').trim();
          const price = (cols[5] || '').trim().replace(/^["']|["']$/g, '').trim();
          const stock = (cols[6] || '').trim().replace(/^["']|["']$/g, '').trim();
          const wa = (cols[7] || '').trim().replace(/^["']|["']$/g, '').trim();
          let category = catIdx !== -1 ? (cols[catIdx] || 'suv').trim().replace(/^["']|["']$/g, '').trim().toLowerCase() : 'suv';
          category = getAutoClassification(category, model);
          
          uniqueCategories.add(category);

          let displayPrice = price;
          const cleanNum = price.replace(/[^0-9.]/g, '');
          if (cleanNum) {
            const num = parseFloat(cleanNum);
            if (!isNaN(num)) {
              displayPrice = '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
          }

          const family = getModelFamily(brand, model);
          if (!familiesMap[family]) {
            familiesMap[family] = [];
          }
          
          familiesMap[family].push({
            model, year, color, km, price: displayPrice, stock, wa, category
          });
        });

        // Build the accordions HTML
        const accordionsHtml = Object.keys(familiesMap).map(familyName => {
          const units = familiesMap[familyName];
          const cardsHtml = units.map(u => `
            <article class="card related-demo-card" data-category="${u.category}" style="border-top-color: ${accentColor}; min-height: 200px; display: flex; flex-direction: column; justify-content: space-between;">
              <div class="card-header" style="padding-top: 15px;">
                <div class="model-info">
                  <span class="badge" style="background: ${accentColor}; color: #fff; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; text-transform: uppercase; font-weight: bold; display: inline-block; margin-bottom: 5px;">${u.category.toUpperCase()} - DEMO</span>
                  <h2 class="model-name" style="margin-top: 5px; cursor: pointer;" onclick="if(typeof gtag==='function') { gtag('event', 'click_car_card', { 'car_name': '${u.model}', 'brand_name': '${brand}' }); }">${u.model} (${u.year})</h2>
                  <div class="model-price" style="color: ${accentColor}; font-size: 1.35rem; font-weight: bold;">
                    ${u.price}
                  </div>
                </div>
              </div>
              <div class="promo-body" style="padding-top: 0; padding-bottom: 10px;">
                <p style="margin: 3px 0; font-size: 0.9rem; color: #555;">Color: <strong>${u.color}</strong> | Kilometraje: <strong>${u.km}</strong></p>
                <p style="margin: 3px 0; font-size: 0.9rem; color: #555;">Inventario: <strong>${u.stock}</strong></p>
              </div>
              <div class="card-footer" style="padding: 15px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; background: #fafafa;">
                <a aria-label="Cotizar ${u.model} por WhatsApp" class="btn-wa" style="background-color: ${accentColor}; padding: 8px 15px; font-size: 0.9rem; text-decoration: none; border-radius: 4px; display: inline-flex; align-items: center;" href="${u.wa}" rel="noopener" target="_blank" onclick="if(typeof gtag==='function') { gtag('event', 'click_whatsapp_cotizar_related_demo', { 'car_name': '${u.model}', 'brand_name': '${brand}' }); }">
                  <svg viewBox="0 0 24 24" style="fill: white; width: 14px; height: 14px; margin-right: 5px;">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path>
                  </svg>
                  <span style="color:white; font-weight:bold;">Cotizar Demo</span>
                </a>
              </div>
            </article>
          `).join('');

          return `
          <details class="brand-accordion demo-category-accordion" ontoggle="if(this.open && typeof gtag==='function') { gtag('event', 'view_car_details', { 'car_name': '${familyName}', 'brand_name': '${brand}' }); }" style="margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff;">
            <summary style="padding: 15px 20px; font-weight: bold; font-size: 1.1rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #f9f9f9; user-select: none;">
              <span>🚗 ${familyName}</span>
              <span style="font-size: 0.9rem; color: ${accentColor}; font-weight: normal;">👉 Haz clic aquí para ver versiones</span>
            </summary>
            <div class="grid-promos" style="padding: 20px; background: #fafafa; border-top: 1px solid #eee; margin-top: 0; margin-bottom: 0;">
              ${cardsHtml}
            </div>
          </details>
          `;
        }).join('\n');

        relatedDemosHtml = `
        <section class="related-demos-section" style="max-width: 960px; margin: 40px auto; padding: 0 10px;">
          <div class="heading-container" style="border-bottom: 2px solid ${accentColor}; padding-bottom: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
            <h3 class="table-title" style="margin: 0; color: #111; text-transform: uppercase;"><i class="fa-solid fa-tags" style="color: ${accentColor};"></i> Autos Demo según categoría</h3>
          </div>
          <p style="color: #444; font-size: 1.05rem; line-height: 1.5; margin-top: -10px; margin-bottom: 25px; background: rgba(0,0,0,0.02); padding: 15px; border-left: 4px solid ${accentColor}; border-radius: 4px;">
            Te muestro lo que tenemos en la categoría que elegiste. Adicionalmente, tengo promociones en el área de autos demo y te he dejado una lista para que puedas consultar los precios que te podemos ofrecer:
          </p>
          <div class="accordions-container" style="margin-top: 10px;">
            ${accordionsHtml}
          </div>
        </section>
        `;
      }
    }
  }

  // Build Filters html
  let filtersHtml = '';
  if (uniqueCategories.size > 1) {
    const categoryNames = {
      suv: '🚙 SUV',
      sedan: '🚗 Sedán',
      deportivos: '🏎️ Deportivos',
      trabajo: '💼 Trabajo',
      todoterreno: '⛰️ Todo Terreno',
      familiares: '👨‍👩‍👧‍👦 Familiares',
      electricos: '⚡ Eléctricos',
      hatchback: '🚗 Hatchback',
      crossover: '🚙 Crossover',
      chasis: '🚛 Chasis',
      pickup: '🛻 Pickup',
      van: '🚐 Van de Carga',
      vans: '🚐 Vans de Carga'
    };

    const filterButtons = Array.from(uniqueCategories).sort().map(cat => {
      const label = categoryNames[cat] || cat.toUpperCase();
      return `<button class="filter-pill" data-filter="${cat}">${label}</button>`;
    }).join('\n');
    
    filtersHtml = `
    <div class="filters-container">
      <button class="filter-pill active" data-filter="all">✨ Todos</button>
      ${filterButtons}
    </div>
    `;
  }
  
  let excelTableHtml = '';
  if (brand === 'demos') {
    const demosCsv = landingConfigLocal.demosTableCsv || '';
    if (demosCsv.trim()) {
      const parsedRows = parseCsv(demosCsv.trim());
      if (parsedRows.length > 0) {
        const headers = parsedRows[0].map(h => h.trim().replace(/^["']|["']$/g, ''));
        
        const grouped = {};
        for (let i = 1; i < parsedRows.length; i++) {
          const cols = parsedRows[i];
          if (cols.length === 0 || (cols.length === 1 && cols[0] === '')) continue;
          
          let brandName = (cols[0] || 'Otros').trim().replace(/^["']|["']$/g, '').trim();
          if (!brandName) brandName = 'Otros';
          
          const brandKey = brandName.toUpperCase();
          if (!grouped[brandKey]) {
            grouped[brandKey] = {
              displayName: brandName.toUpperCase(),
              rows: []
            };
          }
          grouped[brandKey].rows.push(cols);
        }

        let accordionsHtml = '';
        Object.keys(grouped).sort().forEach(brandKey => {
          const group = grouped[brandKey];
          const totalUnits = group.rows.length;
          const labelUnits = totalUnits === 1 ? '1 unidad' : `${totalUnits} unidades`;
          
          let rowsHtml = '';
          group.rows.forEach((cols, rowIndex) => {
            let colsHtml = '';
            headers.forEach((h, idx) => {
              let val = cols[idx] || '';
              val = val.trim().replace(/^["']|["']$/g, '').trim();
              val = val.replace(/\r?\n/g, '<br>');

              if (h.toLowerCase().includes('precio')) {
                const cleanNum = val.replace(/[^0-9.]/g, '');
                if (cleanNum) {
                  const num = parseFloat(cleanNum);
                  if (!isNaN(num)) {
                    val = '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                  }
                }
              }

              if (val.startsWith('http://') || val.startsWith('https://')) {
                const carBrand = (cols[0] || 'Demo').trim().replace(/^["']|["']$/g, '');
                const carModel = (cols[1] || '').trim().replace(/^["']|["']$/g, '');
                const fullName = `${carBrand} ${carModel}`.trim().replace(/'/g, "\\'");
                colsHtml += `<td data-label="${h}"><a href="${val}" target="_blank" class="btn-wa-table" style="background:${accentColor};" onclick="if(typeof gtag==='function') { gtag('event', 'click_whatsapp_cotizar_tabla', { 'car_name': '${fullName}', 'brand_name': 'demos' }); }">Cotizar</a></td>`;
              } else {
                colsHtml += `<td data-label="${h}">${val}</td>`;
              }
            });
            const catIdx = headers.findIndex(h => h.toLowerCase().includes('clasificaci') || h.toLowerCase().includes('categor'));
            let catVal = catIdx !== -1 ? (cols[catIdx] || 'suv').trim().replace(/^["']|["']$/g, '').trim().toLowerCase() : 'suv';
            const modelVal = (cols[1] || 'demo').trim().replace(/^["']|["']$/g, '');
            catVal = getAutoClassification(catVal, modelVal);
            const cleanModelId = modelVal.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            rowsHtml += `<tr id="row-${cleanModelId}-${rowIndex}" data-category="${catVal}">${colsHtml}</tr>`;
          });

          accordionsHtml += `
          <details class="brand-accordion">
            <summary class="brand-accordion-summary">
              <span class="brand-name-text"><i class="fa-solid fa-car-side"></i> ${group.displayName}</span>
              <span class="brand-units-badge">${labelUnits}</span>
            </summary>
            <div class="brand-accordion-content">
              <div class="table-responsive-scroll">
                <table class="demo-excel-table">
                  <thead>
                    <tr>
                      ${headers.map(h => `<th>${h}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
          `;
        });

        excelTableHtml = `
        <div class="excel-table-container">
          <div class="table-header-actions" style="margin-bottom: 25px;">
            <div>
              <h3 class="table-title" style="margin-bottom: 5px;"><i class="fa-solid fa-list-check"></i> Inventario de Autos Demo</h3>
              <p style="color: #666; font-size: 0.95rem; margin: 0;">Si buscas otro modelo o color, consulta nuestro listado por marca a continuación:</p>
            </div>
            <div class="table-search-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" id="demoTableSearch" placeholder="Buscar unidad..." onkeyup="filterDemoTable()">
            </div>
          </div>
          <div class="accordions-container">
            ${accordionsHtml}
          </div>
        </div>
        `;
      }
    }
  }

  let leasingPopupImgSrc = optimizeCloudinaryUrl(landingConfigLocal.leasingPopupImage) || '../imagenes/popup_arrendamiento.jpg';
  if (leasingPopupImgSrc && !leasingPopupImgSrc.startsWith('http') && !leasingPopupImgSrc.startsWith('../')) {
    leasingPopupImgSrc = `../${leasingPopupImgSrc}`;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="es">
 <head>
   <!-- Google Tag (gtag.js) - Google Analytics -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XRDWZPQ4WT"></script>
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', 'G-XRDWZPQ4WT');
   </script>

  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700&amp;display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <title>Promociones ${brand.toUpperCase()}</title>
  <style>
    :root {
      --acento: ${accentColor};
      --fondo-inv: #FFF6F2;
      --borde-inv: #ffd9c7;
      --gris-suave: #F4F4F4;
      --gris-texto: #666666;
      --texto-minimo: #999999;
      --fuente: 'Barlow Condensed', sans-serif;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    .grid-promos {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      padding: 10px;
      max-width: 960px;
      margin: 0 auto;
    }

    @media (max-width: 700px) {
      .grid-promos {
        grid-template-columns: 1fr;
      }
    }

    /* Estilos de la Tabla Excel Interactiva */
    .excel-table-container {
      max-width: 960px;
      margin: 30px auto;
      background: #fff;
      border: 1px solid #E0E0E0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0,0,0,0.05);
      padding: 20px;
      font-family: var(--fuente);
    }
    .excel-table-container * {
      font-family: var(--fuente);
    }
    .excel-table-container i, 
    .excel-table-container i::before, 
    .excel-table-container i::after {
      font-family: 'Font Awesome 6 Free' !important;
      font-weight: 900;
    }

    @keyframes bounce {
      0%, 20%, 50%, 80%, 100% {
        transform: translateY(0);
      }
      40% {
        transform: translateY(-8px);
      }
      60% {
        transform: translateY(-4px);
      }
    }
    .table-header-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 20px;
    }
    .table-title {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 700;
      color: #111;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .table-search-box {
      position: relative;
      width: 100%;
      max-width: 300px;
    }
    .table-search-box i {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #888;
    }
    .table-search-box input {
      width: 100%;
      padding: 8px 12px 8px 35px;
      border: 1px solid #ccc;
      border-radius: 20px;
      font-size: 0.9rem;
      outline: none;
      transition: border 0.3s;
    }
    .table-search-box input:focus {
      border-color: var(--acento);
    }
    .table-responsive-scroll {
      overflow-x: auto;
      border-radius: 4px;
      border: 1px solid #eee;
    }
    /* Estilos de Acordeones por Marca */
    .brand-accordion {
      background: #fdfdfd;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: box-shadow 0.3s ease;
    }
    .brand-accordion:hover {
      box-shadow: 0 4px 10px rgba(0,0,0,0.03);
    }
    .brand-accordion-summary {
      padding: 15px 20px;
      font-size: 1.1rem;
      font-weight: 700;
      color: #333;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      list-style: none;
      background: #f9f9f9;
      user-select: none;
      outline: none;
      transition: background 0.3s;
    }
    .brand-accordion-summary::-webkit-details-marker {
      display: none;
    }
    .brand-accordion-summary:hover {
      background: #f2f2f2;
    }
    .brand-accordion[open] .brand-accordion-summary {
      background: #f1f1f1;
      border-bottom: 1px solid #e0e0e0;
    }
    .brand-accordion-summary::after {
      content: '\f078';
      font-family: 'Font Awesome 6 Free';
      font-weight: 900;
      font-size: 0.9rem;
      color: #888;
      transition: transform 0.3s ease;
    }
    .brand-accordion[open] .brand-accordion-summary::after {
      transform: rotate(180deg);
    }
    .brand-name-text {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-units-badge {
      background: #e1f5fe;
      color: #0288d1;
      font-size: 0.8rem;
      padding: 3px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .brand-accordion-content {
      padding: 15px;
      background: #fff;
    }

    .demo-excel-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.95rem;
    }
    .demo-excel-table th {
      background: #f4f4f4;
      color: #111;
      font-weight: 700;
      padding: 12px;
      border-bottom: 2px solid #E0E0E0;
      text-transform: uppercase;
      font-size: 0.85rem;
    }
    .demo-excel-table td {
      padding: 12px;
      border-bottom: 1px solid #eee;
      color: #444;
    }
    .demo-excel-table tr:hover {
      background: #fafafa;
    }
    .btn-wa-table {
      color: #fff;
      text-decoration: none;
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      display: inline-block;
      text-align: center;
    }

    @media (max-width: 768px) {
      .demo-excel-table, 
      .demo-excel-table thead, 
      .demo-excel-table tbody, 
      .demo-excel-table th, 
      .demo-excel-table td, 
      .demo-excel-table tr {
        display: block;
      }
      .demo-excel-table thead tr {
        position: absolute;
        top: -9999px;
        left: -9999px;
      }
      .demo-excel-table tr {
        border: 1px solid #E0E0E0;
        border-radius: 8px;
        margin-bottom: 15px;
        padding: 10px;
        background: #fff;
        box-shadow: 0 2px 5px rgba(0,0,0,0.02);
      }
      .demo-excel-table td {
        border: none;
        border-bottom: 1px solid #eee;
        position: relative;
        padding-left: 45% !important;
        text-align: right;
        min-height: 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .demo-excel-table td:last-child {
        border-bottom: 0;
        justify-content: center;
        padding-left: 12px !important;
        margin-top: 10px;
      }
      .demo-excel-table td::before {
        content: attr(data-label);
        position: absolute;
        left: 12px;
        font-weight: 700;
        text-align: left;
        text-transform: uppercase;
        font-size: 0.75rem;
        color: #888;
      }
      .btn-wa-table {
        width: 100%;
        padding: 10px;
        font-size: 0.9rem;
      }
    }

    .card {
      background: #fff;
      border: 1px solid #E0E0E0;
      border-top: 5px solid var(--acento);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
    }

    .img-container {
      width: 100%;
      padding-top: ${brand === 'demos' ? '100%' : '75%'};
      position: relative;
      background: #f5f5f5;
    }

    .card-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: ${brand === 'demos' ? 'cover' : 'contain'};
      background: #f5f5f5;
    }

    /* Carousel / Gallery Slider Styles */
    .carousel {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .carousel-track-wrapper {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .carousel-track {
      display: flex;
      width: 100%;
      height: 100%;
      transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    .carousel-slide {
      min-width: 100%;
      height: 100%;
      position: relative;
    }
    .card-img-carousel {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .carousel-control {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0,0,0,0.5);
      color: #fff;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transition: background 0.3s;
    }
    .carousel-control:hover {
      background: rgba(0,0,0,0.8);
    }
    .carousel-control.prev {
      left: 10px;
    }
    .carousel-control.next {
      right: 10px;
    }
    .carousel-indicators {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      z-index: 10;
    }
    .carousel-indicators .indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255,255,255,0.5);
      cursor: pointer;
      transition: background 0.3s;
    }
    .carousel-indicators .indicator.active {
      background: #fff;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    }

    .card-header {
      padding: 12px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #eee;
      gap: 8px;
    }

    .model-name {
      font-family: var(--fuente);
      font-size: clamp(1rem, 3vw, 1.3rem);
      font-weight: 700;
      text-transform: uppercase;
      margin: 0;
      color: #111;
    }

    .model-price {
      font-family: var(--fuente);
      font-size: 1.1rem;
      font-weight: 700;
    }

    .btn-wa {
      color: #fff;
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--fuente);
      font-weight: 700;
      font-size: 0.85rem;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .promo-body {
      padding: 15px;
      flex-grow: 1;
      display: flex;
      box-sizing: border-box;
      flex-direction: column;
    }

    .promo-main {
      font-family: var(--fuente);
      line-height: 1.4;
      background: var(--gris-suave);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 12px;
    }

    .benefits-list {
      list-style: none;
      padding: 0;
      margin: 0 0 12px 0;
      font-family: var(--fuente);
    }

    .benefits-list li {
      font-size: 0.9rem;
      margin-bottom: 5px;
      color: var(--gris-texto);
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .benefits-list li::before {
      content: "✓";
      color: var(--acento-list, var(--acento));
      font-weight: bold;
      flex-shrink: 0;
    }

    .legal {
      font-size: 0.72rem;
      color: var(--texto-minimo);
      margin-top: auto;
      padding-top: 10px;
      font-family: var(--fuente);
      line-height: 1.4;
    }

    /* Card Details Accordion Styles */
    .card-details-accordion summary::-webkit-details-marker {
      display: none;
    }
    .card-details-accordion summary:hover {
      background: #f1f3f5 !important;
    }
    .card-details-accordion[open] summary .accordion-arrow {
      transform: rotate(180deg);
    }
    .card-details-accordion[open] summary {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      background: #f1f3f5;
    }

    .embed-footer {
      height: 12px;
    }

    .no-promos {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px;
      font-family: var(--fuente);
      font-size: 1.2rem;
      color: var(--gris-texto);
      background: #fafafa;
      border: 1px dashed #ccc;
      border-radius: 8px;
    }

    /* Estilos de la Barra de Navegación */
    .brand-navbar {
      background: rgba(15, 20, 30, 0.95);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(0, 229, 255, 0.2);
      position: sticky;
      top: 0;
      width: 100%;
      z-index: 1000;
      font-family: var(--fuente);
    }
    .brand-nav-container {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 15px;
    }
    .brand-logo {
      color: #fff;
      text-decoration: none;
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .brand-logo .accent-text {
      color: #00e5ff;
    }
    .nav-toggle {
      display: none;
      background: none;
      border: none;
      cursor: pointer;
      flex-direction: column;
      gap: 5px;
      padding: 5px;
    }
    .nav-toggle .bar {
      width: 25px;
      height: 3px;
      background-color: #fff;
      border-radius: 2px;
      transition: transform 0.3s, opacity 0.3s;
    }
    .nav-links {
      list-style: none;
      display: flex;
      align-items: center;
      gap: 15px;
      margin: 0;
      padding: 0;
    }
    .nav-item-link {
      color: #ccc;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.9rem;
      text-transform: uppercase;
      transition: color 0.3s;
    }
    .nav-item-link:hover, .nav-item-link.active {
      color: #00e5ff;
    }
    .btn-back-home {
      background: linear-gradient(45deg, #0d6efd, #00e5ff);
      color: #fff;
      text-decoration: none;
      padding: 6px 16px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 0.85rem;
      text-transform: uppercase;
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .btn-back-home:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 15px #00e5ff;
      color: #000;
    }

    /* Animación del menú hamburguesa */
    .nav-toggle.open .bar:nth-child(1) {
      transform: translateY(8px) rotate(45deg);
    }
    .nav-toggle.open .bar:nth-child(2) {
      opacity: 0;
    }
    .nav-toggle.open .bar:nth-child(3) {
      transform: translateY(-8px) rotate(-45deg);
    }

    /* Estilos del Popup de Arrendamiento */
    .leasing-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 99999;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.4s ease;
    }
    .leasing-popup-overlay.show {
      opacity: 1;
    }
    .leasing-popup-content {
      position: relative;
      max-width: 420px; /* Ajustado para imágenes verticales / alargadas */
      width: 100%;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 229, 255, 0.3);
      border: 1px solid rgba(0, 229, 255, 0.4);
      background: #000;
      transform: scale(0.9);
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .leasing-popup-overlay.show .leasing-popup-content {
      transform: scale(1);
    }
    .leasing-popup-img {
      width: 100%;
      height: auto;
      display: block;
      transition: transform 0.3s ease;
    }
    .leasing-popup-img:hover {
      transform: scale(1.02);
    }
    .leasing-popup-close {
      position: absolute;
      top: 15px;
      right: 15px;
      background: rgba(0, 0, 0, 0.7);
      border: 2px solid #fff;
      color: #fff;
      font-size: 24px;
      font-weight: bold;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999 !important;
      pointer-events: auto !important;
      transition: background 0.3s, color 0.3s, border-color 0.3s;
    }
    .leasing-popup-close:hover {
      background: #00e5ff;
      color: #000;
      border-color: #00e5ff;
    }

    @media (max-width: 768px) {
      .nav-toggle {
        display: flex;
      }
      .nav-links {
        display: none;
        grid-template-columns: repeat(2, 1fr);
        width: 100%;
        position: absolute;
        top: 100%;
        left: 0;
        background: rgba(10, 15, 25, 0.98);
        border-bottom: 1px solid rgba(0, 229, 255, 0.2);
        padding: 25px 20px;
        gap: 15px;
        justify-items: center;
        align-items: center;
        box-shadow: 0 10px 20px rgba(0,0,0,0.5);
      }
      .nav-links.open {
        display: grid;
      }
      /* Hacer que el botón de Inicio ocupe el ancho completo */
      .nav-links li:last-child {
        grid-column: 1 / -1;
        width: 100%;
        display: flex;
        justify-content: center;
        margin-top: 10px;
      }
      .btn-back-home {
        width: 100%;
        max-width: 250px;
        text-align: center;
      }
    }
    
    /* Estilos de Filtros de Categoría */
    .filters-container {
      max-width: 960px;
      margin: 30px auto 10px auto;
      padding: 0 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .filter-pill {
      background: rgba(255, 255, 255, 0.9);
      color: #333;
      border: 1px solid #ddd;
      padding: 8px 18px;
      border-radius: 25px;
      cursor: pointer;
      font-family: var(--fuente);
      font-weight: 700;
      font-size: 0.95rem;
      text-transform: uppercase;
      transition: all 0.25s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      outline: none;
    }
    .filter-pill:hover {
      background: #e2e2e2;
      border-color: #bbb;
      transform: translateY(-1px);
    }
    .filter-pill.active {
      background: var(--acento);
      color: #fff;
      border-color: var(--acento);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .related-demo-card {
      box-shadow: 0 4px 15px rgba(0,0,0,0.05);
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .related-demo-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.1);
    }
  </style>
 </head>
 <body>
  <!-- BARRA DE NAVEGACIÓN -->
  <nav class="brand-navbar">
    <div class="brand-nav-container">
      <a href="../index.html" class="brand-logo">STELLANTIS <span class="accent-text">PROMOS</span></a>
      <button class="nav-toggle" id="navToggle" aria-label="Abrir menú">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </button>
      <ul class="nav-links" id="navLinks">
        ${navLinksHtml}
        <li><a href="../index.html" class="btn-back-home">Inicio</a></li>
      </ul>
    </div>
  </nav>

  ${filtersHtml}

  ${brand === 'demos' ? `
  <div class="section-divider" style="max-width: 960px; margin: 30px auto 15px auto; padding: 0 10px;">
    <h2 style="font-family: var(--fuente); text-transform: uppercase; color: #111; border-bottom: 3px solid var(--acento); padding-bottom: 8px; font-size: 1.6rem; display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
      <i class="fa-solid fa-camera" style="color: var(--acento);"></i> Demos Destacados con Fotos
    </h2>
    <p style="color: #666; font-family: var(--fuente); font-size: 1.05rem; margin: 0 0 10px 0;">Revisa las unidades físicas que tenemos listas para entrega inmediata:</p>
  </div>
  ` : ''}
  
  <div class="grid-promos" style="margin-top: 10px; margin-bottom: 40px;">
    ${cardsHtml.length > 0 ? cardsHtml : (brand === 'demos' ? '<div class="no-promos">No hay promociones destacadas con fotos cargadas actualmente.</div>' : '<div class="no-promos">No hay promociones activas actualmente para esta marca.</div>')}
  </div>

  ${relatedDemosHtml}

  ${brand === 'demos' && excelTableHtml.trim() ? `
  <!-- Divider Banner informing client about the full text inventory below -->
  <div class="inventory-indicator-banner" style="max-width: 960px; margin: 40px auto 10px auto; padding: 0 10px;">
    <div style="background: linear-gradient(135deg, #111 0%, #222 100%); color: #fff; padding: 20px; border-radius: 8px; border-left: 6px solid var(--acento); box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
      <div style="flex: 1; min-width: 280px;">
        <h4 style="margin: 0; font-family: var(--fuente); font-size: 1.3rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--acento); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-circle-info"></i> ¿No encontraste tu foto o modelo?
        </h4>
        <p style="margin: 5px 0 0 0; font-family: var(--fuente); font-size: 1.05rem; color: #ccc;">
          👉 Tenemos más unidades de autos demo en liquidación. Desliza hacia abajo para consultar el **Inventario de Texto Completo**.
        </p>
      </div>
      <div style="font-family: var(--fuente); font-size: 1.8rem; font-weight: bold; color: var(--acento); display: flex; align-items: center; animation: bounce 2s infinite;">
        <i class="fa-solid fa-arrow-down-long"></i>
      </div>
    </div>
  </div>
  ` : ''}

  ${excelTableHtml}
  <div class="embed-footer"></div>

  <!-- Popup de Arrendamiento (Vanilla CSS/JS Ligero) -->
  <div id="leasingPopup" class="leasing-popup-overlay" style="display: none;" onclick="closeLeasingPopupOverlay(event)">
    <div class="leasing-popup-content" onclick="event.stopPropagation()">
      <button class="leasing-popup-close" id="closeLeasingPopup" onclick="closeLeasingPopupOverlay(event)" aria-label="Cerrar">&times;</button>
      <a href="https://wa.me/525521787900?text=Hola,%20solicito%20información%20sobre%20el%20arrendamiento" target="_blank" id="leasingPopupLink" onclick="if(typeof gtag==='function') { gtag('event', 'click_whatsapp_leasing', { 'brand_name': '${brand}' }); }">
        <img src="${leasingPopupImgSrc}" class="leasing-popup-img" alt="Promoción Especial Arrendamiento" onerror="this.onerror=null; this.src='../imagenes/carrusel_1.jpg';">
      </a>
    </div>
  </div>

  <script>
    document.addEventListener("DOMContentLoaded", function() {
      // Lógica de Menú Hamburguesa Responsivo
      var navToggle = document.getElementById("navToggle");
      var navLinks = document.getElementById("navLinks");
      if (navToggle && navLinks) {
        navToggle.addEventListener("click", function(e) {
          e.stopPropagation();
          navToggle.classList.toggle("open");
          navLinks.classList.toggle("open");
        });
        document.addEventListener("click", function(e) {
          if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) {
            navToggle.classList.remove("open");
            navLinks.classList.remove("open");
          }
        });
      }

      // Lógica de Popup de Arrendamiento
      window.closeLeasingPopupOverlay = function(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var popup = document.getElementById('leasingPopup');
        if (popup) {
          if (typeof gtag === 'function' && !localStorage.getItem('leasing_popup_shown')) {
            gtag('event', 'dismiss_popup_leasing', { 'brand_name': '${brand}' });
          }
          popup.classList.remove('show');
          setTimeout(function() {
            popup.style.display = 'none';
            sessionStorage.setItem('leasing_popup_dismissed', 'true');
            // Dispatch event to notify chatbot
            var closedEvent = new CustomEvent('leasingClosed');
            document.dispatchEvent(closedEvent);
          }, 400);
        }
      };

      var wasShown = localStorage.getItem('leasing_popup_shown');
      var wasDismissed = sessionStorage.getItem('leasing_popup_dismissed');

      if (!wasShown && !wasDismissed) {
        setTimeout(function() {
          var popup = document.getElementById('leasingPopup');
          if (popup) {
            popup.style.display = 'flex';
            setTimeout(function() {
              popup.classList.add('show');
              if (typeof gtag === 'function') {
                gtag('event', 'view_popup_leasing', { 'brand_name': '${brand}' });
              }
            }, 50);

            document.getElementById('leasingPopupLink').addEventListener('click', function() {
              localStorage.setItem('leasing_popup_shown', 'true');
            });
          }
        }, 2000);
      }
      
      // Lógica de Filtros de Categoría
      var filterPills = document.querySelectorAll(".filter-pill");
      filterPills.forEach(function(pill) {
        pill.addEventListener("click", function() {
          filterPills.forEach(function(p) { p.classList.remove("active"); });
          this.classList.add("active");
          
          var filterVal = this.getAttribute("data-filter");
          
          // Filtrar Tarjetas de Nuevos y Demos Destacados
          var cards = document.querySelectorAll(".grid-promos .card:not(.related-demo-card)");
          cards.forEach(function(card) {
            var cat = card.getAttribute("data-category");
            if (filterVal === "all" || cat === filterVal) {
              card.style.display = "";
            } else {
              card.style.display = "none";
            }
          });
          
          // Filtrar los acordeones de Demos agrupados por familia
          var demoCategoryAccordions = document.querySelectorAll(".demo-category-accordion");
          demoCategoryAccordions.forEach(function(accordion) {
            var relatedCards = accordion.querySelectorAll(".related-demo-card");
            var hasVisibleCard = false;
            relatedCards.forEach(function(rc) {
              var cat = rc.getAttribute("data-category");
              if (filterVal === "all" || cat === filterVal) {
                rc.style.display = "";
                hasVisibleCard = true;
              } else {
                rc.style.display = "none";
              }
            });
            
            if (hasVisibleCard) {
              accordion.style.display = "";
              accordion.open = false; // Mantener siempre contraídos al filtrar
            } else {
              accordion.style.display = "none";
            }
          });
          
          // Filtrar Filas de Tabla Demos
          var tableRows = document.querySelectorAll(".demo-excel-table tbody tr");
          tableRows.forEach(function(row) {
            var cat = row.getAttribute("data-category");
            if (filterVal === "all" || cat === filterVal) {
              row.style.display = "";
            } else {
              row.style.display = "none";
            }
          });

          // Filtrar y Colapsar/Expandir Acordeones de Demos (Página de Demos)
          var accordions = document.querySelectorAll(".brand-accordion:not(.demo-category-accordion)");
          accordions.forEach(function(accordion) {
            var rows = accordion.querySelectorAll(".demo-excel-table tbody tr");
            var hasVisibleRow = false;
            rows.forEach(function(r) {
              if (r.style.display !== "none") {
                hasVisibleRow = true;
              }
            });
            
            if (hasVisibleRow) {
              accordion.style.display = "";
              accordion.open = false; // Mantener siempre contraídos al filtrar
            } else {
              accordion.style.display = "none";
            }
          });
        });
      });
    });

    // Lógica para filtrar la tabla interactiva de demos con acordeones
    function filterDemoTable() {
      var input = document.getElementById("demoTableSearch");
      if (!input) return;
      var filter = input.value.toUpperCase();
      
      // Filtrar Tarjetas de Demos Destacados con Fotos
      var cards = document.querySelectorAll(".grid-promos .card:not(.related-demo-card)");
      cards.forEach(function(card) {
        var txtValue = card.textContent || card.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
          card.style.display = "";
        } else {
          card.style.display = "none";
        }
      });

      // Filtrar Acordeones de Tabla
      var accordions = document.querySelectorAll(".brand-accordion");
      accordions.forEach(function(accordion) {
        var table = accordion.querySelector(".demo-excel-table");
        if (!table) return;
        var tr = table.getElementsByTagName("tr");
        var hasVisibleRow = false;
        
        for (var i = 1; i < tr.length; i++) {
          var show = false;
          var td = tr[i].getElementsByTagName("td");
          for (var j = 0; j < td.length; j++) {
            if (td[j]) {
              var txtValue = td[j].textContent || td[j].innerText;
              if (txtValue.toUpperCase().indexOf(filter) > -1) {
                show = true;
                break;
              }
            }
          }
          tr[i].style.display = show ? "" : "none";
          if (show) {
            hasVisibleRow = true;
          }
        }
        
        if (filter.length > 0) {
          if (hasVisibleRow) {
            accordion.style.display = "";
            accordion.open = true;
          } else {
            accordion.style.display = "none";
            accordion.open = false;
          }
        } else {
          accordion.style.display = "";
          accordion.open = false;
        }
      });
    }
  </script>
  
  <!-- Chatbot Asistente IA -->
  <style>
    .chatbot-container {
      position: fixed;
      bottom: 25px;
      right: 25px;
      z-index: 999999;
      font-family: Arial, sans-serif;
    }
    .chatbot-launcher {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--acento);
      border: 3px solid #fff;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      position: relative;
      transition: transform 0.3s ease;
    }
    .chatbot-launcher:hover {
      transform: scale(1.08);
    }
    .launcher-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .launcher-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      background: #ff3b30;
      color: #fff;
      font-size: 11px;
      font-weight: bold;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #fff;
      animation: bounce 2s infinite;
    }
    @keyframes bounce {
      0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-5px); }
      60% { transform: translateY(-3px); }
    }
    .chatbot-window {
      position: absolute;
      bottom: 75px;
      right: 0;
      width: 330px;
      height: 460px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 5px 25px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0);
      transform-origin: bottom right;
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border: 1px solid #eee;
    }
    .chatbot-window.active {
      transform: scale(1);
    }
    .chatbot-header {
      padding: 12px 15px;
      color: #fff;
      display: flex;
      align-items: center;
      position: relative;
    }
    .chat-header-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #fff;
      margin-right: 10px;
    }
    .chat-header-info {
      flex: 1;
    }
    .chat-header-name {
      margin: 0;
      font-size: 14px;
      font-weight: bold;
    }
    .chat-header-status {
      font-size: 11px;
      opacity: 0.9;
    }
    .chatbot-close-btn {
      background: none;
      border: none;
      color: #fff;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .chatbot-body {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      background: #fdfdfd;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chat-message {
      max-width: 85%;
      display: flex;
      flex-direction: column;
    }
    .chat-message .message-content {
      padding: 10px 14px;
      border-radius: 15px;
      font-size: 13.5px;
      line-height: 1.4;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .bot-message {
      align-self: flex-start;
    }
    .bot-message .message-content {
      background: #f0f0f0;
      color: #333;
      border-bottom-left-radius: 3px;
    }
    .user-message {
      align-self: flex-end;
    }
    .user-message .message-content {
      background: var(--acento);
      color: #fff;
      border-bottom-right-radius: 3px;
    }
    .chatbot-options {
      padding: 10px 15px;
      background: #fff;
      border-top: 1px solid #f0f0f0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-height: 120px;
      overflow-y: auto;
    }
    .option-btn {
      background: #fff;
      color: #555;
      border: 1px solid #ddd;
      padding: 6px 12px;
      border-radius: 15px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: bold;
    }
    .option-btn:hover {
      background: #f5f5f5;
      border-color: #bbb;
      color: #333;
    }
    .chatbot-input-area {
      display: flex;
      padding: 10px 15px;
      border-top: 1px solid #eee;
      background: #fff;
    }
    .chatbot-input-area input {
      flex: 1;
      border: 1px solid #ddd;
      border-radius: 20px;
      padding: 8px 15px;
      font-size: 13px;
      outline: none;
      transition: border 0.2s;
    }
    .chatbot-input-area input:focus {
      border-color: var(--acento);
    }
    .chatbot-input-area button {
      border: none;
      color: #fff;
      width: 35px;
      height: 35px;
      border-radius: 50%;
      margin-left: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    }
    .chatbot-input-area button:hover {
      transform: scale(1.05);
    }
    .chat-card-suggestion {
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 8px;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .chat-card-body {
      padding: 8px 12px;
    }
    .chat-card-title {
      font-size: 13px;
      font-weight: bold;
      margin: 0 0 3px 0;
      color: #333;
    }
    .chat-card-price {
      font-size: 12px;
      color: var(--acento);
      font-weight: bold;
      margin: 0 0 5px 0;
    }
    .chat-card-btn {
      display: block;
      width: 100%;
      text-align: center;
      padding: 6px;
      background: #f5f5f5;
      color: #333;
      font-size: 11px;
      text-decoration: none;
      font-weight: bold;
      border-top: 1px solid #eee;
      transition: background 0.2s;
    }
    .chat-card-btn:hover {
      background: #e9e9e9;
    }
  </style>

  <div id="chatbotContainer" class="chatbot-container">
    <button id="chatbotLauncher" class="chatbot-launcher" aria-label="Abrir Asistente" style="background: var(--acento); display: flex; align-items: center; justify-content: center;">
      <div class="launcher-avatar-svg" style="width: 32px; height: 32px; color: #fff;">
        <svg viewBox="0 0 24 24" style="fill: currentColor; width: 100%; height: 100%;">
          <path d="M12 2c0 5.523-4.477 10-10 10 5.523 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z"/>
          <path d="M19 4.5c0 1.38-1.12 2.5-2.5 2.5 1.38 0 2.5 1.12 2.5 2.5 0-1.38 1.12-2.5 2.5-2.5-1.38 0-2.5-1.12-2.5-2.5z" opacity="0.8"/>
          <path d="M5 16.5c0 .83-.67 1.5-1.5 1.5.83 0 1.5.67 1.5 1.5 0-.83.67-1.5 1.5-1.5-.83 0-1.5-.67-1.5-1.5z" opacity="0.6"/>
        </svg>
      </div>
      <span class="launcher-badge">1</span>
    </button>
    
    <div id="chatbotWindow" class="chatbot-window">
      <div class="chatbot-header" style="background: var(--acento); display: flex; align-items: center; padding: 15px; border-bottom: 1px solid rgba(0,0,0,0.05); color: #fff; border-top-left-radius: 10px; border-top-right-radius: 10px;">
        <div class="chat-header-avatar-svg" style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; color: #fff; padding: 6px;">
          <svg viewBox="0 0 24 24" style="fill: currentColor; width: 100%; height: 100%;">
            <path d="M12 2c0 5.523-4.477 10-10 10 5.523 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z"/>
            <path d="M19 4.5c0 1.38-1.12 2.5-2.5 2.5 1.38 0 2.5 1.12 2.5 2.5 0-1.38 1.12-2.5 2.5-2.5-1.38 0-2.5-1.12-2.5-2.5z" opacity="0.8"/>
            <path d="M5 16.5c0 .83-.67 1.5-1.5 1.5.83 0 1.5.67 1.5 1.5 0-.83.67-1.5 1.5-1.5-.83 0-1.5-.67-1.5-1.5z" opacity="0.6"/>
          </svg>
        </div>
        <div class="chat-header-info">
          <h4 class="chat-header-name" style="margin: 0; font-size: 1.05rem; font-weight: bold; color: #fff; line-height: 1.2;">Asistente Virtual</h4>
          <span class="chat-header-status" style="font-size: 0.8rem; opacity: 0.9; display: block; margin-top: 2px; color: #fff;">IA Stellantis • En Línea</span>
        </div>
        <button id="chatbotClose" class="chatbot-close-btn" aria-label="Cerrar Asistente" style="margin-left: auto; background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
      </div>
      
      <div id="chatbotBody" class="chatbot-body"></div>
      <div id="chatbotOptions" class="chatbot-options"></div>
      
      <div class="chatbot-input-area">
        <input type="text" id="chatbotInput" placeholder="Escribe tu pregunta o duda...">
        <button id="chatbotSend" style="background: var(--acento);"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener("DOMContentLoaded", function() {
      var launcher = document.getElementById("chatbotLauncher");
      var windowEl = document.getElementById("chatbotWindow");
      var closeBtn = document.getElementById("chatbotClose");
      var body = document.getElementById("chatbotBody");
      var optionsContainer = document.getElementById("chatbotOptions");
      var input = document.getElementById("chatbotInput");
      var sendBtn = document.getElementById("chatbotSend");
      
      var kb = ${JSON.stringify(chatbotRules)};
      var brandKey = "${brand}";
      var config = kb[brandKey] || kb["general"];
      
      launcher.addEventListener("click", function() {
        windowEl.classList.toggle("active");
        var badge = launcher.querySelector(".launcher-badge");
        if (badge) badge.style.display = "none";
      });
      
      closeBtn.addEventListener("click", function() {
        windowEl.classList.remove("active");
      });
      
      var openChat = function() {
        var isDismissed = sessionStorage.getItem("chatbot_dismissed");
        if (!isDismissed && !windowEl.classList.contains("active")) {
          windowEl.classList.add("active");
          var badge = launcher.querySelector(".launcher-badge");
          if (badge) badge.style.display = "none";
          sessionStorage.setItem("chatbot_dismissed", "true");
        }
      };

      var wasShownLeasing = localStorage.getItem('leasing_popup_shown');
      var wasDismissedLeasing = sessionStorage.getItem('leasing_popup_dismissed');
      var leasingPopupEl = document.getElementById('leasingPopup');

      if (leasingPopupEl && !wasShownLeasing && !wasDismissedLeasing) {
        document.addEventListener('leasingClosed', function() {
          setTimeout(openChat, 1500);
        });
      } else {
        setTimeout(openChat, 4000);
      }

      function appendMessage(text, isBot, cards) {
        var msg = document.createElement("div");
        msg.className = "chat-message " + (isBot ? "bot-message" : "user-message");
        
        var content = document.createElement("div");
        content.className = "message-content";
        content.innerText = text;
        msg.appendChild(content);
        
        if (cards && cards.length > 0) {
          cards.forEach(function(c) {
            var cardEl = document.createElement("div");
            cardEl.className = "chat-card-suggestion";
            cardEl.innerHTML = '<div class="chat-card-body">' +
              '<h5 class="chat-card-title">' + c.name + '</h5>' +
              '<p class="chat-card-price">' + c.price + '</p>' +
              '</div>' +
              '<a href="#" class="chat-card-btn" data-target-id="' + c.id + '">📍 Ver unidad en pantalla</a>';
            
            cardEl.querySelector("a").addEventListener("click", function(e) {
              e.preventDefault();
              var targetId = this.getAttribute("data-target-id");
              
              var cardsElements = document.querySelectorAll(".card, tr");
              var targetEl = null;
              
              if (targetId) {
                cardsElements.forEach(function(el) {
                  if (el.getAttribute("id") === targetId) {
                    targetEl = el;
                  }
                  var waBtn = el.querySelector(".btn-wa, .btn-wa-table");
                  if (waBtn && waBtn.getAttribute("href") && waBtn.getAttribute("href").includes(targetId)) {
                    targetEl = el;
                  }
                });
              }
              
              if (!targetEl) {
                cardsElements.forEach(function(el) {
                  var headerText = el.innerText || '';
                  if (headerText.toUpperCase().includes(c.name.toUpperCase())) {
                    targetEl = el;
                  }
                });
              }

              if (targetEl) {
                var parentDetails = targetEl.closest("details");
                if (parentDetails) {
                  parentDetails.open = true;
                }
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                var originalBorder = targetEl.style.borderColor;
                targetEl.style.boxShadow = "0 0 25px " + (targetEl.style.borderTopColor || "var(--acento)");
                setTimeout(function() {
                  targetEl.style.boxShadow = "";
                }, 3000);
                windowEl.classList.remove("active");
              } else {
                alert("Para ver este vehículo demo te llevaremos a la sección correspondiente.");
                window.location.href = "../paginas_promo/promo-demos.html";
              }
            });
            msg.appendChild(cardEl);
          });
        }
        
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
      }
      
      function loadOptions(options) {
        optionsContainer.innerHTML = "";
        options.forEach(function(opt) {
          var btn = document.createElement("button");
          btn.className = "option-btn";
          btn.innerText = opt.label;
          btn.addEventListener("click", function() {
            appendMessage(opt.label, false);
            handleOptionSelect(opt);
          });
          optionsContainer.appendChild(btn);
        });
        
        if (options !== kb.faq.options) {
          var faqBtn = document.createElement("button");
          faqBtn.className = "option-btn";
          faqBtn.style.borderColor = "var(--acento)";
          faqBtn.innerText = "❓ Preguntas Frecuentes";
          faqBtn.addEventListener("click", function() {
            appendMessage("Preguntas Frecuentes", false);
            appendMessage(kb.faq.welcome, true);
            loadOptions(kb.faq.options);
          });
          optionsContainer.appendChild(faqBtn);
        } else {
          var backBtn = document.createElement("button");
          backBtn.className = "option-btn";
          backBtn.innerText = "⬅️ Volver al inicio";
          backBtn.addEventListener("click", function() {
            appendMessage("Volver al inicio", false);
            initChat();
          });
          optionsContainer.appendChild(backBtn);
        }
      }

      function handleOptionSelect(opt) {
        appendMessage("De acuerdo. Buscando opciones...", true);
        
        setTimeout(function() {
          var msgs = body.querySelectorAll(".bot-message");
          for (var idx = msgs.length - 1; idx >= 0; idx--) {
            if (msgs[idx].innerText.includes("Buscando opciones")) {
              msgs[idx].remove();
              break;
            }
          }
          
          if (opt.filter) {
            var targetPill = document.querySelector('.filter-pill[data-filter="' + opt.filter + '"]');
            if (targetPill) {
              targetPill.click();
            }
            var suggestions = [];
            var cards = document.querySelectorAll(".grid-promos .card, .related-demo-card");
            
            cards.forEach(function(card) {
              if (card.getAttribute("data-category") === opt.filter) {
                var nameEl = card.querySelector(".model-name");
                var priceEl = card.querySelector(".model-price");
                var name = nameEl ? nameEl.innerText : "";
                var price = priceEl ? priceEl.innerText : "";
                var id = card.getAttribute("id") || "";
                
                if (name && !suggestions.some(s => s.name === name)) {
                  suggestions.push({ id: id, name: name, price: price });
                }
              }
            });
            
            var tableRows = document.querySelectorAll(".demo-excel-table tbody tr");
            tableRows.forEach(function(row) {
              if (row.getAttribute("data-category") === opt.filter) {
                var tds = row.getElementsByTagName("td");
                if (tds.length >= 6) {
                  var nameVal = tds[1].innerText + " (Demo)";
                  var priceVal = tds[5].innerText;
                  var idVal = row.getAttribute("id") || "";
                  
                  if (!suggestions.some(s => s.name === nameVal)) {
                    suggestions.push({ id: idVal, name: nameVal, price: priceVal });
                  }
                }
              }
            });

            var limitedSuggestions = suggestions.slice(0, 3);
            
            if (limitedSuggestions.length > 0) {
              appendMessage(opt.reply, true, limitedSuggestions);
            } else {
              appendMessage("Actualmente no tenemos unidades publicadas en esta categoría para esta marca, pero te podemos cotizar sobre pedido. ¡Escríbenos por WhatsApp!", true);
            }
          } else if (opt.reply) {
            appendMessage(opt.reply, true);
            
            var optLabel = opt.label.toLowerCase();
            var waText = "Hola Luis Fernando Martínez, solicito información.";
            
            if (optLabel.includes("crédito") || optLabel.includes("credito")) {
              waText = "quiero informacion de credito";
            } else if (optLabel.includes("arrendamiento") || optLabel.includes("leasing")) {
              waText = "quiero informacion de arrendamiento";
            } else if (optLabel.includes("ubic") || optLabel.includes("dónde") || optLabel.includes("donde")) {
              waText = "quiero agendar una cita";
            } else if (optLabel.includes("manejo") || optLabel.includes("prueba")) {
              waText = "quiero agendar una prueba de manejo";
            }
            
            optionsContainer.innerHTML = "";
            
            var waBtn = document.createElement("button");
            waBtn.className = "option-btn";
            waBtn.style.background = "#25d366";
            waBtn.style.color = "#fff";
            waBtn.innerText = "💬 Hablar con Luis Fernando";
            waBtn.addEventListener("click", function() {
              window.open("https://wa.me/525521787900?text=" + encodeURIComponent(waText), "_blank");
            });
            optionsContainer.appendChild(waBtn);
          }
          
          var menuBtn = document.createElement("button");
          menuBtn.className = "option-btn";
          menuBtn.innerText = "⬅️ Menú Principal";
          menuBtn.addEventListener("click", function() {
            appendMessage("Menú Principal", false);
            initChat();
          });
          optionsContainer.appendChild(menuBtn);
        }, 800);
      }
      
      function handleTextQuery() {
        var query = input.value.trim().toLowerCase();
        if (!query) return;
        
        appendMessage(input.value, false);
        input.value = "";
        
        appendMessage("Pensando...", true);
        
        setTimeout(function() {
          var msgs = body.querySelectorAll(".bot-message");
          for (var idx = msgs.length - 1; idx >= 0; idx--) {
            if (msgs[idx].innerText.includes("Pensando")) {
              msgs[idx].remove();
              break;
            }
          }
          
          // Filtrar por palabras financieras, buró de crédito o entregas
          var replyMsg = "";
          var queryWaText = "Hola Luis Fernando Martínez, solicito información y asistencia.";
          
          if (query.includes("crédito") || query.includes("credito") || query.includes("buró") || query.includes("buro")) {
            replyMsg = "Entendido. Para darte una respuesta precisa sobre tu crédito o buró de crédito, te pondré en contacto directo con nuestro asesor experto en la materia, Luis Fernando Martínez, por WhatsApp. Él analizará tu caso personalmente para darte la mejor opción. Por favor, haz clic en el botón de abajo para iniciar tu atención personalizada.";
            queryWaText = "quiero informacion de credito";
          } else if (query.includes("arrendamiento") || query.includes("leasing")) {
            replyMsg = "Entendido. Para darte una cotización exacta de arrendamiento y explicarte los beneficios fiscales, te pondré en contacto directo con nuestro asesor experto, Luis Fernando Martínez, a través de WhatsApp. Por favor, haz clic en el botón de abajo para iniciar tu atención personalizada.";
            queryWaText = "quiero informacion de arrendamiento";
          } else if (query.includes("contado") || query.includes("precio")) {
            replyMsg = "Entendido. Para ofrecerte el mejor precio de contado y descuentos vigentes, te pondré en contacto directo con tu asesor experto en la materia, Luis Fernando Martínez, a través de WhatsApp. Por favor, haz clic en el botón de abajo para iniciar tu atención personalizada.";
            queryWaText = "quiero informacion de contado";
          } else if (query.includes("entrega") || query.includes("entregar") || query.includes("tiempo")) {
            replyMsg = "Entendido. Para darte los tiempos exactos de entrega de las unidades en inventario o pedido especial, te pondré en contacto directo con tu asesor experto en la materia, Luis Fernando Martínez, a través de WhatsApp. Por favor, haz clic en el botón de abajo para iniciar tu atención personalizada.";
            queryWaText = "quiero informacion de entrega";
          } else if (query.includes("cotiz") || query.includes("informe") || query.includes("información") || query.includes("informacion") || query.includes("info")) {
            replyMsg = "Entendido. Para darte una cotización exacta o brindarte informes detallados sobre cualquier unidad, te pondré en contacto directo con tu asesor experto en la materia, Luis Fernando Martínez, a través de WhatsApp. Por favor, haz clic en el botón de abajo para iniciar tu atención personalizada.";
            queryWaText = "quiero cotizacion e informes";
          } else if (query.includes("ubicaci") || query.includes("donde est") || query.includes("dónde est") || query.includes("direcci") || query.includes("cita") || query.includes("agendar")) {
            replyMsg = "Entendido. Para darte nuestra ubicación exacta, coordinar tu visita a nuestra sala de ventas o agendar una cita con nuestro asesor experto Luis Fernando Martínez, te pondré en contacto directo por WhatsApp. Por favor, haz clic en el botón de abajo para que te enviemos la información.";
            queryWaText = "quiero agendar una cita";
          }
          
          if (replyMsg) {
            appendMessage(replyMsg, true);
            optionsContainer.innerHTML = "";
            
            var waBtn = document.createElement("button");
            waBtn.className = "option-btn";
            waBtn.style.background = "#25d366";
            waBtn.style.color = "#fff";
            waBtn.innerText = "💬 Hablar con Luis Fernando";
            waBtn.addEventListener("click", function() {
              window.open("https://wa.me/525521787900?text=" + encodeURIComponent(queryWaText), "_blank");
            });
            optionsContainer.appendChild(waBtn);
            
            var backBtn = document.createElement("button");
            backBtn.className = "option-btn";
            backBtn.innerText = "⬅️ Menú Principal";
            backBtn.addEventListener("click", function() {
              initChat();
            });
            optionsContainer.appendChild(backBtn);
            return;
          }
          
          var matchedFaq = null;
          kb.faq.options.forEach(function(opt) {
            var labelLower = opt.label.toLowerCase();
            var replyLower = opt.reply.toLowerCase();
            
            if (labelLower.includes(query) || query.includes(labelLower.replace(/[^a-z0-9 ]/g, "").trim()) || replyLower.includes(query)) {
              matchedFaq = opt;
            }
          });
          
          if (matchedFaq) {
            appendMessage(matchedFaq.reply, true);
          } else {
            appendMessage("Entendido. Para aclarar tus dudas de manera detallada y ofrecerte la mejor alternativa, te pondré en contacto directo con tu asesor experto en la materia, Luis Fernando Martínez, a través de WhatsApp. Por favor, haz clic en el botón de abajo para iniciar tu atención personalizada.", true);
            optionsContainer.innerHTML = "";
            
            var waBtn = document.createElement("button");
            waBtn.className = "option-btn";
            waBtn.style.background = "#25d366";
            waBtn.style.color = "#fff";
            waBtn.innerText = "💬 Hablar con Luis Fernando";
            waBtn.addEventListener("click", function() {
              window.open("https://wa.me/525521787900?text=Hola%20Luis%20Fernando%20Mart%C3%ADnez,%20necesito%20aclarar%20unas%20dudas%20detalladas.", "_blank");
            });
            optionsContainer.appendChild(waBtn);
            
            var backBtn = document.createElement("button");
            backBtn.className = "option-btn";
            backBtn.innerText = "⬅️ Menú Principal";
            backBtn.addEventListener("click", function() {
              initChat();
            });
            optionsContainer.appendChild(backBtn);
          }
        }, 600);
      }
      
      sendBtn.addEventListener("click", handleTextQuery);
      input.addEventListener("keypress", function(e) {
        if (e.key === "Enter") {
          handleTextQuery();
        }
      });
      
      function initChat() {
        body.innerHTML = "";
        appendMessage(config.welcome, true);
        loadOptions(config.options);
      }
      
      initChat();
    });

    // Slider Carousel Script for Multi-Photos
    var carouselStates = {};

    window.initCarousels = function() {
      document.querySelectorAll('.carousel').forEach(function(el) {
        var id = el.id.replace('carousel-', '');
        var track = el.querySelector('.carousel-track');
        var slides = el.querySelectorAll('.carousel-slide');
        var indicators = el.querySelectorAll('.indicator');
        
        carouselStates[id] = {
          currentIdx: 0,
          totalSlides: slides.length,
          track: track,
          indicators: indicators
        };
        
        // Touch/Swipe support
        var startX = 0;
        var isDragging = false;
        
        el.addEventListener('touchstart', function(e) {
          startX = e.touches[0].clientX;
          isDragging = true;
        }, { passive: true });
        
        el.addEventListener('touchend', function(e) {
          if (!isDragging) return;
          var endX = e.changedTouches[0].clientX;
          var diff = startX - endX;
          if (Math.abs(diff) > 50) {
            if (diff > 0) {
              moveCarousel(id, 1);
            } else {
              moveCarousel(id, -1);
            }
          }
          isDragging = false;
        }, { passive: true });
        
        // Mouse drag/swipe support
        el.addEventListener('mousedown', function(e) {
          startX = e.clientX;
          isDragging = true;
        });
        
        el.addEventListener('mouseup', function(e) {
          if (!isDragging) return;
          var endX = e.clientX;
          var diff = startX - endX;
          if (Math.abs(diff) > 50) {
            if (diff > 0) {
              moveCarousel(id, 1);
            } else {
              moveCarousel(id, -1);
            }
          }
          isDragging = false;
        });
      });
    };

    window.moveCarousel = function(id, dir, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      var state = carouselStates[id];
      if (!state) return;
      
      var nextIdx = state.currentIdx + dir;
      if (nextIdx < 0) {
        nextIdx = state.totalSlides - 1;
      } else if (nextIdx >= state.totalSlides) {
        nextIdx = 0;
      }
      
      setCarouselSlide(id, nextIdx);
    };

    window.setCarouselSlide = function(id, idx, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      var state = carouselStates[id];
      if (!state) return;
      
      state.currentIdx = idx;
      state.track.style.transform = 'translateX(-' + (idx * 100) + '%)';
      
      state.indicators.forEach(function(ind, i) {
        if (i === idx) {
          ind.classList.add('active');
        } else {
          ind.classList.remove('active');
        }
      });
    };

    // Auto-focus and highlight car when arriving with #auto-[id]
    function checkHashAndFocus() {
      if (!window.location.hash) return;
      var hash = window.location.hash.replace('#', '');
      var targetCard = document.getElementById(hash) || document.getElementById('auto-' + hash);
      if (!targetCard) {
        var allCards = document.querySelectorAll('.card');
        for (var i = 0; i < allCards.length; i++) {
          if (allCards[i].id === hash || allCards[i].id === 'auto-' + hash || (allCards[i].getAttribute('data-id') === hash)) {
            targetCard = allCards[i];
            break;
          }
        }
      }
      if (targetCard) {
        setTimeout(function() {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var details = targetCard.querySelector('.card-details-accordion');
          if (details) details.open = true;
          var acColor = targetCard.style.borderTopColor || 'var(--acento)';
          targetCard.style.transition = 'all 0.4s ease';
          targetCard.style.boxShadow = '0 0 35px ' + acColor + ', 0 10px 30px rgba(0,0,0,0.3)';
          targetCard.style.transform = 'scale(1.025)';
          setTimeout(function() {
            targetCard.style.boxShadow = '';
            targetCard.style.transform = '';
          }, 3500);
        }, 350);
      }
    }
    window.addEventListener('DOMContentLoaded', checkHashAndFocus);
    window.addEventListener('hashchange', checkHashAndFocus);

    // Initialize carousels
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCarousels);
    } else {
      initCarousels();
    }
  </script>
 </body>
</html>`;

  const fileName = `promo-${brand}.html`;
  fs.writeFileSync(path.join(promoDir, fileName), fullHtml, 'utf8');
}

// Generate index.html dynamically from template
function generateIndexHtml(dbData) {
  const templatePath = path.join(__dirname, '..', 'index_template.html');
  const outputPath = path.join(__dirname, '..', 'index.html');
  
  if (!fs.existsSync(templatePath)) {
    console.error('index_template.html not found!');
    return;
  }
  
  let html = fs.readFileSync(templatePath, 'utf8');
  const landing = dbData.landing || {};
  
  // Featured Car Spotlight section
  let featuredCarHtml = '';
  const featured = landing.featuredCar || {};
  if (featured.enabled && featured.vehicleKey && featured.vehicleKey.includes('::')) {
    const [fBrand, fId] = featured.vehicleKey.split('::');
    const fList = dbData[fBrand] || [];
    const fVehicle = fList.find(x => x.id === fId);

    if (fVehicle) {
      const fImg = optimizeCloudinaryUrl(fVehicle.image || '');
      const fAccent = fVehicle.accentColor || (fBrand === 'demos' ? '#00e5ff' : '#CC4400');
      const fBadge = (featured.customBadge && featured.customBadge.trim()) ? featured.customBadge.trim() : (fBrand === 'demos' ? '🔥 OPORTUNIDAD DESTACADA DEL MES' : '⭐ PROMOCIÓN EXCLUSIVA 0 KM');
      const fTagline = (featured.customTagline && featured.customTagline.trim()) ? featured.customTagline.trim() : '¡Aprovecha nuestro precio especial de liquidación con entrega inmediata!';
      const fBtnText = (featured.customButtonText && featured.customButtonText.trim()) ? featured.customButtonText.trim() : 'Ver Promoción y Detalles';
      const fTargetUrl = `paginas_promo/promo-${fBrand}.html#auto-${fVehicle.id}`;
      
      // Key features snippet (up to 3 bullets)
      let fBenefitsSnippet = '';
      const validFBenefits = (fVehicle.benefits || []).filter(b => b && b.trim()).slice(0, 3);
      if (validFBenefits.length > 0) {
        const items = validFBenefits.map(b => `<li class="d-flex align-items-start gap-2 mb-2 text-white-50"><i class="fa-solid fa-circle-check" style="color: ${fAccent}; font-size: 0.88rem; margin-top: 3px; flex-shrink: 0;"></i> <span class="text-white" style="font-size: clamp(0.82rem, 2.8vw, 0.92rem); line-height: 1.35; word-break: break-word;">${b}</span></li>`).join('');
        fBenefitsSnippet = `<ul class="list-unstyled mb-4 p-3 rounded-3 text-start" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">${items}</ul>`;
      }

      featuredCarHtml = `
    <!-- Sección: Auto Destacado (Oferta Estrella) -->
    <section id="auto-destacado" class="py-5 position-relative overflow-hidden" style="background: linear-gradient(135deg, #07101e 0%, #0d1a30 100%); border-top: 2px solid ${fAccent}; border-bottom: 2px solid ${fAccent};">
        <div style="position: absolute; top: -40%; right: -15%; width: 500px; height: 500px; background: radial-gradient(circle, ${fAccent}25 0%, transparent 70%); filter: blur(60px); pointer-events: none;"></div>
        <div class="container py-3 position-relative" style="z-index: 2;">
            <div class="row align-items-center justify-content-center g-4">
                <div class="col-lg-6 text-center">
                    <div class="position-relative d-inline-block w-100" style="max-width: 520px;">
                        <a href="${fTargetUrl}" class="d-block overflow-hidden rounded-4 shadow-lg text-decoration-none" style="border: 2px solid rgba(255,255,255,0.15);">
                            <img src="${fImg}" alt="${fVehicle.name}" class="img-fluid rounded-4 w-100" style="object-fit: cover; max-height: 400px; transition: transform 0.4s ease;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                        </a>
                        <span class="position-absolute top-0 start-0 m-3 badge rounded-pill px-3 py-2 text-uppercase fw-bold shadow" style="background: #000; color: #fff; font-size: 0.78rem; letter-spacing: 0.5px; border: 1px solid rgba(255,255,255,0.2);">
                            ${fBrand === 'demos' ? '⚡ AUTO DEMO LIQUIDACIÓN' : '⭐ ' + fBrand.toUpperCase() + ' 0 KM'}
                        </span>
                    </div>
                </div>

                <div class="col-lg-6 text-white text-center text-lg-start ps-lg-4">
                    <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill mb-3 shadow-sm" style="background: rgba(0, 229, 255, 0.1); border: 1px solid ${fAccent}; color: ${fAccent}; font-size: clamp(0.75rem, 2.8vw, 0.85rem); font-weight: 700; letter-spacing: 0.5px; max-width: 100%; white-space: normal; text-align: center;">
                        ${fBadge}
                    </div>

                    <h2 class="display-5 fw-bold mb-2 text-white text-uppercase" style="font-family: 'Montserrat', sans-serif; font-size: clamp(1.5rem, 4.5vw, 2.5rem); line-height: 1.2; word-break: break-word;">
                        ${fVehicle.name}
                    </h2>

                    <p class="lead mb-3 text-white-50" style="font-size: clamp(0.88rem, 3vw, 1rem); line-height: 1.45; word-break: break-word;">
                        ${fTagline}
                    </p>

                    <div class="d-flex align-items-center flex-wrap justify-content-center justify-content-lg-start gap-2 gap-sm-3 mb-3">
                        ${fVehicle.listPrice ? `
                            <span class="text-white-50 text-decoration-line-through fw-bold" style="font-size: clamp(1rem, 3.5vw, 1.2rem); white-space: nowrap;">
                                ${fVehicle.listPrice}
                            </span>
                        ` : ''}
                        <span class="display-6 fw-bold" style="color: ${fAccent}; font-size: clamp(1.7rem, 6vw, 2.4rem); text-shadow: 0 0 20px ${fAccent}66; white-space: nowrap; line-height: 1;">
                            ${fVehicle.price}
                        </span>
                        <span class="badge bg-success rounded-pill px-2 py-1" style="font-size: 0.75rem; white-space: nowrap;">¡OFERTA EXCLUSIVA!</span>
                    </div>

                    ${fBenefitsSnippet}

                    <div class="d-flex flex-column flex-sm-row gap-3 justify-content-center justify-content-lg-start mt-3">
                        <a href="${fTargetUrl}" class="btn btn-glow btn-lg px-4 py-3 rounded-pill fw-bold text-uppercase text-decoration-none shadow" style="background-color: ${fAccent}; color: #07101e; border: none; font-size: 0.95rem;" onclick="if(typeof gtag==='function') { gtag('event', 'click_featured_car', { 'car_name': '${fVehicle.name}', 'brand_name': '${fBrand}' }); }">
                            <i class="fa-solid fa-car me-2"></i> ${fBtnText} <i class="fa-solid fa-arrow-right ms-2"></i>
                        </a>
                        <a href="${fVehicle.whatsapp}" target="_blank" rel="noopener" class="btn btn-outline-light btn-lg px-4 py-3 rounded-pill fw-bold text-uppercase text-decoration-none" style="font-size: 0.95rem; border-color: rgba(255,255,255,0.3);" onclick="if(typeof gtag==='function') { gtag('event', 'click_whatsapp_cotizar', { 'car_name': '${fVehicle.name}', 'brand_name': '${fBrand}' }); }">
                            <i class="fa-brands fa-whatsapp me-2 text-success" style="font-size: 1.2rem;"></i> Cotizar por WhatsApp
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </section>
      `;
    }
  }
  html = html.replace(/\{\{FEATURED_CAR_SECTION\}\}/g, featuredCarHtml);

  // Carousel background images (desktop & mobile)
  const carousel = landing.carousel || [];
  const carouselMobile = landing.carouselMobile || [];
  for (let i = 0; i < 4; i++) {
    const val = optimizeCloudinaryUrl(carousel[i] || `imagenes/carrusel_${i + 1}.jpg`);
    const valMobile = optimizeCloudinaryUrl(carouselMobile[i] || val); // Fallback to desktop if mobile is empty
    html = html.replace(new RegExp(`\\{\\{CAROUSEL_${i + 1}\\}\\}`, 'g'), val);
    html = html.replace(new RegExp(`\\{\\{CAROUSEL_${i + 1}_MOBILE\\}\\}`, 'g'), valMobile);
  }
  
  // Newsletter registration popup
  const popupImg = optimizeCloudinaryUrl(landing.newsletterPopupImage || '');
  html = html.replace(/\{\{NEWSLETTER_POPUP_IMAGE\}\}/g, popupImg);

  // Dynamic Backgrounds (Cloudinary or local fallback)
  const bodyBg = optimizeCloudinaryUrl(landing.bodyBg || 'imagenes/fondo_escritorio.png');
  const bodyBgMobile = optimizeCloudinaryUrl(landing.bodyBgMobile || 'imagenes/fondo_movil.png');
  html = html.replace(/\{\{BODY_BG\}\}/g, bodyBg);
  html = html.replace(/\{\{BODY_BG_MOBILE\}\}/g, bodyBgMobile);
  
  // Featured promos
  const promos = landing.promos || [];
  for (let i = 0; i < 4; i++) {
    const p = promos[i] || {};
    const img = optimizeCloudinaryUrl(p.image || '');
    const name = p.name || '';
    const desc = p.description || '';
    const wa = p.whatsapp || '';
    
    const target = (wa.startsWith('http') || wa.startsWith('https') || wa.startsWith('//') || wa.startsWith('wa.me')) ? 'target="_blank"' : '';
    html = html.replace(new RegExp(`\\{\\{OFFER_${i + 1}_IMAGE\\}\\}`, 'g'), img);
    html = html.replace(new RegExp(`\\{\\{OFFER_${i + 1}_NAME\\}\\}`, 'g'), name);
    html = html.replace(new RegExp(`\\{\\{OFFER_${i + 1}_DESC\\}\\}`, 'g'), desc);
    html = html.replace(new RegExp(`\\{\\{OFFER_${i + 1}_WA\\}\\}`, 'g'), wa);
    html = html.replace(new RegExp(`\\{\\{OFFER_${i + 1}_TARGET\\}\\}`, 'g'), target);
  }
  
  // Brand modules images
  const brandsImages = landing.brandsImages || {};
  const brandKeys = ['ram', 'dodge', 'jeep', 'fiat', 'peugeot', 'leapmotor', 'demos'];
  brandKeys.forEach(bk => {
    const val = brandsImages[bk] || `imagenes/marca_${bk}.jpg`;
    html = html.replace(new RegExp(`\\{\\{BRAND_IMAGE_${bk.toUpperCase()}\\}\\}`, 'g'), val);
  });
  
  // Reemplazar reglas de Chatbot y avatar en Landing Page
  const rulesPath = path.join(__dirname, 'chatbot_rules.json');
  let chatbotRules = {};
  if (fs.existsSync(rulesPath)) {
    try {
      chatbotRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    } catch (e) {
      console.error('Error loading chatbot rules:', e);
    }
  }
  
  const portal = dbData.portal || {};
  const avatar = optimizeCloudinaryUrl(portal.avatar || 'https://res.cloudinary.com/dbxa0pozm/image/upload/v1775709817/Luis_tarjeta_gd45h6.jpg');

  html = html.replace(/\{\{CHATBOT_RULES\}\}/g, JSON.stringify(chatbotRules));
  html = html.replace(/\{\{CHATBOT_AVATAR\}\}/g, avatar);
  
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log('index.html successfully generated.');
}

// Portal Config Endpoint
app.post('/api/portal-config', (req, res) => {
  const dbData = readData();
  dbData.portal = req.body;
  writeData(dbData);

  // Generate portal HTML
  generatePortalHtml(dbData);

  // Git Push automatically for the welcome portal repo
  const PORTAL_DIR = 'C:/Users/luism/Documents/portal_bienvenida';
  if (fs.existsSync(PORTAL_DIR)) {
    exec('git add .', { cwd: PORTAL_DIR }, (err, stdout, stderr) => {
      if (err) {
        console.error('Error running git add in portal:', stderr);
        return res.json({ success: true, warning: 'Guardado localmente, pero falló git add para el portal.' });
      }
      const commitMsg = `Portal Update - ${new Date().toISOString()}`;
      exec(`git commit -m "${commitMsg}"`, { cwd: PORTAL_DIR }, (err, stdout, stderr) => {
        exec('git push', { cwd: PORTAL_DIR }, (err, stdout, stderr) => {
          if (err) {
            console.error('Error running git push in portal:', stderr);
            return res.json({ success: true, warning: 'Guardado localmente, pero falló git push para el portal.' });
          }
          res.json({ success: true, message: 'Portal actualizado y publicado en GitHub Pages con éxito!' });
        });
      });
    });
  } else {
    res.json({ success: true, warning: 'Guardado localmente, pero la carpeta del portal bienvenida no fue encontrada.' });
  }
});

// Generate HTML for the welcome portal (Link Hub)
function generatePortalHtml(data) {
  const portal = data.portal || {};
  const name = portal.name || 'Luis';
  const role = portal.role || 'Tu Asesor Automotriz de Confianza';
  const avatar = optimizeCloudinaryUrl(portal.avatar || 'https://res.cloudinary.com/dbxa0pozm/image/upload/v1775709817/Luis_tarjeta_gd45h6.jpg');
  
  const headerType = portal.headerType || 'text';
  const brandTitle = portal.brandTitle || 'Aurum Autos';
  const brandSubtitle = portal.brandSubtitle || 'Car Portfolio';
  const logoUrl = optimizeCloudinaryUrl(portal.logoUrl || '');
  
  const bgType = portal.bgType || 'gradient';
  const bgImageUrl = optimizeCloudinaryUrl(portal.bgImageUrl || '');
  
  const buttons = portal.buttons || [];

  // Background style
  let bodyBgStyle = 'background: var(--bg-gradient);';
  if (bgType === 'image' && bgImageUrl) {
    bodyBgStyle = `background: url('${bgImageUrl}') no-repeat center center fixed; background-size: cover;`;
  }

  // Header content
  let headerHtml = `<h1 class="brand-title">${brandTitle}</h1><p class="brand-subtitle">${brandSubtitle}</p>`;
  if (headerType === 'logo' && logoUrl) {
    headerHtml = `<img src="${logoUrl}" alt="${brandTitle}" style="max-height: 80px; margin-bottom: 25px; object-fit: contain; max-width: 100%;">`;
  }

  // Generate buttons dynamic styling and HTML
  let buttonsHtml = '';
  let buttonsCss = '';
  buttons.forEach((btn, idx) => {
    const text = btn.text || '';
    const url = btn.url || '#';
    const color = btn.color || '#ffffff';
    const icon = btn.icon || 'fa-solid fa-arrow-right-long';
    
    buttonsHtml += `
      <a href="${url}" class="portal-btn btn-custom-${idx}">
        <span>${text}</span>
        <i class="${icon}"></i>
      </a>
    `;

    buttonsCss += `
    .btn-custom-${idx} {
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.03);
    }
    .btn-custom-${idx}:hover {
      border-color: ${color};
      box-shadow: 0 0 25px ${color}40;
      background: ${color}10;
      transform: translateY(-3px);
    }
    .btn-custom-${idx}:hover i {
      transform: translateX(5px);
      color: ${color};
    }
    `;
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandTitle} | ${brandSubtitle}</title>
  
  <!-- FontAwesome Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700&display=swap" rel="stylesheet">

  <style>
    /* VARIABLES */
    :root {
      --bg-gradient: radial-gradient(circle at center, #0e1726 0%, #05080f 100%);
      --silver-primary: #e0e0e0;
      --silver-glow: rgba(255, 255, 255, 0.8);
      --glass-bg: rgba(255, 255, 255, 0.03);
      --glass-border: rgba(255, 255, 255, 0.08);
      --glass-border-hover: rgba(255, 255, 255, 0.25);
    }

    /* GLOBAL STYLES */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Montserrat', sans-serif;
      ${bodyBgStyle}
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-x: hidden;
      position: relative;
    }

    /* LUXURY GEOMETRIC BACKGROUND ACCENTS */
    body::before, body::after {
      content: '';
      position: absolute;
      width: 1px;
      height: 100%;
      background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.05), transparent);
      z-index: 1;
      pointer-events: none;
    }
    body::before { left: 20%; transform: rotate(15deg); }
    body::after { right: 20%; transform: rotate(-15deg); }

    /* CONTAINER */
    .portal-container {
      width: 100%;
      max-width: 440px;
      text-align: center;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 30px 20px;
    }

    /* LOGO AND BRANDING */
    .brand-title {
      font-size: 1.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 4px;
      background: linear-gradient(135deg, #ffffff 30%, #a6afb8 70%, #ffffff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 5px;
      text-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
    }

    .brand-subtitle {
      font-size: 0.75rem;
      font-weight: 300;
      text-transform: uppercase;
      letter-spacing: 6px;
      color: #8fa0b5;
      margin-bottom: 35px;
    }

    /* AVATAR FRAME */
    .avatar-wrapper {
      position: relative;
      width: 170px;
      height: 170px;
      margin-bottom: 25px;
    }

    .avatar-ring {
      position: absolute;
      top: -5px;
      left: -5px;
      width: 180px;
      height: 180px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: transparent;
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.05);
      animation: pulseGlow 4s infinite ease-in-out;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255, 255, 255, 0.8);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 25px rgba(255, 255, 255, 0.1);
    }

    /* PRESENTATION TEXT */
    .advisor-name {
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: 2px;
      color: #ffffff;
      margin-bottom: 8px;
    }

    .advisor-role {
      font-size: 0.85rem;
      font-weight: 400;
      letter-spacing: 3px;
      color: #a0aec0;
      text-transform: uppercase;
      margin-bottom: 45px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 15px;
      width: 80%;
    }

    /* LINKTREE BUTTON STACK */
    .links-stack {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-bottom: 40px;
    }

    .portal-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 18px 25px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      color: #ffffff;
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    .portal-btn i {
      font-size: 1.1rem;
      transition: transform 0.3s ease;
    }

    /* Dynamic buttons glow styling */
    ${buttonsCss}

    /* FOOTER */
    .portal-footer {
      margin-top: auto;
      font-size: 0.7rem;
      color: #4a5568;
      letter-spacing: 2px;
      text-transform: uppercase;
      z-index: 10;
    }

    /* KEYFRAMES */
    @keyframes pulseGlow {
      0%, 100% {
        transform: scale(1);
        opacity: 0.5;
        border-color: rgba(255, 255, 255, 0.15);
      }
      50% {
        transform: scale(1.05);
        opacity: 0.9;
        border-color: rgba(255, 255, 255, 0.4);
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.15);
      }
    }

    /* RESPONSIVE DESIGN (Desktop version optimization) */
    @media (min-width: 768px) {
      .portal-container {
        max-width: 520px;
        background: rgba(255, 255, 255, 0.01);
        border: 1px solid rgba(255, 255, 255, 0.02);
        border-radius: 24px;
        padding: 50px 40px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(5px);
      }
      
      .brand-title {
        font-size: 2.2rem;
      }
      
      .advisor-name {
        font-size: 1.8rem;
      }
    }
  </style>
</head>
<body>

  <div class="portal-container">
    <!-- BRANDING -->
    ${headerHtml}

    <!-- AVATAR -->
    <div class="avatar-wrapper">
      <div class="avatar-ring"></div>
      <img src="${avatar}" alt="${name}" class="avatar-img">
    </div>

    <!-- PRESENTATION -->
    <h2 class="advisor-name">${name}</h2>
    <p class="advisor-role">${role}</p>

    <!-- BUTTONS STACK -->
    <div class="links-stack">
      ${buttonsHtml}
    </div>

    <!-- FOOTER -->
    <p class="portal-footer">&copy; ${new Date().getFullYear()} ${brandTitle}. Todos los derechos reservados.</p>
  </div>

</body>
</html>`;

  const PORTAL_DIR = 'C:/Users/luism/Documents/portal_bienvenida';
  if (fs.existsSync(PORTAL_DIR)) {
    fs.writeFileSync(path.join(PORTAL_DIR, 'index.html'), fullHtml, 'utf8');
    console.log('[+] Portal index.html successfully generated.');
  }
}

// Generate all initial HTMLs on startup if database has info
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const data = readData();
    generateIndexHtml(data);
    generatePortalHtml(data);
    Object.keys(data).forEach(brand => {
      if (brand !== 'landing' && brand !== 'portal') {
        generateHtmlForBrand(brand, data[brand]);
      }
    });
  });
}

module.exports = { generateIndexHtml, generateHtmlForBrand, generatePortalHtml, readData, writeData };
