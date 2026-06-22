import type { Response } from "express";

type SSEClient = Response;

const clients = new Set<SSEClient>();

export function addSSEClient(res: SSEClient): void {
  clients.add(res);
}

export function removeSSEClient(res: SSEClient): void {
  clients.delete(res);
}

export function broadcast(event: string, data: unknown = {}): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}
