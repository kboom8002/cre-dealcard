const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';
fetch('https://vwbmaulavgjwezffbxgi.supabase.co/rest/v1/activity_events?entity_id=eq.525bc8df-21e7-4a6f-b6c0-827dc9488a7d', {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
}).then(r => r.json()).then(data => console.log('Events on SSoT:', data.length));

fetch('https://vwbmaulavgjwezffbxgi.supabase.co/rest/v1/activity_events?entity_id=eq.a32dbd00-d50c-44a3-ba0b-6d85605e440e', {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
}).then(r => r.json()).then(data => console.log('Events on Teaser:', data.length));
