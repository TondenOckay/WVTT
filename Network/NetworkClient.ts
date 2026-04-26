// src/Network/NetworkClient.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';

interface PacketDef {
  packetId: number;
  packetName: string;
  maxSizeBytes: number;
  // … other fields as needed (logging, etc.)
}

const packetDefs = new Map<number, PacketDef>();
const handlers   = new Map<number, (data: Uint8Array) => void>();
let socket: WebSocket | null = null;

async function Load() {
  const response = await fetch('Network/Packet.csv');
  const csvText = await response.text();
  const rows = parseCsvArray(csvText);

  for (const row of rows) {
    if (row['enabled'] !== '1') continue;
    const id = parseInt(row['packet_id']);
    const name = row['packet_name'];
    const maxSize = parseInt(row['max_size_bytes'] || '4096');
    packetDefs.set(id, { packetId: id, packetName: name, maxSizeBytes: maxSize });
    // Handlers will be registered separately by their modules via registerPacketHandler
  }
  console.log(`[NetworkClient] Loaded ${packetDefs.size} packet definitions`);
}

function Connect(url: string) {
  socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  socket.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    if (data.length < 1) return;
    const packetId = data[0];
    const handler = handlers.get(packetId);
    if (handler) {
      handler(data.slice(1)); // pass payload without ID byte
    }
  };
}

function Send(packetId: number, payload: Uint8Array) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const frame = new Uint8Array(payload.length + 1);
  frame[0] = packetId;
  frame.set(payload, 1);
  socket.send(frame);
}

// Registration API (called by other modules)
function registerPacketHandler(packetId: number, fn: (data: Uint8Array) => void) {
  handlers.set(packetId, fn);
}

// Scheduler methods
registerSystemMethod('SETUE.Network.NetworkClient', 'Load', Load);
registerSystemMethod('SETUE.Network.NetworkClient', 'Connect', () => Connect('ws://localhost:7777'));

export { Send, registerPacketHandler };
