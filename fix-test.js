const fs = require('fs');
const file = 'src/domain/building/mobile-im/__tests__/data-pipeline-edge.test.ts';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/'50\?\?/g, "'50??'");
c = c.replace(/\"50\?\?/g, '\"50??\"');
c = c.replace(/'2,032\?\?/g, "'2,032??'");
c = c.replace(/\"2,032\?\?/g, '\"2,032??\"');
c = c.replace(/toBe\('50\?\?'\);/g, "toBe('50??');");
fs.writeFileSync(file, c);
