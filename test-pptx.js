const { request } = require('playwright');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const ids = [
  'd2acdd2c-d686-435a-9cba-606eafd0860b',
  '272472c8-ba27-4159-bf95-fcd7a326dd56',
  '4a6f512c-4c82-4fdd-a0b0-cbfab392f0eb',
  'e639d92e-7d68-4908-a20d-bfdc9784d51c',
  'c2ea28e5-8505-4026-8c7a-fd9833bf224c',
  'b41d3c97-d166-436f-b3d7-808fa737b649',
  '7d232303-abe3-48d3-9b76-91f24d5d05df',
  '0f19bbcd-fd88-4698-a8db-4a9479ab9999',
  '633adc1f-347a-4131-96a4-32583ac73bce'
];

(async () => {
  const apiContext = await request.newContext({
    baseURL: 'http://localhost:3000'
  });
  
  for (const id of ids) {
     const url = `/api/public/im-lite/${id}/pptx`;
     const res = await apiContext.get(url, { timeout: 60000 });
     console.log(`${id}: ${res.status()}`);
     if (res.status() === 500) {
        console.log(await res.text());
     }
     if (res.status() === 200) {
        console.log('SUCCESS! Headers:', res.headers());
        break; // we found a working one!
     }
  }
})();
