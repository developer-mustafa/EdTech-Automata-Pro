const fs = require('fs');
const path = './src/styles/main.css';
let content = fs.readFileSync(path, 'utf8');

// Restore #admitCardPreview
content = content.replace(/body\.ac-printing #admitCardPreview \{\n    display: block !important;\n    visibility: visible !important;\n    width: 100% !important;\n    margin: 0 !important;\n    padding: 0 !important;\n    \/\* Kill any whitespace nodes between page divs \*\/\n    font-size: 0 !important;\n    line-height: 0 !important;\n  \}/, `body.ac-printing #admitCardPreview {
    display: block !important;
    visibility: visible !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    /* Kill any whitespace nodes between page divs */
    font-size: 0 !important;
    line-height: 0 !important;
  }`);

// Restore .ac-page
content = content.replace(/body\.ac-printing \.ac-page \{\n    display: grid !important;\n    box-shadow: none !important;\n    page-break-after: always !important;\n    break-after: page !important;\n    page-break-inside: avoid !important;\n    break-inside: avoid !important;\n    position: relative !important;\n    margin: 0 !important;\n    padding: 5mm !important;\n    \/\* Strict overflow control to prevent spilling into blank pages \*\/\n    overflow: hidden !important;\n    background: white !important;\n    border: none !important;\n    box-sizing: border-box !important;\n    width: 100% !important;\n  \}/, `body.ac-printing .ac-page {
    display: grid !important;
    box-shadow: none !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    position: relative !important;
    margin: 0 !important;
    padding: 5mm !important;
    /* Prevent content spill */
    overflow: visible !important;
    background: white !important;
    border: none !important;
    box-sizing: border-box !important;
    width: 100% !important;
  }`);

// Restore .ac-page-portrait
content = content.replace(/body\.ac-printing \.ac-page-portrait \{\n    \/\* Precise A4 portrait height with slight safety margin \*\/\n    height: 296mm !important;\n    min-height: 296mm !important;\n    max-height: 296mm !important;\n  \}/, `body.ac-printing .ac-page-portrait {
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
  }`);

// Restore .ac-page-landscape
content = content.replace(/body\.ac-printing \.ac-page-landscape \{\n    \/\* Precise A4 landscape height with slight safety margin \*\/\n    height: 209mm !important;\n    min-height: 209mm !important;\n    max-height: 209mm !important;\n  \}/, `body.ac-printing .ac-page-landscape {
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
  }`);

fs.writeFileSync(path, content, 'utf8');
console.log('Restored perfect AC print CSS');
