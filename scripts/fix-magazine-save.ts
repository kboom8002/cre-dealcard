import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/app/(broker)/broker/magazine-editor/page.tsx');
let content = fs.readFileSync(file, 'utf8');

const target = `const res = await fetch("/api/broker/morning-intelligence/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerId: brokerSlug,
          issueDate: today,
          content: previewData,
          headline: magazineTitle,
          themeColor,
        }),
      });`;

const replacement = `const res = await fetch(\`/api/magazine/\${brokerSlug}\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...previewData,
          issueDate: today,
        }),
      });`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log('Fixed magazine save route.');
} else {
  console.log('Target not found.');
}
