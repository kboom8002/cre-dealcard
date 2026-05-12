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
    // It currently has `const {  } = await params;` because of the previous bug.
    // Let's replace it back based on the filename or parameter usages.
    if (content.includes('const {  } = await params;')) {
      if (filePath.includes('[id]')) {
        content = content.replace('const {  } = await params;', 'const { id } = await params;');
      } else if (filePath.includes('[token]')) {
        content = content.replace('const {  } = await params;', 'const { token } = await params;');
      } else if (filePath.includes('[action]')) {
        content = content.replace('const {  } = await params;', 'const { id, action } = await params;');
      } else if (filePath.includes('[assignmentId]')) {
        content = content.replace('const {  } = await params;', 'const { assignmentId } = await params;');
      }
    }
    
    // Also, there were cases where `(await params).id` didn't catch because they didn't have `const { id } = params;`
    // Wait, the previous `const { id } = params` was broken. Let's fix those first.
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed', filePath);
    }
  }
});
