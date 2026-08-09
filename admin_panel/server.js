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

// Get all promos
app.get('/api/promos', (req, res) => {
  res.json(readData());
});

// Add a promotion (supports text and image upload)
app.post('/api/promos/:brand', upload.single('image'), (req, res) => {
  const { brand } = req.params;
  const data = readData();

  if (!data[brand]) {
    data[brand] = [];
  }

  // Parse details
  const benefits = req.body.benefits ? JSON.parse(req.body.benefits) : [];
  
  // Base image path
  let imgPath = req.body.existingImage || '';
  if (req.file) {
    // Save relative image path for HTML rendering (relative to root)
    imgPath = `imagenes/${brand}/${req.file.filename}`;
  }

  const newPromo = {
    id: req.body.id || `${brand}-${Date.now()}`,
    name: req.body.name,
    price: req.body.price,
    image: imgPath,
    whatsapp: req.body.whatsapp || `https://wa.me/525521787900?text=Hola,%20me%20interesa%20la%20gama%20${brand}`,
    description: req.body.description || '',
    descriptionSize: req.body.descriptionSize || '1.0rem',
    descriptionColor: req.body.descriptionColor || '#333333',
    benefits: benefits,
    legal: req.body.legal || '* Promoción válida el mes en curso.',
    accentColor: req.body.accentColor || '#CC4400',
    underlineStyle: req.body.underlineStyle || 'solid'
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

  lines.forEach(line => {
    if (!line.trim()) return;
    
    // Parse CSV line (Brand,CarName,Price)
    let parts = [];
    if (line.includes(';')) {
      parts = line.split(';');
    } else {
      parts = line.split(',');
    }

    if (parts.length < 3) return;

    const csvBrand = parts[0].trim().toLowerCase();
    const csvCarName = parts[1].trim();
    const csvPrice = parts[2].trim();

    if (dbData[csvBrand]) {
      // Find the vehicle by name (case-insensitive)
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

// Generate HTML file dynamically for a brand
function generateHtmlForBrand(brand, vehicles) {
  const promoDir = path.join(__dirname, '..', 'paginas_promo');
  if (!fs.existsSync(promoDir)) {
    fs.mkdirSync(promoDir, { recursive: true });
  }

  const brandColors = {
    ram: '#000000',
    dodge: '#CC4400',
    jeep: '#4A7729',
    fiat: '#B30000',
    peugeot: '#001E62',
    leapmotor: '#3B93A9'
  };

  const accentColor = brandColors[brand] || '#CC4400';

  const cardsHtml = vehicles.map(v => {
    // Generate benefits list
    const benefitsListHtml = v.benefits.map(b => `
      <li>
        ${b}
      </li>
    `).join('');

    // Highlight style for description
    const textStyle = `font-size: ${v.descriptionSize || '1rem'}; color: ${v.descriptionColor || '#333333'};`;
    const headingStyle = v.underlineStyle !== 'none' 
      ? `border-bottom: 2px ${v.underlineStyle} ${v.accentColor || accentColor}; padding-bottom: 3px; display: inline-block;` 
      : '';

    // Relative image path adjustment (pages are in paginas_promo, so they need to go up one folder '../imagenes/')
    let imageSrc = v.image;
    if (imageSrc && !imageSrc.startsWith('http') && !imageSrc.startsWith('../')) {
      imageSrc = `../${imageSrc}`;
    }

    return `
    <article class="card" style="border-top-color: ${v.accentColor || accentColor};">
      <div class="img-container">
        <img alt="Promoción ${v.name}" class="card-img" decoding="async" height="450" loading="lazy" src="${imageSrc}" width="600"/>
      </div>
      <div class="card-header">
        <div class="model-info">
          <h2 class="model-name">
            <span style="${headingStyle}">${v.name}</span>
          </h2>
          <div class="model-price" style="color: ${v.accentColor || accentColor};">
            ${v.price}
          </div>
        </div>
        <a aria-label="Cotizar ${v.name} por WhatsApp" class="btn-wa" style="background-color: ${v.accentColor || accentColor};" href="${v.whatsapp}" rel="noopener" target="_blank">
          <svg viewBox="0 0 24 24" style="fill: white; width: 16px; height: 16px; margin-right: 5px;">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path>
          </svg>
          <span>Cotizar</span>
        </a>
      </div>
      <div class="promo-body">
        <div class="promo-main" style="${textStyle}">
          <span>${v.description}</span>
        </div>
        <ul class="benefits-list" style="--acento-list: ${v.accentColor || accentColor};">
          ${benefitsListHtml}
        </ul>
        <p class="legal">
          ${v.legal}
        </p>
      </div>
    </article>
    `;
  }).join('');

  // Generar enlaces de navegación dinámicos (marcando el activo)
  const brands = ['ram', 'dodge', 'jeep', 'fiat', 'peugeot', 'leapmotor'];
  const navLinksHtml = brands.map(b => {
    const activeClass = b === brand ? 'active' : '';
    return `<li><a href="promo-${b}.html" class="nav-item-link ${activeClass}" id="link-${b}">${b.toUpperCase()}</a></li>`;
  }).join('');

  const fullHtml = `<!DOCTYPE html>
<html lang="es">
 <head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700&amp;display=swap" rel="stylesheet"/>
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
      padding-top: 75%;
      position: relative;
      background: #f5f5f5;
    }

    .card-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #f5f5f5;
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

  <div class="grid-promos" style="margin-top: 20px;">
    ${cardsHtml.length > 0 ? cardsHtml : '<div class="no-promos">No hay promociones activas actualmente para esta marca.</div>'}
  </div>
  <div class="embed-footer"></div>

  <!-- Popup de Arrendamiento (Vanilla CSS/JS Ligero) -->
  <div id="leasingPopup" class="leasing-popup-overlay" style="display: none;">
    <div class="leasing-popup-content">
      <button class="leasing-popup-close" id="closeLeasingPopup" aria-label="Cerrar">&times;</button>
      <a href="https://wa.me/525521787900?text=Hola,%20solicito%20información%20sobre%20el%20arrendamiento" target="_blank" id="leasingPopupLink">
        <img src="../imagenes/popup_arrendamiento.jpg" class="leasing-popup-img" alt="Promoción Especial Arrendamiento" onerror="this.onerror=null; this.src='../imagenes/carrusel_1.jpg';">
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
      var wasShown = localStorage.getItem('leasing_popup_shown');
      var wasDismissed = sessionStorage.getItem('leasing_popup_dismissed');

      if (!wasShown && !wasDismissed) {
        setTimeout(function() {
          var popup = document.getElementById('leasingPopup');
          if (popup) {
            popup.style.display = 'flex';
            setTimeout(function() {
              popup.classList.add('show');
            }, 50);

            var closeBtn = document.getElementById('closeLeasingPopup');
            if (closeBtn) {
              closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                closePopup();
              });
            }

            popup.addEventListener('click', function(e) {
              if (e.target === popup) {
                closePopup();
              }
            });

            document.getElementById('leasingPopupLink').addEventListener('click', function() {
              localStorage.setItem('leasing_popup_shown', 'true');
            });
          }
        }, 2000);
      }

      function closePopup() {
        var popup = document.getElementById('leasingPopup');
        if (popup) {
          popup.classList.remove('show');
          setTimeout(function() {
            popup.style.display = 'none';
            sessionStorage.setItem('leasing_popup_dismissed', 'true');
          }, 400);
        }
      }
    });
  </script>
 </body>
</html>`;

  const fileName = `promo-${brand}.html`;
  fs.writeFileSync(path.join(promoDir, fileName), fullHtml, 'utf8');
}

// Generate all initial HTMLs on startup if database has info
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const data = readData();
  Object.keys(data).forEach(brand => {
    generateHtmlForBrand(brand, data[brand]);
  });
});
