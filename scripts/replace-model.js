// Script: Replace all gpt-4o and gpt-4o-mini with gpt-5.4 across the project
const fs = require('fs');
const path = require('path');

function walkDir(dir, ext) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file === 'node_modules' || file === '.next' || file === '.git') continue;
      results = results.concat(walkDir(fullPath, ext));
    } else if (ext.some(e => file.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcDir = path.join(__dirname, '..', 'src');
const files = walkDir(srcDir, ['.ts', '.tsx']);
let totalChanges = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  // Replace gpt-4o-mini first (more specific), then gpt-4o
  let newContent = content
    .replace(/gpt-4o-mini/g, 'gpt-5.4')
    .replace(/gpt-4o/g, 'gpt-5.4');
  
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    const changes = (content.match(/gpt-4o/g) || []).length;
    totalChanges += changes;
    console.log(`Updated: ${path.relative(srcDir, file)} (${changes} replacements)`);
  }
}

console.log(`\nDone. Total files changed: ${files.filter(f => {
  const c = fs.readFileSync(f, 'utf8');
  return !c.includes('gpt-4o');
}).length}, Total replacements: ${totalChanges}`);
