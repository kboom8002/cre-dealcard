const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('../cre-aipage/app/src/app', function(filePath) {
  if (filePath.endsWith('route.ts') || filePath.endsWith('page.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Replace the params interface in function signature
    content = content.replace(/\{ params \}:\s*\{\s*params:\s*\{\s*([a-zA-Z0-9_]+):\s*string\s*\}\s*\}/g, '{ params }: { params: Promise<{ $1: string }> }');
    content = content.replace(/params:\s*\{\s*([a-zA-Z0-9_]+):\s*string\s*\}/g, 'params: Promise<{ $1: string }>');

    // 2. Fix the usage (e.g. const spaceId = params.spaceId)
    content = content.replace(/params\.([a-zA-Z0-9_]+)/g, '(await params).$1');
    content = content.replace(/const\s*\{\s*([a-zA-Z0-9_, ]+)\s*\}\s*=\s*params;/g, 'const { $1 } = await params;');

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed', filePath);
    }
  }
});
