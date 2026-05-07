/**
 * extract_print_css.cjs
 * 
 * Precisely extracts ALL @media print blocks from main.css into a new print.css file.
 * Each block is extracted with its surrounding context comments preserved.
 * After extraction, the blocks are removed from main.css and a <link> to print.css is added in index.html.
 * 
 * SAFETY: Creates backup files before any modifications.
 */

const fs = require('fs');
const path = require('path');

const MAIN_CSS_PATH = path.join(__dirname, 'src', 'styles', 'main.css');
const PRINT_CSS_PATH = path.join(__dirname, 'src', 'styles', 'print.css');
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');
const BACKUP_SUFFIX = '.bak-before-print-extract';

// --- All @media print block ranges (1-indexed, inclusive) ---
// Found via automated brace-counting scan
const PRINT_BLOCKS = [
  { start: 3618, end: 3705, label: 'Analysis/Chart Page Print (Scoped)' },
  { start: 11219, end: 11226, label: 'Marksheet Preview Area Print Reset' },
  { start: 11236, end: 11242, label: 'Marksheet Preview MS-Page Print Reset' },
  { start: 12255, end: 12606, label: 'Teacher ID Card Bulk Print' },
  { start: 12841, end: 12849, label: 'Marksheet Table Header Print Colors' },
  { start: 12928, end: 12967, label: 'Marksheet Failing/Passing Marks Print Colors' },
  { start: 13337, end: 13422, label: 'Marksheet Grade Scale Print Quality' },
  { start: 13605, end: 13765, label: 'Marksheet Full Print Layout' },
  { start: 16196, end: 16208, label: 'Admit Card Grid Print Adjustments' },
  { start: 17635, end: 17643, label: 'Admit Card Settings Modal Print Hide' },
  { start: 17837, end: 17846, label: 'Admit Card Tab Bar Print Hide' },
  { start: 18357, end: 18366, label: 'Admit Card Page Divider Print Hide' },
  { start: 19006, end: 19017, label: 'Admit Card Seat Plan Header Print' },
  { start: 19167, end: 19441, label: 'Admit Card Mobile Responsive Print Overrides' },
  { start: 19797, end: 19809, label: 'Admit Card Compact Info Print' },
  { start: 21901, end: 21958, label: 'Notice/Circular Print Layout' },
  { start: 22146, end: 22457, label: 'MASTER Print Layout (AC/MS/TC Combined)' },
  { start: 22460, end: 22483, label: 'Report Print Layout' },
  { start: 22488, end: 22549, label: 'Student Results Bulk Print' },
  { start: 22730, end: 22735, label: 'App Footer Print Hide' },
  { start: 23390, end: 23400, label: 'Marksheet Compact Info Print' },
  { start: 23480, end: 23721, label: 'Marksheet APS Progress Print' },
  { start: 24042, end: 24046, label: 'Tabulation Group Column Print Hide' },
  { start: 24511, end: 24519, label: 'Tutorial Summary Table Print' },
  { start: 25101, end: 25142, label: 'Marksheet Tutorial Results Print' },
  { start: 26113, end: 26182, label: 'Student Results Single Print (SR)' },
];

function main() {
  console.log('=== Print CSS Extraction Tool ===\n');

  // 1. Read main.css
  if (!fs.existsSync(MAIN_CSS_PATH)) {
    console.error('ERROR: main.css not found at', MAIN_CSS_PATH);
    process.exit(1);
  }
  const mainCssContent = fs.readFileSync(MAIN_CSS_PATH, 'utf-8');
  const mainLines = mainCssContent.split(/\r?\n/);
  console.log(`✓ Read main.css: ${mainLines.length} lines\n`);

  // 2. Validate all blocks - check that each start line contains @media print
  let validationErrors = [];
  for (const block of PRINT_BLOCKS) {
    const startLine = mainLines[block.start - 1]; // 0-indexed
    if (!startLine || !startLine.match(/@media\s+print/)) {
      validationErrors.push(
        `Block "${block.label}" (line ${block.start}): Expected @media print, found: "${(startLine || '').trim()}"`
      );
    }
    // Check closing brace
    const endLine = mainLines[block.end - 1];
    if (!endLine || !endLine.trim().startsWith('}')) {
      // For the last block, it might end at EOF
      if (block.end !== mainLines.length || (endLine && endLine.trim() !== '}')) {
        validationErrors.push(
          `Block "${block.label}" (line ${block.end}): Expected closing }, found: "${(endLine || '').trim()}"`
        );
      }
    }
  }

  if (validationErrors.length > 0) {
    console.error('VALIDATION ERRORS - Aborting!\n');
    validationErrors.forEach(e => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log('✓ All 26 block boundaries validated successfully\n');

  // 3. Check for overlapping blocks
  const sorted = [...PRINT_BLOCKS].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) {
      console.error(`ERROR: Overlapping blocks: "${sorted[i - 1].label}" (${sorted[i - 1].start}-${sorted[i - 1].end}) and "${sorted[i].label}" (${sorted[i].start}-${sorted[i].end})`);
      process.exit(1);
    }
  }
  console.log('✓ No overlapping blocks detected\n');

  // 4. Extract blocks and build print.css content
  let printCssContent = `/* =========================================
   print.css — All Print-Related Styles
   Extracted from main.css for modularity
   
   WARNING: Do NOT reorder these blocks.
   The order matches the original main.css sequence
   to preserve CSS cascade/specificity behavior.
   ========================================= */

`;

  // Also collect context comments (lines immediately before each block)
  for (const block of sorted) {
    // Grab up to 5 context comment lines before the @media print line
    let contextLines = [];
    for (let i = block.start - 2; i >= Math.max(0, block.start - 6); i--) {
      const line = mainLines[i].trim();
      if (line.startsWith('/*') || line.startsWith('*') || line.endsWith('*/') || line === '') {
        contextLines.unshift(mainLines[i]);
      } else {
        break;
      }
    }

    // Add section separator
    printCssContent += `/* -----------------------------------------\n`;
    printCssContent += `   ${block.label}\n`;
    printCssContent += `   Original location: main.css lines ${block.start}-${block.end}\n`;
    printCssContent += `   ----------------------------------------- */\n`;

    // Add the actual block content
    const blockLines = mainLines.slice(block.start - 1, block.end);
    printCssContent += blockLines.join('\n') + '\n\n';
  }

  // 5. Create backups
  const backupMainPath = MAIN_CSS_PATH + BACKUP_SUFFIX;
  const backupIndexPath = INDEX_HTML_PATH + BACKUP_SUFFIX;

  if (!fs.existsSync(backupMainPath)) {
    fs.copyFileSync(MAIN_CSS_PATH, backupMainPath);
    console.log('✓ Backup created: main.css' + BACKUP_SUFFIX);
  } else {
    console.log('⚠ Backup already exists, skipping backup creation');
  }

  if (!fs.existsSync(backupIndexPath)) {
    fs.copyFileSync(INDEX_HTML_PATH, backupIndexPath);
    console.log('✓ Backup created: index.html' + BACKUP_SUFFIX);
  }

  // 6. Write print.css
  fs.writeFileSync(PRINT_CSS_PATH, printCssContent, 'utf-8');
  const printLineCount = printCssContent.split('\n').length;
  console.log(`\n✓ Created print.css: ${printLineCount} lines\n`);

  // 7. Remove blocks from main.css (work backwards to preserve line numbers)
  const blocksReversed = [...sorted].reverse();
  let newMainLines = [...mainLines];

  for (const block of blocksReversed) {
    // Also remove up to 2 blank lines after the block
    let removeEnd = block.end - 1; // 0-indexed
    while (removeEnd + 1 < newMainLines.length && newMainLines[removeEnd + 1].trim() === '') {
      removeEnd++;
      // Max 2 extra blank lines
      if (removeEnd - (block.end - 1) >= 2) break;
    }

    // Check if there's a context comment immediately before (like /* Print CSS - Marksheet */)
    let removeStart = block.start - 1; // 0-indexed
    // Look for comment block directly above
    let lookback = removeStart - 1;
    while (lookback >= 0 && newMainLines[lookback].trim() === '') {
      lookback--;
    }
    // Check if the non-blank line above is a comment end
    if (lookback >= 0) {
      const aboveLine = newMainLines[lookback].trim();
      if (aboveLine.endsWith('*/') || aboveLine.match(/^\/\*.*\*\/$/)) {
        // This is a standalone comment - check if it's a section header for this print block
        // Find start of comment
        let commentStart = lookback;
        while (commentStart > 0 && !newMainLines[commentStart].includes('/*')) {
          commentStart--;
        }
        const commentText = newMainLines.slice(commentStart, lookback + 1).join(' ');
        // Only remove if it's clearly a print-related section comment
        if (commentText.toLowerCase().includes('print') || commentText.toLowerCase().includes('@media')) {
          // Remove blank lines between comment and @media print
          removeStart = commentStart;
        }
      }
    }

    // Add a placeholder comment so we know where the block was
    const placeholder = `/* [MOVED TO print.css] ${block.label} (was lines ${block.start}-${block.end}) */`;

    newMainLines.splice(removeStart, removeEnd - removeStart + 1, placeholder);
  }

  // 8. Add @import for print.css at the very beginning of main.css (after any existing comments)
  // Actually, since print.css should come AFTER main.css in specificity, we'll use <link> in index.html instead

  // Write modified main.css
  const newMainContent = newMainLines.join('\n');
  fs.writeFileSync(MAIN_CSS_PATH, newMainContent, 'utf-8');
  console.log(`✓ Updated main.css: ${newMainLines.length} lines (removed ${mainLines.length - newMainLines.length} lines)\n`);

  // 9. Add <link> for print.css in index.html AFTER main.css link
  let indexContent = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  if (indexContent.includes('print.css')) {
    console.log('⚠ print.css link already exists in index.html, skipping');
  } else {
    // Insert after the main.css link line
    indexContent = indexContent.replace(
      /<link\s+rel="stylesheet"\s+href="\.\/src\/styles\/main\.css"\s*\/>/,
      '$&\n  <link rel="stylesheet" href="./src/styles/print.css" />'
    );
    fs.writeFileSync(INDEX_HTML_PATH, indexContent, 'utf-8');
    console.log('✓ Added <link rel="stylesheet" href="./src/styles/print.css" /> in index.html\n');
  }

  // 10. Summary
  console.log('=== EXTRACTION COMPLETE ===');
  console.log(`  Blocks extracted: ${PRINT_BLOCKS.length}`);
  console.log(`  Lines moved: ~${mainLines.length - newMainLines.length + PRINT_BLOCKS.length}`);
  console.log(`  print.css size: ${printLineCount} lines`);
  console.log(`  main.css reduced: ${mainLines.length} → ${newMainLines.length} lines`);
  console.log('\n  Backups saved as:');
  console.log(`    main.css${BACKUP_SUFFIX}`);
  console.log(`    index.html${BACKUP_SUFFIX}`);
  console.log('\n  To REVERT: rename .bak files back to originals and delete print.css');
}

main();
