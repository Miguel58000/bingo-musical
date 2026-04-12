const fs = require('fs');
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const clientId = env.VITE_SPOTIFY_CLIENT_ID;
const clientSecret = env.VITE_SPOTIFY_CLIENT_SECRET;

async function test() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  
  const playlists = await fetch('https://api.spotify.com/v1/users/31uyauwjigijezmue5gxqj3qqgz4/playlists?limit=5', {
      headers: { 'Authorization': 'Bearer ' + data.access_token }
  });
  console.log('Status:', playlists.status);
  const playData = await playlists.json();
  console.log(playData);
}

test();
