import type { Response } from "express";

type SSEClient = Response;

/**
 * Tenant-scoped SSE rooms.
 *
 * Each tenant gets its own Set<SSEClient>. broadcast() only writes to the
 * set that matches the caller's tenantId — clients belonging to other schools
 * never receive events they are not authorised to see.
 *
 * Key guarantee: a broadcast for tenant A is mathematically unreachable by
 * any client that connected under tenant B.
 */
const rooms = new Map<number, Set<SSEClient>>();

function getRoom(tenantId: number): Set<SSEClient> {
  let room = rooms.get(tenantId);
  if (!room) {
    room = new Set();
    rooms.set(tenantId, room);
  }
  return room;
}

export function addSSEClient(tenantId: number, res: SSEClient): void {
  getRoom(tenantId).add(res);
}

export function removeSSEClient(tenantId: number, res: SSEClient): void {
  const room = rooms.get(tenantId);
  if (!room) return;
  room.delete(res);
  if (room.size === 0) rooms.delete(tenantId); // GC empty rooms
}

export function broadcast(tenantId: number, event: string, data: unknown = {}): void {
  const room = rooms.get(tenantId);
  if (!room || room.size === 0) return; // no one listening in this tenant — fast exit
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of room) {
    try {
      client.write(payload);
    } catch {
      room.delete(client); // dead connection — evict silently
    }
  }
}
