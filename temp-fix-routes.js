const fs = require('fs');
let file1 = '../cre-aipage/app/src/app/api/handoffs/from-full-im/route.ts';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace('space_drafts,', 'space_drafts: spaceDrafts,');
fs.writeFileSync(file1, content1);

let file2 = '../cre-aipage/app/src/app/api/handoffs/from-mvp/route.ts';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(
  'memo_text: payload.memo_text,\n      target_tenant_types: payload.target_tenant_types,\n      space_basics: payload.space_basics,',
  'payload: {\n        memo_text: payload.memo_text,\n        target_tenant_types: payload.target_tenant_types,\n        space_basics: payload.space_basics,\n      },'
);
content2 = content2.replace('details: agentResult.error_message', 'details: agentResult.warnings.join(", ")');
content2 = content2.replace("if (process.env.NODE_ENV !== 'test') {", "if (!agentResult.output) { return NextResponse.json({ error: 'No output' }, { status: 422 }); }\n\n    if (process.env.NODE_ENV !== 'test') {");
fs.writeFileSync(file2, content2);
console.log('Fixed routes');
