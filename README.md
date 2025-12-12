# WatchParty (Free P2P Watch Party)

A stylish, modern watch party site using WebRTC P2P streaming. Share a Chrome tab with audio to your friends—no TURN, no server-side media, only a lightweight signaling server.

## What’s inside
- Backend: Node.js + Express + Socket.IO signaling server (`server/`)
- Frontend: Vite + React + TypeScript + TailwindCSS (`client/`)
- WebRTC: STUN-only NAT traversal (Google STUN)
- Features:
  - Generate human-readable room IDs
  - Copy invite link with `?room=...` URL
  - Auto-join when `?room` is present
  - Responsive, modern dark UI

## Prerequisites
- Node.js 18+ installed
- Chrome/Edge (for tab audio via getDisplayMedia)
- Windows PowerShell (commands below use PowerShell syntax)

## Quick start (local dev)
Run backend and frontend together. In two PowerShell terminals:

### Terminal 1 — Signaling server
```powershell
Set-Location -Path c:\Projects\WatchParty\server
# Install deps (first time)
npm install
# Start dev server
npm run dev
# -> http://localhost:3001
```

### Terminal 2 — Frontend
```powershell
Set-Location -Path c:\Projects\WatchParty\client
# Install deps (first time)
npm install
# Start Vite dev server
npm run dev
# -> http://localhost:5173
```

Open http://localhost:5173 in Chrome.

## Using the app
1. Generate a room ID or type your own in the input.
2. Click “Copy Invite Link” and share it with friends (contains `?room=...`).
3. Click “Join Room”. The header shows a “Live X” badge (X = peer count).
4. Click “Share Tab + Audio” and choose your movie tab.
   - IMPORTANT: Check the “Share tab audio” box.
5. Friends open the invite link and join the same room.

Tip: For best audio reliability, play the movie directly in a Chrome tab (drag-and-drop MP4 or an online source), then share that tab.

## Configuration
### Frontend (.env)
- `client/.env` controls the signaling server URL:
  ```env
  VITE_SIGNALING_URL=http://localhost:3001
  ```
- See `client/.env.example` for samples.

### Backend (.env)
- `server/.env` controls the signaling server settings:
  ```env
  PORT=3001
  ORIGIN=http://localhost:5173
  ```
- See `server/.env.example` for samples.

## Build and preview
- Backend:
```powershell
Set-Location -Path c:\Projects\WatchParty\server
npm run build
npm start
```
- Frontend:
```powershell
Set-Location -Path c:\Projects\WatchParty\client
npm run build
npm run preview
# -> http://localhost:4173
```

## Deploy (free-tier ideas)
- Backend (signaling): Render, Fly.io, Glitch
  - Ensure WebSocket support is enabled.
  - Set `ORIGIN` to your frontend domain.
- Frontend: Vercel, Netlify, GitHub Pages
  - Set `VITE_SIGNALING_URL` to your signaling server URL.

## Notes
- No TURN server used (keeps it free). Most home networks work fine via STUN.
- The signaling server does not handle media—only offers/answers/ICE.
- In-memory room tracking (small groups). If the server restarts, peers should rejoin.

## Troubleshooting
- Can’t hear audio: Make sure you shared the tab and checked “Share tab audio.”
- Corporate/firewall networks: Some may block direct P2P—without TURN, connection may fail.
- Mixed content: If you deploy the site on HTTPS, host signaling on HTTPS too.

## Project structure
```
WatchParty/
├─ server/               # Node.js Socket.IO signaling
│  ├─ src/index.ts
│  ├─ package.json
│  └─ tsconfig.json
└─ client/               # Vite React + Tailwind frontend
   ├─ src/ui/App.tsx
   ├─ src/main.tsx
   ├─ src/styles.css
   ├─ index.html
   ├─ package.json
   └─ tailwind.config.js
```

Enjoy your watch party! 🎬🍿