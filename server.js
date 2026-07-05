const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static dashboard files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Explicit home route to guarantee serving index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper to check if a file is a video by extension
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm', '.flv', '.wmv']);
function isVideoFile(filename) {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// Clean filename to extract Movie Title and Year
function parseMovieFilename(filename) {
  const ext = path.extname(filename);
  let nameWithoutExt = path.basename(filename, ext);

  // Replace common separators with spaces
  nameWithoutExt = nameWithoutExt.replace(/[\._\-]/g, ' ');

  // Try to find a 4-digit year (between 1900 and 2030)
  const yearMatch = nameWithoutExt.match(/\b(19\d\d|20[0-2]\d)\b/);
  let title = nameWithoutExt;
  let year = null;

  if (yearMatch) {
    year = parseInt(yearMatch[0], 10);
    // Title is everything before the year
    const index = nameWithoutExt.indexOf(yearMatch[0]);
    if (index > 0) {
      title = nameWithoutExt.substring(0, index);
    }
  } else {
    // If no year, clean up common video tags
    const tags = [
      /\b1080p\b/i, /\b720p\b/i, /\b2160p\b/i, /\b4k\b/i, /\bbluray\b/i,
      /\bwebrip\b/i, /\bdvdrip\b/i, /\bx264\b/i, /\bh264\b/i, /\bx265\b/i,
      /\bhevc\b/i, /\byify\b/i, /\bweb-dl\b/i, /\bhdrip\b/i
    ];
    for (const tag of tags) {
      const match = title.match(tag);
      if (match && match.index > 0) {
        title = title.substring(0, match.index);
      }
    }
  }

  // Clean double spaces and trim
  title = title.replace(/\s+/g, ' ').trim();
  
  return { title, year };
}

// Run ffprobe command to get resolution & metadata
function getMetadata(filePath) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,duration,bit_rate -show_entries format=size,format_name -of json "${filePath.replace(/"/g, '\\"')}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error probing ${filePath}:`, stderr);
        // Fallback info if ffprobe fails
        return resolve({
          width: 0,
          height: 0,
          resolutionText: 'Unknown',
          codec: 'Unknown',
          duration: 0,
          size: 0,
          bitrate: 0
        });
      }

      try {
        const data = JSON.parse(stdout);
        const stream = data.streams && data.streams[0] ? data.streams[0] : {};
        const format = data.format || {};

        const width = stream.width || 0;
        const height = stream.height || 0;

        let resolutionText = 'Unknown';
        if (width >= 3840 || height >= 2160) {
          resolutionText = '2160p (4K)';
        } else if (width >= 1920 || height >= 1080) {
          resolutionText = '1080p (FHD)';
        } else if (width >= 1280 || height >= 720) {
          resolutionText = '720p (HD)';
        } else if (width > 0 && height > 0) {
          resolutionText = `${height}p (SD)`;
        }

        resolve({
          width,
          height,
          resolutionText,
          codec: stream.codec_name || 'Unknown',
          duration: parseFloat(stream.duration || format.duration || 0),
          size: parseInt(format.size || 0, 10),
          bitrate: parseInt(stream.bit_rate || format.bit_rate || 0, 10)
        });
      } catch (e) {
        console.error(`Failed to parse ffprobe output for ${filePath}:`, e);
        resolve({
          width: 0,
          height: 0,
          resolutionText: 'Unknown',
          codec: 'Unknown',
          duration: 0,
          size: 0,
          bitrate: 0
        });
      }
    });
  });
}

// Convert quality labels to rank for comparison
function getResolutionRank(qualityText) {
  const q = qualityText.toLowerCase();
  if (q.includes('2160') || q.includes('4k')) return 3;
  if (q.includes('1080')) return 2;
  if (q.includes('720')) return 1;
  return 0; // SD or Unknown
}

// Fetch suggestion from YTS
async function fetchYtsSuggestion(title, year, localResolutionText) {
  try {
    // Search query on YTS
    const query = year ? `${title} ${year}` : title;
    const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=5`;
    const response = await axios.get(url, { timeout: 8000 });

    if (response.data && response.data.status === 'ok' && response.data.data.movie_count > 0) {
      const movies = response.data.data.movies;
      // Try to find the closest matching movie.
      // If we have a year, filter or prioritize that year.
      let bestMovie = movies[0];
      if (year) {
        const exactYearMatch = movies.find(m => m.year === year);
        if (exactYearMatch) bestMovie = exactYearMatch;
      }

      // Collect available qualities and find the best one
      const localRank = getResolutionRank(localResolutionText);
      let bestTorrent = null;
      let highestRank = localRank;

      bestMovie.torrents.forEach(torrent => {
        const rank = getResolutionRank(torrent.quality);
        if (rank > highestRank) {
          highestRank = rank;
          bestTorrent = torrent;
        }
      });

      return {
        matched: true,
        title: bestMovie.title_long,
        imdbCode: bestMovie.imdb_code,
        ytsUrl: bestMovie.url,
        rating: bestMovie.rating,
        cover: bestMovie.medium_cover_image,
        genres: bestMovie.genres || [],
        upgradable: bestTorrent !== null,
        betterOption: bestTorrent ? {
          quality: bestTorrent.quality,
          type: bestTorrent.type,
          size: bestTorrent.size,
          seeds: bestTorrent.seeds,
          peers: bestTorrent.peers,
          url: bestTorrent.url
        } : null,
        allOptions: bestMovie.torrents.map(t => ({
          quality: t.quality,
          size: t.size,
          seeds: t.seeds,
          peers: t.peers,
          url: t.url
        }))
      };
    }
  } catch (error) {
    console.error(`YTS search failed for "${title}":`, error.message);
  }

  return { matched: false };
}

// Helper to recursively find video files (max depth 1 level down, i.e., root + direct subdirectories)
function findVideoFiles(dirPath, currentDepth = 0, maxDepth = 1) {
  let results = [];
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && isVideoFile(item)) {
        results.push(fullPath);
      } else if (stat.isDirectory() && currentDepth < maxDepth) {
        results = results.concat(findVideoFiles(fullPath, currentDepth + 1, maxDepth));
      }
    }
  } catch (e) {
    console.error(`Error reading path ${dirPath}:`, e.message);
  }
  return results;
}

// Scan local directory endpoint
app.get('/api/movies', async (req, res) => {
  let scanPath = req.query.path || process.cwd();

  // Strip wrapping quotes and trim
  scanPath = scanPath.replace(/^["']|["']$/g, '').trim();

  if (!scanPath) {
    scanPath = process.cwd();
  }

  if (!fs.existsSync(scanPath)) {
    return res.status(400).json({ error: `Path does not exist: "${scanPath}"` });
  }

  try {
    const videoFilePaths = findVideoFiles(scanPath, 0, 1);
    const cacheFilePath = path.join(scanPath, 'cine_cache.json');
    
    // Load existing cache if present
    const cacheMap = new Map();
    if (fs.existsSync(cacheFilePath)) {
      try {
        const rawCache = fs.readFileSync(cacheFilePath, 'utf8');
        const cachedMovies = JSON.parse(rawCache);
        if (Array.isArray(cachedMovies)) {
          cachedMovies.forEach(movie => {
            if (movie.filePath) {
              cacheMap.set(movie.filePath, movie);
            }
          });
        }
        console.log(`Loaded ${cacheMap.size} cached items for scan path "${scanPath}"`);
      } catch (cacheErr) {
        console.warn('Error reading cine_cache.json, cache will be ignored:', cacheErr.message);
      }
    }

    // Run scans in parallel, reusing cached entries if file metadata (size, mtime) matches
    const promises = videoFilePaths.map(async (fullPath) => {
      try {
        const file = path.basename(fullPath);
        const stats = fs.statSync(fullPath);
        
        // Check cache
        const cached = cacheMap.get(fullPath);
        if (cached && cached.sizeBytes === stats.size && cached.mtimeMs === stats.mtimeMs) {
          return cached;
        }

        // Cache miss (new or modified file): Extract metadata and match YTS
        const parsed = parseMovieFilename(file);
        const meta = await getMetadata(fullPath);
        const ytsData = await fetchYtsSuggestion(parsed.title, parsed.year, meta.resolutionText);

        return {
          filename: file,
          filePath: fullPath,
          parsedTitle: parsed.title,
          parsedYear: parsed.year,
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs, // Save modification time to check validity later
          metadata: meta,
          yts: ytsData
        };
      } catch (err) {
        console.error(`Failed parsing file ${fullPath}:`, err);
        return null;
      }
    });

    const results = (await Promise.all(promises)).filter(r => r !== null);

    // Save scan result to cache file for next scan
    try {
      fs.writeFileSync(cacheFilePath, JSON.stringify(results, null, 2), 'utf8');
    } catch (saveErr) {
      console.error('Failed to write cine_cache.json:', saveErr.message);
    }

    res.json({
      scanPath,
      movies: results
    });
  } catch (err) {
    console.error('Scan failed:', err);
    res.status(500).json({ error: 'Failed to scan directory: ' + err.message });
  }
});

// Single movie manual YTS lookup endpoint (useful if search query was parsed incorrectly)
app.get('/api/search-yts', async (req, res) => {
  const { title, year, localResolution } = req.query;
  if (!title) {
    return res.status(400).json({ error: 'Title parameter is required' });
  }

  const ytsData = await fetchYtsSuggestion(title, year ? parseInt(year, 10) : null, localResolution || 'Unknown');
  res.json(ytsData);
});

// Windows Native Folder Picker endpoint
app.get('/api/select-folder', (req, res) => {
  const scriptPath = path.join(__dirname, 'select_folder.ps1');
  const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;

  exec(psCommand, (err, stdout, stderr) => {
    if (err) {
      console.error('Error selecting folder:', err);
      return res.status(500).json({ error: 'Failed to open folder picker' });
    }
    const selectedPath = stdout.trim();
    if (selectedPath) {
      res.json({ path: selectedPath });
    } else {
      res.json({ path: null }); // user cancelled
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
