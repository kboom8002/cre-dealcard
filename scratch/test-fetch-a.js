const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';
fetch('https://vwbmaulavgjwezffbxgi.supabase.co/rest/v1/document_objects?id=eq.df653b00-b8f9-4e1d-b18f-e75c0a5f4bae&select=body', {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
}).then(r => r.json()).then(data => console.log(JSON.stringify(data[0].body, null, 2)));
