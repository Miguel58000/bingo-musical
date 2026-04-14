import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Users, Play, Download, Trash2, Plus, CheckCircle, UserCheck, Video, FileText, ClipboardPaste } from 'lucide-react';
import confetti from 'canvas-confetti';

interface Song {
  id: string;
  name: string;
  artist: string;
}

type SourceTab = 'spotify' | 'Video' | 'manual';

export default function App() {
  const [step, setStep] = useState(1);
  const [spotifyLink, setSpotifyLink] = useState('');
  const [guestCount, setGuestCount] = useState(10);
  const [songs, setSongs] = useState<Song[]>([]);
  const [newSongName, setNewSongName] = useState('');
  const [newSongArtist, setNewSongArtist] = useState('');
  const [boards, setBoards] = useState<string[][]>([]);
  const [playedSongs, setPlayedSongs] = useState<Set<string>>(new Set());

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');

  
  // Source tab
  const [activeTab, setActiveTab] = useState<SourceTab>('spotify');
  
  // Video state
  const [youtubeLink, setYoutubeLink] = useState('');
  
  // Manual bulk state
  const [bulkText, setBulkText] = useState('');

  // PKCE Helper Functions
  const generateRandomString = (length: number) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  const generateCodeChallenge = async (codeVerifier: string) => {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
  };

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    
    if (code) {
        // Limpiar la URL para borrar el código largo y que quede lindo
        window.history.replaceState('', document.title, window.location.pathname);
        const verifier = localStorage.getItem("spotify_verifier");
        
        if (verifier) {
            const getPKCEToken = async () => {
                const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
                const redirectUri = window.location.origin + '/';
                const body = new URLSearchParams({
                    client_id: clientId,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                    code_verifier: verifier,
                });
                
                try {
                    const response = await fetch('https://accounts.spotify.com/api/token', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: body.toString()
                    });
                    const data = await response.json();
                    
                    if (data.access_token) {
                        localStorage.setItem('spotify_access_token', data.access_token);
                        localStorage.setItem('spotify_token_scope', data.scope || '');
                        fetchMyTopTracks(data.access_token);
                    } else {
                        alert("Error canjeando código de Spotify: " + (data.error_description || data.error));
                    }
                } catch(e) {
                    console.error("Error PKCE token:", e);
                }
            };
            getPKCEToken();
        }
    }
  }, []);

  const loginWithSpotify = async () => {
      const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
      const redirectUri = window.location.origin + '/';
      const scopes = ['user-top-read', 'playlist-read-private', 'playlist-read-collaborative'];
      
      if (!clientId || clientId === 'tu_cliente_id_aqui') {
          alert("Faltan credenciales de Spotify en tu archivo .env");
          return;
      }

      // Limpiar token viejo para forzar uno nuevo con los permisos correctos
      localStorage.removeItem('spotify_access_token');
      
      const verifier = generateRandomString(128);
      const challenge = await generateCodeChallenge(verifier);
      
      localStorage.setItem("spotify_verifier", verifier);
      
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}&code_challenge_method=S256&code_challenge=${challenge}&show_dialog=true`;
      window.location.href = authUrl;
  };

  const fetchMyTopTracks = async (token: string) => {
      setIsAnalyzing(true);
      try {
          setAnalysisStep('Conectando a tu cuenta...');
          await new Promise(r => setTimeout(r, 800));
          setAnalysisStep('Analizando tu historial de reproducciones...');
          
          const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await response.json();
          
          if (!response.ok) throw new Error("Error obteniendo tus canciones.");
          
          const topTracks = data.items.map((item: any) => ({
              id: item.id,
              name: item.name,
              artist: item.artists?.[0]?.name || 'Unknown'
          }));

          setAnalysisStep('Calculando tu vibra musical (Generando Bingo)...');
          await new Promise(r => setTimeout(r, 1200));

          if (topTracks.length < 25) {
              alert('Spotify devolvió muy pocas canciones. ¿Usas mucho esta cuenta? ¡Intentaremos jugar con lo que hay!');
          }

          setSongs(topTracks);
          setStep(2);
      } catch (e: any) {
          console.error(e);
          alert('Hubo un error: ' + e.message);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const fetchPlaylistTracks = async (token: string, playlistId: string) => {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (response.status === 403 || response.status === 401) {
          localStorage.removeItem('spotify_access_token');
          throw new Error('Tu sesión de Spotify expiró o no tiene permiso (Error 403/401). ¡Haz clic en el BOTÓN VERDE "Conectar con Spotify" para iniciar sesión de nuevo con los permisos correctos!');
      }

      if (!response.ok || !data.items) {
          throw new Error('No se pudo encontrar la playlist. Asegúrate de que el link sea correcto y la playlist sea pública.');
      }

      return data.items
          .filter((item: any) => item && item.track && item.track.id)
          .map((item: any) => ({
              id: item.track.id,
              name: item.track.name,
              artist: item.track.artists?.[0]?.name || 'Unknown'
          }));
  };

  const handleFetchSongs = async () => {
    if (!spotifyLink) return;
    if (spotifyLink.includes('/user/')) {
        alert('Para escanear un perfil personal, usa el botón gigante verde de "Conectar con Spotify". Aquí abajo solo puedes pegar links directos a Playlists (ej: /playlist/... ).');
        return;
    }

    setIsAnalyzing(true);
    
    try {
        setAnalysisStep('Conectando con Spotify...');
        
        const token = localStorage.getItem('spotify_access_token');

        if (!token) {
            alert('âš ï¸ TenÃ©s que iniciar sesiÃ³n primero.\n\nHaz clic en el botÃ³n VERDE "Conectar con Spotify", autoriza la app, y despuÃ©s volvÃ© a pegar el link.');
            setIsAnalyzing(false);
            return;
        }

        let extractedSongs: Song[] = [];

        if (spotifyLink.includes('/playlist/')) {
            setAnalysisStep('Analizando playlist...');
            const playlistId = spotifyLink.split('/playlist/')[1].split('?')[0];
            extractedSongs = await fetchPlaylistTracks(token, playlistId);
        } else {
            alert('Por favor inserta un link de Playlist vÃ¡lido. Ejemplo: https://open.spotify.com/playlist/...');
            setIsAnalyzing(false);
            return;
        }

        if (extractedSongs.length === 0) {
            alert('No se encontraron canciones. AsegÃºrate de tener al menos 25 y que sea pÃºblica.');
            setIsAnalyzing(false);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 800));
        setAnalysisStep('Generando mezcla perfecta...');
        await new Promise(resolve => setTimeout(resolve, 800));

        setSongs(extractedSongs.slice(0, 50));
        setStep(2);
    } catch (error: any) {
        console.error('[DEBUG] Error:', error);
        alert(error.message || 'Ocurrió un error al conectar con Spotify.');
    } finally {
        setIsAnalyzing(false);
    }
  };

  // ==================== YouTube ====================

  const extractYoutubeChannelId = async (link: string, apiKey: string): Promise<string> => {
    // Handle: youtube.com/@handle
    const handleMatch = link.match(/@([\w\-\.]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handle}&key=${apiKey}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) return data.items[0].id;
      throw new Error(`No se encontró un canal con el handle @${handle}`);
    }

    // Handle: youtube.com/channel/UCxxxxxx
    const channelIdMatch = link.match(/\/channel\/(UC[\w\-]+)/);
    if (channelIdMatch) return channelIdMatch[1];

    // Handle: youtube.com/c/ChannelName or youtube.com/user/Username
    const userMatch = link.match(/\/(c|user)\/([\w\-]+)/);
    if (userMatch) {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${userMatch[2]}&key=${apiKey}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) return data.items[0].id;
      // Try search as fallback
      const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${userMatch[2]}&type=channel&maxResults=1&key=${apiKey}`);
      const searchData = await searchRes.json();
      if (searchData.items && searchData.items.length > 0) return searchData.items[0].snippet.channelId;
      throw new Error(`No se encontró el canal "${userMatch[2]}"`);
    }

    throw new Error('No se pudo identificar el canal. Asegúrate de pegar un link válido de YouTube (ej: youtube.com/@CanalDeMusica)');
  };

  const extractYoutubePlaylistId = (link: string): string | null => {
    const match = link.match(/[?&]list=([\w\-]+)/);
    return match ? match[1] : null;
  };

  // Helper to clean and parse a YouTube video title into { name, artist }
  const parseYoutubeTitle = (title: string, channelTitle: string): { name: string; artist: string } => {
    const suffixClean = (s: string) => s
      .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, '')
      .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, '')
      .replace(/\s*\(Lyric\s*Video\)/gi, '')
      .replace(/\s*\[Lyric\s*Video\]/gi, '')
      .replace(/\s*\(Audio\s*(Oficial)?\)/gi, '')
      .replace(/\s*\[Audio\s*(Oficial)?\]/gi, '')
      .replace(/\s*\(Video\s*Oficial\)/gi, '')
      .replace(/\s*\[Video\s*Oficial\]/gi, '')
      .replace(/\s*\(Official\s*Audio\)/gi, '')
      .replace(/\s*\[Official\s*Audio\]/gi, '')
      .replace(/\s*ft\.?\s*.+$/i, '')
      .replace(/\s*feat\.?\s*.+$/i, '')
      .trim();

    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      return {
        artist: parts[0].trim(),
        name: suffixClean(parts.slice(1).join(' - '))
      };
    }

    return { name: suffixClean(title), artist: channelTitle };
  };

  // Build Song list from a batch of YouTube video detail items (snippet + statistics)
  const buildSongsFromVideos = (items: any[]): (Song & { views: number })[] => {
    const result: (Song & { views: number })[] = [];
    for (const video of items) {
      if (video.snippet?.categoryId === '10') {
        const { name, artist } = parseYoutubeTitle(video.snippet.title, video.snippet.channelTitle);
        result.push({
          id: video.id,
          name,
          artist,
          views: parseInt(video.statistics?.viewCount || '0', 10)
        });
      }
    }
    return result;
  };

  const fetchYoutubeSongs = async () => {
    if (!youtubeLink.trim()) return;

    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    if (!apiKey) {
      alert('Falta la API Key de YouTube en el archivo .env (VITE_YOUTUBE_API_KEY)');
      return;
    }

    setIsAnalyzing(true);

    try {
      const playlistId = extractYoutubePlaylistId(youtubeLink);
      let withViews: (Song & { views: number })[] = [];

      if (playlistId) {
        // â”€â”€ PLAYLIST: fetch items then get stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        setAnalysisStep('Obteniendo videos de la playlist...');
        let videoIds: string[] = [];
        let nextPageToken = '';

        do {
          const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50&key=${apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.error) throw new Error(data.error.message || 'Error al obtener la playlist de YouTube');
          videoIds.push(...(data.items?.map((item: any) => item.contentDetails.videoId) || []));
          nextPageToken = data.nextPageToken || '';
        } while (nextPageToken && videoIds.length < 200);

        if (videoIds.length === 0) throw new Error('No se encontraron videos en la playlist.');

        setAnalysisStep(`Analizando ${videoIds.length} videos de la playlist...`);
        for (let i = 0; i < videoIds.length; i += 50) {
          const batch = videoIds.slice(i, i + 50);
          const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${batch.join(',')}&key=${apiKey}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);
          withViews.push(...buildSongsFromVideos(data.items || []));
        }

      } else {
        // â”€â”€ CHANNEL: use search ordered by viewCount â†’ most popular songs â”€â”€â”€â”€
        setAnalysisStep('Identificando canal de YouTube...');
        const channelId = await extractYoutubeChannelId(youtubeLink, apiKey);

        setAnalysisStep('Buscando las canciones más reproducidas del canal...');

        // search.list with order=viewCount + videoCategoryId=10 (Music)
        // Each search.list call costs 100 quota units â€“ 2 pages = 200 units (within free tier)
        let videoIds: string[] = [];
        let nextPageToken = '';

        do {
          const url =
            `https://www.googleapis.com/youtube/v3/search?part=id` +
            `&channelId=${channelId}` +
            `&type=video` +
            `&videoCategoryId=10` +
            `&order=viewCount` +
            `&maxResults=50` +
            `&key=${apiKey}` +
            (nextPageToken ? `&pageToken=${nextPageToken}` : '');
          const res = await fetch(url);
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);
          videoIds.push(...(data.items?.map((item: any) => item.id.videoId).filter(Boolean) || []));
          nextPageToken = data.nextPageToken || '';
        } while (nextPageToken && videoIds.length < 100);

        if (videoIds.length === 0) {
          throw new Error(
            'No se encontraron videos de mÃºsica en este canal. ' +
            'Puede que el canal no tenga videos categorizados como Música.'
          );
        }

        setAnalysisStep(`Obteniendo info de ${videoIds.length} canciones más populares...`);
        for (let i = 0; i < videoIds.length; i += 50) {
          const batch = videoIds.slice(i, i + 50);
          const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${batch.join(',')}&key=${apiKey}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);
          withViews.push(...buildSongsFromVideos(data.items || []));
        }

        // Already ordered by viewCount from search, but re-sort to be safe
        withViews.sort((a, b) => b.views - a.views);
      }

      if (withViews.length === 0) {
        throw new Error(
          'No se encontraron canciones (categoría Música) en este canal/playlist. ' +
          'Solo se importan videos marcados como "Música" en YouTube.'
        );
      }

      setAnalysisStep(`✨ ${withViews.length} canciones encontradas, ordenadas por popularidad!`);
      await new Promise(r => setTimeout(r, 900));

      // Strip views before storing
      setSongs(withViews.slice(0, 100).map(({ views: _views, ...song }) => song));
      setStep(2);
      
    } catch (error: any) {
      console.error('Video error:', error);
      alert(error.message || 'Error al conectar con YouTube.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ==================== MANUAL BULK ====================
  
  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    
    const lines = bulkText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    
    const newSongs: Song[] = lines.map(line => {
      // Support formats: "Song - Artist", "Song | Artist", "Song"
      let name = line;
      let artist = 'Artista Desconocido';
      
      if (line.includes(' - ')) {
        const parts = line.split(' - ');
        name = parts[0].trim();
        artist = parts.slice(1).join(' - ').trim();
      } else if (line.includes(' | ')) {
        const parts = line.split(' | ');
        name = parts[0].trim();
        artist = parts.slice(1).join(' | ').trim();
      }
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        name,
        artist
      };
    });
    
    setSongs(prev => [...prev, ...newSongs]);
    setBulkText('');
  };

  const handleStartManual = () => {
    // Jump directly to step 2 for manual management
    setStep(2);
  };

  const addManualSong = () => {
    if (!newSongName) return;
    const newSong: Song = {
      id: Math.random().toString(36).substr(2, 9),
      name: newSongName,
      artist: newSongArtist || 'Artista Desconocido'
    };
    setSongs([...songs, newSong]);
    setNewSongName('');
    setNewSongArtist('');
  };

  const removeSong = (id: string) => {
    setSongs(songs.filter(s => s.id !== id));
  };

  const generateBingo = () => {
    if (songs.length < 25) {
      alert("Necesitás al menos 25 canciones para generar un bingo 5x5.");
      return;
    }

    const newBoards: string[][] = [];
    for (let i = 0; i < guestCount; i++) {
        // Shuffle and pick 25
        const shuffled = [...songs].sort(() => 0.5 - Math.random());
        newBoards.push(shuffled.slice(0, 25).map(s => s.name));
    }
    setBoards(newBoards);
    setStep(3);
  };

  const togglePlayed = (songName: string) => {
    const next = new Set(playedSongs);
    if (next.has(songName)) {
        next.delete(songName);
    } else {
        next.add(songName);
    }
    setPlayedSongs(next);
  };

  const checkWinner = (board: string[]) => {
      return board.filter(s => playedSongs.has(s)).length;
  };

  const tabConfig: { key: SourceTab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'spotify', label: 'Spotify', icon: <Music size={18} />, color: '#1DB954' },
    { key: 'Video', label: 'YouTube', icon: <Video size={18} />, color: '#FF0000' },
    { key: 'manual', label: 'Manual', icon: <FileText size={18} />, color: '#a855f7' },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="text-center mb-12 animate-fade-in no-print">
            <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-block p-3 rounded-full bg-white/10 mb-4"
            >
                <Music size={48} className="text-pink-500" />
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-bold mb-4 drop-shadow-lg">
                Bingo <span className="gradient-text">Musical</span>
            </h1>
            <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
                Transformá tus playlists favoritas en una noche de juego épica con amigos.
            </p>
        </header>

        <main>
            <AnimatePresence mode="wait">
                
                {/* Step 1: Source Selection & Setup */}
                {step === 1 && (
                    <motion.div 
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="glass-card max-w-2xl mx-auto"
                    >
                        <div className="space-y-6">
                            {isAnalyzing ? (
                                <div className="p-6 bg-white/5 border border-purple-500/30 rounded-2xl text-center space-y-4">
                                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                    <p className="text-purple-300 font-medium animate-pulse">{analysisStep}</p>
                                </div>
                            ) : (
                                <>
                                    {/* Tab Navigation */}
                                    <div className="flex rounded-2xl bg-white/5 p-1.5 border border-white/10">
                                      {tabConfig.map(tab => (
                                        <button
                                          key={tab.key}
                                          onClick={() => setActiveTab(tab.key)}
                                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300"
                                          style={{
                                            background: activeTab === tab.key ? `${tab.color}22` : 'transparent',
                                            color: activeTab === tab.key ? tab.color : 'rgba(255,255,255,0.5)',
                                            border: activeTab === tab.key ? `1px solid ${tab.color}44` : '1px solid transparent',
                                            boxShadow: activeTab === tab.key ? `0 0 20px ${tab.color}15` : 'none',
                                          }}
                                        >
                                          {tab.icon} {tab.label}
                                        </button>
                                      ))}
                                    </div>

                                    {/* Spotify Tab */}
                                    <AnimatePresence mode="wait">
                                    {activeTab === 'spotify' && (
                                      <motion.div
                                        key="tab-spotify"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-5"
                                      >
                                        <div className="bg-white/5 p-6 rounded-2xl border border-[#1DB954]/30 text-center space-y-4">
                                            <h3 className="text-xl font-bold flex items-center justify-center gap-2">
                                                <UserCheck size={24} className="text-[#1DB954]" /> Jugar con tu perfil Real
                                            </h3>
                                            <p className="text-sm text-white/60">
                                                Inicia sesión de forma segura y generaremos el bingo automáticamente basado en las canciones que más escuchaste últimamente.
                                            </p>
                                            <button 
                                                onClick={loginWithSpotify}
                                                className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold py-4 text-lg shadow-lg shadow-[#1DB954]/20 flex items-center justify-center gap-2"
                                            >
                                                <Music size={20}/> Conectar con Spotify
                                            </button>
                                        </div>
                                        
                                        <div className="flex items-center gap-4 py-2">
                                            <div className="h-px bg-white/10 flex-1"></div>
                                            <span className="text-white/40 text-sm font-semibold uppercase tracking-wider">O usar una playlist</span>
                                            <div className="h-px bg-white/10 flex-1"></div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                                                <Music size={16} /> Link de Playlist de Spotify
                                            </label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="https://open.spotify.com/playlist/..." 
                                                    value={spotifyLink}
                                                    onChange={(e) => setSpotifyLink(e.target.value)}
                                                />
                                                <button 
                                                    onClick={handleFetchSongs}
                                                    className="bg-white/10 hover:bg-white/20 whitespace-nowrap px-6"
                                                >
                                                    Extraer
                                                </button>
                                            </div>
                                        </div>
                                      </motion.div>
                                    )}

                                    {/* Video Tab */}
                                    {activeTab === 'Video' && (
                                      <motion.div
                                        key="tab-Video"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-5"
                                      >
                                        <div className="bg-white/5 p-6 rounded-2xl border border-red-500/30 space-y-4">
                                          <h3 className="text-xl font-bold flex items-center justify-center gap-2 text-center">
                                            <Video size={24} className="text-red-500" /> Importar desde YouTube
                                          </h3>
                                          <p className="text-sm text-white/60 text-center">
                                            Pegá el link de un <strong>canal</strong> o <strong>playlist</strong> de YouTube. 
                                            Solo se importarán los videos categorizados como <span className="text-red-400 font-semibold">Música</span>.
                                          </p>
                                          
                                          <div>
                                            <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                                              <Video size={16} className="text-red-400" /> Link de YouTube
                                            </label>
                                            <div className="flex gap-2">
                                              <input 
                                                type="text"
                                                placeholder="youtube.com/@Canal o youtube.com/playlist?list=..."
                                                value={youtubeLink}
                                                onChange={(e) => setYoutubeLink(e.target.value)}
                                              />
                                              <button 
                                                onClick={fetchYoutubeSongs}
                                                className="bg-red-600 hover:bg-red-500 text-white whitespace-nowrap px-6"
                                              >
                                                Importar
                                              </button>
                                            </div>
                                          </div>

                                          <div className="text-xs text-white/40 bg-white/5 rounded-xl p-3 space-y-1">
                                            <p className="font-semibold text-white/60">Formatos aceptados:</p>
                                            <p>• youtube.com/<strong>@NombreDeCanal</strong></p>
                                            <p>• youtube.com/channel/<strong>UCxxxxxx</strong></p>
                                            <p>• youtube.com/playlist?list=<strong>PLxxxxxx</strong></p>
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}

                                    {/* Manual Tab */}
                                    {activeTab === 'manual' && (
                                      <motion.div
                                        key="tab-manual"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-5"
                                      >
                                        <div className="bg-white/5 p-6 rounded-2xl border border-purple-500/30 space-y-4">
                                          <h3 className="text-xl font-bold flex items-center justify-center gap-2 text-center">
                                            <ClipboardPaste size={24} className="text-purple-400" /> Carga Masiva de Canciones
                                          </h3>
                                          <p className="text-sm text-white/60 text-center">
                                            Pegá tu lista de canciones, <strong>una por línea</strong>. 
                                            Podés usar el formato <code className="bg-white/10 px-1.5 py-0.5 rounded text-purple-300">Canción - Artista</code> para separar.
                                          </p>

                                          <textarea
                                            className="bulk-textarea"
                                            rows={8}
                                            placeholder={`Ejemplo:\nBohemian Rhapsody - Queen\nHotel California - Eagles\nBillie Jean - Michael Jackson\nSweet Child O' Mine - Guns N' Roses\nSmells Like Teen Spirit - Nirvana\n\n...o simplemente nombres de canciones`}
                                            value={bulkText}
                                            onChange={(e) => setBulkText(e.target.value)}
                                          />

                                          <div className="flex gap-3">
                                            <button
                                              onClick={handleBulkAdd}
                                              disabled={!bulkText.trim()}
                                              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                              <Plus size={18} /> Agregar {bulkText.trim() ? `${bulkText.split('\n').filter(l => l.trim()).length} canciones` : 'canciones'}
                                            </button>
                                            <button
                                              onClick={handleStartManual}
                                              className="bg-white/10 hover:bg-white/20 px-6 py-3"
                                            >
                                              Ir al editor â†’
                                            </button>
                                          </div>

                                          {songs.length > 0 && (
                                            <div className="text-sm text-green-400/80 bg-green-500/10 rounded-xl p-3 flex items-center gap-2">
                                              <CheckCircle size={16} />
                                              Ya tenés {songs.length} canciones cargadas. Podés seguir agregando o ir al editor.
                                            </div>
                                          )}
                                        </div>
                                      </motion.div>
                                    )}
                                    </AnimatePresence>
                                </>
                            )}

                            <div>
                                <label className="block text-sm font-semibold mb-2 mt-4 flex items-center gap-2">
                                    <Users size={16} /> Cantidad de invitados (Cartones a generar)
                                </label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="100" 
                                        value={guestCount}
                                        onChange={(e) => setGuestCount(parseInt(e.target.value))}
                                        className="accent-pink-600 flex-1"
                                    />
                                    <span className="text-2xl font-bold w-12 text-right">{guestCount}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Step 2: Song Management */}
                {step === 2 && (
                    <motion.div 
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="glass-card">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                📋 Lista de Canciones ({songs.length})
                            </h2>

                            {songs.length === 0 && (
                              <div className="text-center py-12 text-white/40 space-y-3">
                                <Music size={48} className="mx-auto opacity-50" />
                                <p className="text-lg font-semibold">No hay canciones todavía</p>
                                <p className="text-sm">Agregá canciones manualmente abajo o volvé para importar desde Spotify/YouTube</p>
                              </div>
                            )}
                            
                            {songs.length > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                  {songs.map((song) => (
                                      <div key={song.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 group hover:bg-white/10 transition-all">
                                          <div className="overflow-hidden">
                                              <p className="font-bold truncate">{song.name}</p>
                                              <p className="text-sm text-white/50 truncate">{song.artist}</p>
                                          </div>
                                          <button 
                                              onClick={() => removeSong(song.id)}
                                              className="text-white/30 hover:text-red-500 transition-colors p-2"
                                          >
                                              <Trash2 size={18} />
                                          </button>
                                      </div>
                                  ))}
                              </div>
                            )}

                            {/* Quick add individual */}
                            <div className="flex flex-col md:flex-row gap-4 p-4 bg-white/5 rounded-2xl border border-dashed border-white/20 mb-4">
                                <input 
                                    className="flex-1"
                                    placeholder="Nombre de la canción" 
                                    value={newSongName}
                                    onChange={(e) => setNewSongName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addManualSong()}
                                />
                                <input 
                                    className="flex-1"
                                    placeholder="Artista (Opcional)" 
                                    value={newSongArtist}
                                    onChange={(e) => setNewSongArtist(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addManualSong()}
                                />
                                <button 
                                    onClick={addManualSong}
                                    className="bg-white/10 hover:bg-white/20 px-6"
                                >
                                    <Plus />
                                </button>
                            </div>

                            {/* Bulk paste area */}
                            <details className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                              <summary className="p-4 cursor-pointer font-semibold text-sm flex items-center gap-2 hover:bg-white/5 transition-colors">
                                <ClipboardPaste size={16} className="text-purple-400" /> 
                                Carga masiva (pegar muchas canciones de una vez)
                              </summary>
                              <div className="p-4 pt-0 space-y-3">
                                <textarea
                                  className="bulk-textarea"
                                  rows={5}
                                  placeholder="Una canción por línea. Formato: Canción - Artista"
                                  value={bulkText}
                                  onChange={(e) => setBulkText(e.target.value)}
                                />
                                <button
                                  onClick={handleBulkAdd}
                                  disabled={!bulkText.trim()}
                                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                  <Plus size={18} /> Agregar {bulkText.trim() ? `${bulkText.split('\n').filter(l => l.trim()).length} canciones` : 'todas'}
                                </button>
                              </div>
                            </details>
                        </div>

                        <div className="flex gap-4">
                            <button 
                                onClick={() => setStep(1)}
                                className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 py-4"
                            >
                                Volver
                            </button>
                            <button 
                                onClick={generateBingo}
                                className="flex-[2] bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold py-4 text-xl shadow-xl shadow-cyan-500/20"
                            >
                                Generar {guestCount} Cartones
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step 3: Game Master & Print View */}
                {step === 3 && (
                    <motion.div 
                        key="step3"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-8"
                    >
                        <nav className="flex justify-between items-center mb-8 no-print">
                            <h2 className="text-3xl font-bold">Panel de Juego</h2>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => window.print()}
                                    className="bg-purple-600 hover:bg-purple-500 flex items-center gap-2"
                                >
                                    <Download size={18} /> Imprimir Cartones
                                </button>
                                <button 
                                    onClick={() => setStep(2)}
                                    className="bg-white/10 hover:bg-white/20"
                                >
                                    Cerrar Juego
                                </button>
                            </div>
                        </nav>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Host Controls */}
                            <div className="lg:col-span-1 glass-card no-print h-fit sticky top-8">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <Play size={20} className="text-cyan-400" /> Control del DJ
                                </h3>
                                <p className="text-sm text-white/50 mb-6">
                                    Marcá las canciones que van sonando. El sistema te avisará si alguien completa su cartón.
                                </p>
                                
                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                    {songs.map(song => (
                                        <button 
                                            key={song.id}
                                            onClick={() => togglePlayed(song.name)}
                                            className={`w-full text-left p-3 rounded-lg transition-all flex items-center justify-between ${
                                                playedSongs.has(song.name) 
                                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200' 
                                                : 'bg-white/5 border-transparent hover:bg-white/10'
                                            } border`}
                                        >
                                            <span className="truncate">{song.name}</span>
                                            {playedSongs.has(song.name) && <CheckCircle size={16} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bingo Boards Display */}
                            <div className="lg:col-span-2 print-boards-container">
                                {boards.map((board, idx) => {
                                    const score = checkWinner(board);
                                    if (score === 25) confetti();
                                    
                                    return (
                                        <div key={idx} className="bg-white p-2 md:p-6 shadow-2xl relative bingo-page mb-8 w-full max-w-xl mx-auto rounded-xl" style={{ boxSizing: 'border-box' }}>
                                            <div className="flex justify-between items-center mb-4 no-print text-black px-2">
                                                <h4 className="text-xl font-bold">Cartón #{idx + 1}</h4>
                                                <div>
                                                  <div className="text-[10px] uppercase tracking-widest text-black/50 mb-1 text-right font-bold">Progreso</div>
                                                  <div className="bg-gray-200 w-24 h-2 rounded-full overflow-hidden border border-black/10 shadow-inner">
                                                      <div 
                                                          className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-500"
                                                          style={{ width: `${(score / 25) * 100}%` }}
                                                      ></div>
                                                  </div>
                                                </div>
                                            </div>

                                            {/* Colorful Board */}
                                            <div className="flex flex-col overflow-hidden rounded-xl print-classic-board shadow-md" style={{ border: '4px solid black', background: 'white', padding: '0' }}>
                                                
                                                {/* Header B I N G O Colorido */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: 'white' }}>
                                                    {['B', 'I', 'N', 'G', 'O'].map((letter, i) => {
                                                      const bgHex = ['#ec4899', '#3b82f6', '#a855f7', '#22c55e', '#f97316'];
                                                      return (
                                                        <div key={`letter-${i}`} className="text-center font-black text-4xl md:text-5xl lg:text-6xl py-3 md:py-5 text-white" style={{ backgroundColor: bgHex[i], border: '2px solid black', WebkitPrintColorAdjust: 'exact', color: 'white', textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}>
                                                            {letter}
                                                        </div>
                                                      );
                                                    })}
                                                </div>

                                                {/* 5x5 Grid */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: 'white' }}>
                                                    {board.map((songName, sIdx) => {
                                                        const isPlayed = playedSongs.has(songName);

                                                        return (
                                                            <div 
                                                                key={sIdx}
                                                                className="relative flex items-center justify-center p-2 text-center text-[10px] md:text-xs xl:text-sm font-semibold leading-snug print-classic-cell"
                                                                style={{ 
                                                                    minHeight: '4.5rem', 
                                                                    backgroundColor: isPlayed ? '#f3f4f6' : 'white',
                                                                    border: '2px solid black',
                                                                    color: isPlayed ? 'rgba(0,0,0,0.5)' : 'black',
                                                                    boxSizing: 'border-box'
                                                                }}
                                                            >
                                                                {isPlayed && (
                                                                    <div className="absolute inset-0 flex items-center justify-center z-0 no-print">
                                                                       <div className="w-full h-full bg-pink-500/10 backdrop-blur-sm"></div>
                                                                    </div>
                                                                )}
                                                                <span className="z-10 inline-block px-0.5" style={{ wordBreak: 'normal', overflowWrap: 'break-word', hyphens: 'auto' }}>{songName}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            
                                            <div className="mt-4 flex justify-center items-center text-[11px] text-black/50 uppercase tracking-[0.2em] font-bold px-2">
                                                <span>Bingo Musical Oficial</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }

        .bulk-textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1rem;
          color: white;
          font-size: 0.9rem;
          font-family: 'Outfit', system-ui, sans-serif;
          resize: vertical;
          min-height: 100px;
          line-height: 1.6;
          box-sizing: border-box;
          transition: border-color 0.3s;
        }
        .bulk-textarea:focus {
          outline: none;
          border-color: #a855f7;
          background: rgba(255, 255, 255, 0.06);
        }
        .bulk-textarea::placeholder {
          color: rgba(255, 255, 255, 0.25);
        }

        @media print {
            @page {
                size: A4 portrait;
                margin: 1cm;
            }
            body { 
                background: white !important; 
                margin: 0 !important;
                padding: 0 !important;
                color: black !important;
            }
            .max-w-5xl {
                max-w: none !important;
                width: 100% !important;
            }
            .print-boards-container {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 20px !important;
                width: 100% !important;
                align-items: start;
            }
            .bingo-page {
                page-break-inside: avoid;
                margin: 0 !important;
                padding: 10px !important;
                background: white !important;
                border: none !important;
                box-shadow: none !important;
            }
            .print-classic-board {
                border: 2px solid #000 !important;
                border-radius: 0 !important;
                background: white !important;
            }
            .print-classic-cell {
                background: white !important;
                color: black !important;
                border-radius: 0 !important;
                margin: 0 !important;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
      `}</style>
    </div>
  );
}

