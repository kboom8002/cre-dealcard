const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('../cre-fullim/src/__tests__', function(filePath) {
  if (filePath.endsWith('.test.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    // Replace: params: { token: 'mock-token' } with params: Promise.resolve({ token: 'mock-token' })
    content = content.replace(/params:\s*\{\s*([a-zA-Z0-9_, '":\n]+)\s*\}/g, 'params: Promise.resolve({ $1 })');
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed', filePath);
    }
  }
});
