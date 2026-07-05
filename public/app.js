let movieData = [];
let activeFilter = 'all'; // 'all' or 'upgrades'
let currentRematchIndex = null;

// DOM Elements
const scanPathInput = document.getElementById('scan-path-input');
const scanBtn = document.getElementById('scan-btn');
const browseBtn = document.getElementById('browse-btn');
const movieTbody = document.getElementById('movie-tbody');
const searchInput = document.getElementById('search-input');
const filterAll = document.getElementById('filter-all');
const filterUpgrades = document.getElementById('filter-upgrades');
const resolutionFilter = document.getElementById('resolution-filter');

// Stats Elements
const statTotalMovies = document.getElementById('stat-total-movies');
const statUpgradable = document.getElementById('stat-upgradable');
const statStorage = document.getElementById('stat-storage');

// Modal Elements
const searchModal = document.getElementById('search-modal');
const closeModal = document.getElementById('close-modal');
const modalFilename = document.getElementById('modal-filename');
const modalTitleInput = document.getElementById('modal-title-input');
const modalYearInput = document.getElementById('modal-year-input');
const modalSearchBtn = document.getElementById('modal-search-btn');
const modalResults = document.getElementById('modal-results');

// Initial Load: Scan default directory
window.addEventListener('DOMContentLoaded', () => {
  performScan('');
});

// Scan Button click
scanBtn.addEventListener('click', () => {
  performScan(scanPathInput.value.trim());
});

// Trigger scan on pressing Enter key in input box
scanPathInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    performScan(scanPathInput.value.trim());
  }
});

// Click folder picker button to trigger native Windows Folder Browser dialog
browseBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/select-folder');
    const data = await response.json();
    if (data.path) {
      scanPathInput.value = data.path;
      performScan(data.path);
    }
  } catch (error) {
    console.error('Error selecting folder:', error);
  }
});

// Perform folder scan
async function performScan(customPath) {
  showLoading();
  try {
    const url = customPath ? `/api/movies?path=${encodeURIComponent(customPath)}` : '/api/movies';
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      movieData = data.movies;
      scanPathInput.value = data.scanPath;
      updateStats();
      renderMovies();
    } else {
      movieData = [];
      updateStats();
      showError(data.error || 'Failed to scan the folder.');
    }
  } catch (error) {
    movieData = [];
    updateStats();
    showError('Network error connecting to scanner server.');
    console.error(error);
  }
}

// Show loading indicator in table
function showLoading() {
  movieTbody.innerHTML = `
    <tr>
      <td colspan="6" class="loading-state">
        <i class="fa-solid fa-circle-notch fa-spin spinner"></i>
        <p>Scanning directory and analyzing files... This may take a moment.</p>
      </td>
    </tr>
  `;
}

// Show error message in table
function showError(message) {
  movieTbody.innerHTML = `
    <tr>
      <td colspan="6" class="empty-state">
        <i class="fa-solid fa-triangle-exclamation spinner" style="color: var(--accent-yellow);"></i>
        <p style="margin-top: 1rem;">${message}</p>
      </td>
    </tr>
  `;
}

// Calculate and render statistics
function updateStats() {
  statTotalMovies.textContent = movieData.length;
  
  const upgradableCount = movieData.filter(m => m.yts && m.yts.upgradable).length;
  statUpgradable.textContent = upgradableCount;

  const totalBytes = movieData.reduce((acc, m) => acc + (m.sizeBytes || 0), 0);
  const gb = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
  statStorage.textContent = `${gb} GB`;
}

// Format duration to readable hours & minutes
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

// Format byte sizes to readable units (MB/GB)
function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Get resolution badge class name
function getResClass(resText) {
  const t = resText.toLowerCase();
  if (t.includes('2160') || t.includes('4k')) return 'res-4k';
  if (t.includes('1080')) return 'res-1080p';
  if (t.includes('720')) return 'res-720p';
  return 'res-sd';
}

// Filter and Search logic
searchInput.addEventListener('input', renderMovies);
resolutionFilter.addEventListener('change', renderMovies);

filterAll.addEventListener('click', () => {
  filterAll.classList.add('active');
  filterUpgrades.classList.remove('active');
  activeFilter = 'all';
  renderMovies();
});

filterUpgrades.addEventListener('click', () => {
  filterUpgrades.classList.add('active');
  filterAll.classList.remove('active');
  activeFilter = 'upgrades';
  renderMovies();
});

// Render the main dashboard list in table form
function renderMovies() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedResolution = resolutionFilter.value; // 'all', '2160p', '1080p', '720p', 'sd'
  
  const filtered = movieData.filter(movie => {
    // 1. Text filter
    const matchesSearch = 
      movie.filename.toLowerCase().includes(searchTerm) ||
      movie.parsedTitle.toLowerCase().includes(searchTerm);

    // 2. Tab filter (Upgrades)
    let matchesTab = true;
    if (activeFilter === 'upgrades') {
      matchesTab = movie.yts && movie.yts.upgradable;
    }

    // 3. Resolution filter
    let matchesResolution = true;
    if (selectedResolution !== 'all') {
      const localRes = (movie.metadata.resolutionText || '').toLowerCase();
      if (selectedResolution === 'sd') {
        // SD is any resolution that is not 720p, 1080p, or 4k
        matchesResolution = !localRes.includes('720p') && !localRes.includes('1080p') && !localRes.includes('2160p') && !localRes.includes('4k');
      } else {
        matchesResolution = localRes.includes(selectedResolution);
      }
    }

    return matchesSearch && matchesTab && matchesResolution;
  });

  if (filtered.length === 0) {
    movieTbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <i class="fa-solid fa-folder-open spinner" style="font-size: 2.5rem; color: var(--text-secondary);"></i>
          <p style="margin-top: 1rem;">No movies matched your current filters.</p>
        </td>
      </tr>
    `;
    return;
  }

  movieTbody.innerHTML = filtered.map((movie, index) => {
    const localRes = movie.metadata.resolutionText || 'Unknown';
    const localResClass = getResClass(localRes);

    // YTS section
    let ytsStatusHtml = '';
    let actionBtnHtml = '';

    if (movie.yts && movie.yts.matched) {
      const yts = movie.yts;
      if (yts.upgradable && yts.betterOption) {
        ytsStatusHtml = `
          <div class="table-upgrade-badge available">
            <span class="pulse-icon"><i class="fa-solid fa-arrow-trend-up animate-pulse"></i> Upgrade to ${yts.betterOption.quality}</span>
            <div class="torrent-micro-stats">
              <span>Size: ${yts.betterOption.size}</span>
              <span class="seeds"><i class="fa-solid fa-circle-up"></i> ${yts.betterOption.seeds}</span>
            </div>
          </div>
        `;
        actionBtnHtml = `
          <div class="table-actions">
            <a href="${yts.betterOption.url}" class="table-btn table-btn-download" title="Download Torrent" target="_blank">
              <i class="fa-solid fa-circle-down"></i> Torrent
            </a>
            <button class="table-btn table-btn-match" onclick="openRematchModal(${index})" title="Fix Match">
              <i class="fa-solid fa-pen-to-square"></i> Match
            </button>
          </div>
        `;
      } else {
        ytsStatusHtml = `
          <div class="table-upgrade-badge optimal">
            <span><i class="fa-solid fa-circle-check"></i> Optimal (Rating: ${yts.rating})</span>
          </div>
        `;
        actionBtnHtml = `
          <div class="table-actions">
            <a href="${yts.ytsUrl}" class="table-btn table-btn-view" target="_blank" title="View YTS Details">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> View YTS
            </a>
            <button class="table-btn table-btn-match" onclick="openRematchModal(${index})" title="Fix Match">
              <i class="fa-solid fa-pen-to-square"></i> Match
            </button>
          </div>
        `;
      }
    } else {
      ytsStatusHtml = `
        <div class="table-upgrade-badge no-match">
          <span><i class="fa-solid fa-question"></i> No YTS Match</span>
        </div>
      `;
      actionBtnHtml = `
        <div class="table-actions">
          <button class="table-btn table-btn-search" onclick="openRematchModal(${index})" title="Manual Search">
            <i class="fa-solid fa-magnifying-glass"></i> Search YTS
          </button>
        </div>
      `;
    }

    const coverHtml = (movie.yts && movie.yts.matched && movie.yts.cover) 
      ? `<img src="${movie.yts.cover}" alt="Cover" class="table-movie-cover">`
      : `<div class="table-movie-cover-placeholder">
           <i class="fa-solid fa-film"></i>
         </div>`;

    return `
      <tr>
        <td>
          <div class="table-movie-info-cell">
            ${coverHtml}
            <div class="table-movie-text">
              <span class="table-movie-title" title="${movie.filename}">${movie.parsedTitle}</span>
              <span class="table-movie-year">${movie.parsedYear ? movie.parsedYear : 'Year Unknown'}</span>
              <span class="table-movie-filename">${movie.filename}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${localResClass}">${localRes}</span>
        </td>
        <td>
          <span class="table-duration">${formatDuration(movie.metadata.duration)}</span>
        </td>
        <td>
          <div class="table-file-info">
            <span class="codec-badge">${movie.metadata.codec.toUpperCase()}</span>
            <span class="size-text">${formatBytes(movie.sizeBytes)}</span>
          </div>
        </td>
        <td>
          ${ytsStatusHtml}
        </td>
        <td>
          ${actionBtnHtml}
        </td>
      </tr>
    `;
  }).join('');
}

// Rematch Modal functions
function openRematchModal(index) {
  const movie = movieData[index];
  currentRematchIndex = index;
  modalFilename.textContent = movie.filename;
  modalTitleInput.value = movie.parsedTitle;
  modalYearInput.value = movie.parsedYear || '';
  modalResults.innerHTML = '';
  
  searchModal.classList.add('active');
  triggerModalSearch();
}

closeModal.addEventListener('click', () => {
  searchModal.classList.remove('active');
});

// Close modal when clicking outside of modal content
window.addEventListener('click', (e) => {
  if (e.target === searchModal) {
    searchModal.classList.remove('active');
  }
});

modalSearchBtn.addEventListener('click', triggerModalSearch);

async function triggerModalSearch() {
  const title = modalTitleInput.value.trim();
  const year = modalYearInput.value.trim();
  const movie = movieData[currentRematchIndex];

  if (!title) return;

  modalResults.innerHTML = '<div style="text-align: center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching...</div>';

  try {
    let url = `/api/search-yts?title=${encodeURIComponent(title)}&localResolution=${movie.metadata.resolutionText}`;
    if (year) {
      url += `&year=${year}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.matched) {
      modalResults.innerHTML = `
        <p style="font-size: 0.85rem; color: var(--text-secondary);">Found Match:</p>
        <div class="search-result-item" onclick="applyRematch(${JSON.stringify(data).replace(/"/g, '&quot;')})">
          <img src="${data.cover}" alt="Cover">
          <div class="result-info">
            <h4>${data.title}</h4>
            <p>Rating: ${data.rating}/10 | Genres: ${data.genres.join(', ')}</p>
            <p style="color: var(--accent-green); margin-top: 0.25rem;">Click to apply this match</p>
          </div>
        </div>
      `;
    } else {
      modalResults.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">No YTS matches found for this query.</div>';
    }
  } catch (error) {
    modalResults.innerHTML = '<div style="text-align: center; color: var(--accent-yellow);">Error conducting search.</div>';
  }
}

// Apply selected YTS match details to local movie details array
function applyRematch(ytsData) {
  if (currentRematchIndex !== null) {
    movieData[currentRematchIndex].yts = ytsData;
    updateStats();
    renderMovies();
    searchModal.classList.remove('active');
  }
}
