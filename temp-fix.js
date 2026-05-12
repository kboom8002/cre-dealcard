const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('../cre-fullim/src/app/api', function(filePath) {
  if (filePath.endsWith('route.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    content = content.replace(/\{ params \}:\s*\{\s*params:\s*\{\s*([a-zA-Z0-9_]+):\s*string\s*\}\s*\}/g, '{ params }: { params: Promise<{ $1: string }> }');
    content = content.replace(/params\.id/g, '(await params).id');
    content = content.replace(/params\.token/g, '(await params).token');
    content = content.replace(/params\.action/g, '(await params).action');
    content = content.replace(/params\.sectionId/g, '(await params).sectionId');
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed', filePath);
    }
  }
});
