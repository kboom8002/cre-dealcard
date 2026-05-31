const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';
Promise.all([
  fetch('https://vwbmaulavgjwezffbxgi.supabase.co/rest/v1/activity_events?entity_id=eq.d9170f60-2429-42d7-9b28-f60db9737b5f', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  }).then(r => r.json()),
  fetch('https://vwbmaulavgjwezffbxgi.supabase.co/rest/v1/activity_events?entity_id=eq.df653b00-b8f9-4e1d-b18f-e75c0a5f4bae', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  }).then(r => r.json())
]).then(([ssotEvents, reportEvents]) => {
  console.log('Events on SSoT:', ssotEvents.length);
  console.log('Events on Report:', reportEvents.length);
});
