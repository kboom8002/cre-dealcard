
const fs = require('fs');
const routes = [
  'src/app/api/broker/deal-card/[id]/route.ts',
  'src/app/api/broker/deal-card/[id]/delete/route.ts',
  'src/app/api/broker/im-lite/[id]/route.ts',
  'src/app/api/broker/memo/[id]/route.ts',
  'src/app/api/broker/circles/[id]/route.ts',
  'src/app/api/broker/clients/[id]/route.ts',
  'src/app/api/broker/pptx-studio/projects/[id]/approve-editorial/route.ts',
  'src/app/api/broker/pptx-studio/projects/[id]/approve-file/route.ts',
  'src/app/api/broker/pptx-studio/projects/[id]/slides/route.ts',
  'src/app/api/broker/magazine/subscribers/[id]/route.ts'
];
for (const route of routes) {
  try {
    let content = fs.readFileSync(route, 'utf8');
    const regex = /const\s*{\s*id\s*}\s*=\s*(?:await\s+)?params;\s*/;
    if (regex.test(content) && !content.includes('if (!id)')) {
      content = content.replace(regex, (match) => {
        return match + 'if (!id) return NextResponse.json({ error: \'Missing ID\' }, { status: 400 });\n  ';
      });
      fs.writeFileSync(route, content, 'utf8');
      console.log('Fixed:', route);
    }
  } catch(e) {}
}

