import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Vite exposes env in import.meta.env. Fallback to localhost for dev.
const SIGNALING_URL: string = (import.meta as any).env?.VITE_SIGNALING_URL || 'http://192.168.0.169:3001';

type Peer = {
  id: string;
  pc: RTCPeerConnection;
  stream?: MediaStream;
};

const iceServers: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }
];

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<string>('Ready');
  const [inviteCopied, setInviteCopied] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const ioOpts = useMemo(() => ({
    transports: ['websocket'],
  }), []);

  useEffect(() => {
    // Prefill room from URL and optionally auto-join
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      setRoomId(urlRoom);
    }

    const s = io(SIGNALING_URL, ioOpts);
    socketRef.current = s;

    s.on('connect', () => {
      setStatus('Signaling connected');
      // Auto-join if room present in URL
      if (urlRoom && !connected) {
        s.emit('room:join', urlRoom);
        setConnected(true);
        const url = new URL(window.location.href);
        url.searchParams.set('room', urlRoom);
        window.history.replaceState({}, '', url.toString());
      }
    });
    s.on('disconnect', () => setStatus('Signaling disconnected'));

    s.on('room:members', ({ members }: { members: string[] }) => {
      // Initiate offers to existing members
      members.forEach(async (peerId) => {
        await createPeerConnection(peerId, true);
      });
    });

    s.on('room:peer-joined', ({ peerId }: { peerId: string }) => {
      setStatus(`Peer joined: ${peerId}`);
    });

    s.on('room:peer-left', ({ peerId }: { peerId: string }) => {
      setStatus(`Peer left: ${peerId}`);
  setPeers((prev: Peer[]) => prev.filter((p: Peer) => p.id !== peerId));
    });

    s.on('webrtc:offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = await createPeerConnection(from, false);
      await peer.pc.setRemoteDescription(sdp);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      s.emit('webrtc:answer', { to: from, sdp: answer });
    });

    s.on('webrtc:answer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  const peer = peers.find((p: Peer) => p.id === from);
      if (!peer) return;
      await peer.pc.setRemoteDescription(sdp);
    });

    s.on('webrtc:ice', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
  const peer = peers.find((p: Peer) => p.id === from);
      if (!peer) return;
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (e) {
        console.error('Error adding ICE candidate', e);
      }
    });

    return () => {
      s.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createPeerConnection(peerId: string, isInitiator: boolean): Promise<Peer> {
  let peer = peers.find((p: Peer) => p.id === peerId);
    if (peer) return peer;

    const pc = new RTCPeerConnection({ iceServers });

    // On track received
    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
  setPeers((prev: Peer[]) => prev.map((p: Peer) => p.id === peerId ? { ...p, stream } : p));
    };

    // ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socketRef.current?.emit('webrtc:ice', { to: peerId, candidate: ev.candidate });
      }
    };

    // Add local tracks if sharing
    if (localStreamRef.current) {
  localStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => pc.addTrack(t, localStreamRef.current!));
    }

    const newPeer: Peer = { id: peerId, pc };
  setPeers((prev: Peer[]) => [...prev, newPeer]);

    if (isInitiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc:offer', { to: peerId, sdp: offer });
    }

    return newPeer;
  }

  async function startShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30
        },
        audio: true // Critical: tab/system audio. Chrome shows "Share tab audio"
      });
      localStreamRef.current = stream;
      setSharing(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }
      // Add tracks to all existing PCs
      peers.forEach((p: Peer) => {
        stream.getTracks().forEach((t: MediaStreamTrack) => p.pc.addTrack(t, stream));
      });
    } catch (e) {
      console.error('Error starting share', e);
      setStatus('Share failed. Ensure tab audio box is checked.');
    }
  }

  function stopShare() {
  localStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    localStreamRef.current = null;
    setSharing(false);
  }

  function joinRoom() {
    if (!roomId.trim()) return;
    socketRef.current?.emit('room:join', roomId.trim());
    setConnected(true);
    // Update URL so it can be shared/bookmarked
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId.trim());
    window.history.replaceState({}, '', url.toString());
  }

  function leaveRoom() {
    if (!roomId.trim()) return;
    socketRef.current?.emit('room:leave', roomId.trim());
    setConnected(false);
    setPeers([]);
    // Remove room from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }

  function generateRoomId() {
    // Stylish short ID: adj-noun-xxxx
    const adjectives = ['cosmic','neon','chill','vibe','rad','zen','hyper','velvet','silver','aqua'];
    const nouns = ['cinema','stream','party','session','screen','scene','studio','club','lounge','room'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const tail = Math.random().toString(36).slice(2, 6);
    const id = `${adj}-${noun}-${tail}`;
    setRoomId(id);
    return id;
  }

  async function copyInvite() {
    const url = new URL(window.location.href);
    const id = roomId.trim() || generateRoomId();
    url.searchParams.set('room', id);
    const invite = url.toString();
    try {
      await navigator.clipboard.writeText(invite);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1500);
    } catch (e) {
      console.error('Clipboard copy failed', e);
      setStatus('Copy failed. Manually share the URL shown.');
    }
  }

  return (
    <div className="min-h-screen hero-bg">
      <header className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">WatchParty</h1>
        <div className="flex items-center gap-3">
          <LiveBadge count={peers.length} connected={connected} />
          <div className="text-sm text-neutral-400">{status}</div>
        </div>
      </header>

      <main className="px-6 pb-24">
        {/* Controls */}
        <section className="max-w-5xl mx-auto grid gap-4 sm:grid-cols-[1fr_auto] items-end">
          <div className="grid gap-2">
            <label htmlFor="room" className="text-sm text-neutral-300">Room ID</label>
            <input
              id="room"
              className="px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g., my-movie-night"
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={generateRoomId} className="px-3 py-2 text-sm rounded-md bg-neutral-800 hover:bg-neutral-700">Generate</button>
              <button onClick={copyInvite} className="px-3 py-2 text-sm rounded-md bg-neutral-800 hover:bg-neutral-700">
                {inviteCopied ? 'Copied!' : 'Copy Invite Link'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 sm:justify-end">
            {!connected ? (
              <button onClick={joinRoom} className="px-4 py-3 rounded-lg bg-brand-600 hover:bg-brand-500 transition font-medium">
                Join Room
              </button>
            ) : (
              <button onClick={leaveRoom} className="px-4 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition font-medium">
                Leave Room
              </button>
            )}
            {!sharing ? (
              <button onClick={startShare} className="px-4 py-3 rounded-lg bg-brand-700 hover:bg-brand-600 transition font-medium">
                Share Tab + Audio
              </button>
            ) : (
              <button onClick={stopShare} className="px-4 py-3 rounded-lg bg-red-700 hover:bg-red-600 transition font-medium">
                Stop Sharing
              </button>
            )}
          </div>
        </section>

        {/* Local preview */}
        <section className="max-w-5xl mx-auto mt-8">
          <h2 className="text-lg font-semibold mb-3 text-neutral-300">Your Share Preview</h2>
          <div className="aspect-video rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
            <video ref={localVideoRef} className="w-full h-full object-contain" muted playsInline></video>
          </div>
          <p className="text-neutral-500 text-sm mt-2">Tip: In Chrome, pick your movie tab and tick "Share tab audio".</p>
        </section>

        {/* Remote peers grid */}
        <section className="max-w-6xl mx-auto mt-10">
          <h2 className="text-lg font-semibold mb-3 text-neutral-300">Peers</h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {peers.map((p: Peer) => (
              <div key={p.id} className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
                <PeerVideo stream={p.stream} />
                <div className="px-3 py-2 text-xs text-neutral-400 border-t border-neutral-800">{p.id}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-6 py-6 text-center text-neutral-500 text-sm">
        Built with WebRTC • Free P2P streaming • No TURN
      </footer>
    </div>
  );
}

function PeerVideo({ stream }: { stream?: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play();
    }
  }, [stream]);
  return <video ref={ref} className="w-full h-full object-contain" playsInline />;
}

function LiveBadge({ count, connected }: { count: number; connected: boolean }) {
  if (!connected) return null;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 text-xs font-medium select-none">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M7.5 6a3 3 0 1 1 3 3 3 3 0 0 1-3-3Zm-3 12a4.5 4.5 0 0 1 9 0v.75a.75.75 0 0 1-.75.75h-7.5A.75.75 0 0 1 4.5 18.75Zm11.25-3.75a2.25 2.25 0 1 0-2.25-2.25 2.25 2.25 0 0 0 2.25 2.25Zm-1.5 1.5a4.125 4.125 0 0 1 4.125 4.125.375.375 0 0 1-.375.375h-2.25a.375.375 0 0 1-.375-.375 3 3 0 0 0-2.25-2.887Z" />
      </svg>
      <span>Live {count}</span>
    </div>
  );
}
