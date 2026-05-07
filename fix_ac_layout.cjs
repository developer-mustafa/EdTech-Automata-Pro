const fs = require('fs');
const path = './src/styles/main.css';
let content = fs.readFileSync(path, 'utf8');

// Replace auto with 1fr
content = content.replace(/grid-template-rows: repeat\(var\(--ac-rows, (\d+)\), auto\);/g, 'grid-template-rows: repeat(var(--ac-rows, $1), 1fr);');

// Fix .ac-card and .ac-card-inner heights
content = content.replace(/\.ac-card \{\n  padding: 8px;\n  background: #fff;\n  border-radius: 4px;\n  border: 1px solid #ccc;\n  \/\* Outer gentle border \*\/\n  box-sizing: border-box;\n  position: relative;\n  overflow: visible;\n  box-shadow: inset 0 0 0 1px rgba\(0, 0, 0, 0\.05\);\n  \/\* very subtle inner depth \*\/\n  break-inside: avoid;\n  page-break-inside: avoid;\n  \/\* height: 100%; removed for compactness \*\/\n  align-self: start;\n  \/\* Prevents stretching and inconsistency in grid rows \*\/\n  display: flex;\n  flex-direction: column;\n\}/g, `.ac-card {
  padding: 8px;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #ccc;
  box-sizing: border-box;
  position: relative;
  overflow: visible;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  break-inside: avoid;
  page-break-inside: avoid;
  height: 100%;
  align-self: stretch;
  display: flex;
  flex-direction: column;
}`);

content = content.replace(/\.ac-card-inner \{\n  border: 2px solid var\(--ac-primary-color, #2c3e50\);\n  padding: 8px;\n  \/\* height: 100%; removed for compactness \*\/\n  box-sizing: border-box;\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  background: transparent;\n  \/\* Ensure watermark is visible \*\/\n\}/g, `.ac-card-inner {
  border: 2px solid var(--ac-primary-color, #2c3e50);
  padding: 8px;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
}`);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed AC layout CSS');
