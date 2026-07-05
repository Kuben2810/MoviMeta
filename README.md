# CineSync - Movie Resolution Dashboard & Upgrader

CineSync is a modern, premium dark-theme web dashboard that scans your local movie folders, extracts resolution and media metadata, and matches files against the YTS database to identify available high-resolution upgrades.

![Dashboard Preview](https://raw.githubusercontent.com/Kuben2810/MoviMeta/main/public/index.html) *(Preview your dashboard live at http://localhost:3000)*

---

## 🚀 Key Features

*   **⚡ Blazing Fast Scans (Caching)**: Saves scan results in a local `cine_cache.json` file inside the movie directories. Subsequent scans run instantaneously, checking only for newly added or modified directories.
*   **📂 Native Windows Folder Picker**: Tap the folder browser button to natively open the Windows Folder Select dialog and choose your media drives.
*   **🔍 Recursive Scanning**: Searches up to 2 levels deep (root folder + direct subdirectories) to detect nested movies correctly.
*   **🎭 Dynamic YTS Matches**: Queries `yts.mx` dynamically, compares local files against available versions, and suggests direct downloads when a higher resolution (e.g. 1080p, 4K) is available.
*   **🏷️ Filter & Search**: Instantly search by title or filter results by specific resolutions (4K, 1080p, 720p, SD) or pending upgrades.
*   **🛠️ Manual Rematch**: Incorrectly parsed file titles can be searched and rematched manually directly inside the web UI.

---

## 🛠️ Setup & Running

To run the application locally on your Windows machine:

1.  **Clone or Download** this repository.
2.  Open the project folder and double-click **`run.bat`** (or open PowerShell in the directory and run `node server.js`).
3.  Open your web browser and navigate to:
    👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📦 Requirements

*   [Node.js](https://nodejs.org/) (v16+)
*   [FFmpeg/FFprobe](https://ffmpeg.org/) (Must be installed and available on your system's PATH. Note: This is used to probe local video resolution metadata).

---

## 📂 Project Architecture

```bash
├── public/                 # Frontend Web Assets
│   ├── index.html          # Web application structure
│   ├── style.css           # Custom glassmorphism stylesheet
│   └── app.js              # Client state, event listeners & API fetches
├── server.js               # Node.js Express server & REST API
├── select_folder.ps1       # Native Windows PowerShell folder picker helper
├── run.bat                 # Click-to-run Windows launcher
└── package.json            # Node.js dependencies (Express, Axios)
```
