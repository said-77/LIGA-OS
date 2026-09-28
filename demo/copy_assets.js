const fs = require('fs');
const path = require('path');

const srcDir = 'F:\\AG_WORK\\AG_WORK\\data\\playwright';
const dstDir = path.join(__dirname, 'assets');

if (!fs.existsSync(dstDir)) {
  fs.mkdirSync(dstDir, { recursive: true });
}

const map = {
  'page-2026-09-28T12-33-46-480Z.png': '01_dashboard.png',
  'page-2026-09-28T12-35-53-872Z.png': '02_finances.png',
  'page-2026-09-28T12-57-02-308Z.png': '03_materials.png',
  'page-2026-09-28T12-57-12-969Z.png': '04_checklist.png',
  'page-2026-09-28T12-57-27-255Z.png': '05_estimate.png',
  'page-2026-09-28T12-57-38-274Z.png': '06_history.png',
  'page-2026-09-28T13-26-29-708Z.png': '07_settings.png',
  'page-2026-09-28T13-28-36-398Z.png': '08_seal_preview.png',
  'page-2026-09-28T13-29-35-353Z.png': '09_signature_pad.png',
  'page-2026-09-28T13-34-37-695Z.png': '10_pressure_act.png',
  'page-2026-09-28T13-34-58-710Z.png': '11_more_menu.png'
};

for (const [src, dst] of Object.entries(map)) {
  const fullSrc = path.join(srcDir, src);
  const fullDst = path.join(dstDir, dst);
  if (fs.existsSync(fullSrc)) {
    fs.copyFileSync(fullSrc, fullDst);
    console.log(`✓ Copied ${src} -> ${dst}`);
  } else {
    console.error(`✗ Not found: ${fullSrc}`);
  }
}

console.log('Finished copying assets.');
