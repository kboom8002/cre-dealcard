const fs = require('fs');
const file = 'src/app/(broker)/broker/deal-card/new/page.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'setError("생성 시간이 초과되었습니다.");',
  'setError("생성 시간이 초과되었습니다. AI 분석 작업이 지연되고 있습니다. 딜카드 목록을 확인해주세요.");'
);
fs.writeFileSync(file, content);
console.log('done');
