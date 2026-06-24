import type { Server } from 'bun';

export interface WsData {
  sessionId: string;
  userId: string;
  displayName: string;
  avatarSeed: string;
  boardId: string;
}

export type WsEvent =
  | { type: 'presence'; userId: string; name: string; avatarSeed: string }
  | { type: 'absence'; userId: string }
  | { type: 'roster'; users: Array<{ userId: string; name: string; avatarSeed: string }> }
  | { type: 'board-refresh'; triggeredBy?: string };

export class RealtimeServiceImpl {
  private server: Pick<Server<WsData>, 'publish' | 'subscriberCount'> | null = null;

  init(server: Pick<Server<WsData>, 'publish' | 'subscriberCount'>) {
    this.server = server;
  }

  reset() {
    this.server = null;
  }

  isReady(): boolean {
    return this.server !== null;
  }

  broadcastHtml(boardId: string, html: string): void {
    if (!boardId) {
      console.warn('[realtime] broadcastHtml called with empty boardId — skipping');
      return;
    }
    if (!this.server) {
      console.warn('[realtime] broadcastHtml called before init — skipping');
      return;
    }
    try {
      this.server.publish(`board:${boardId}`, html);
    } catch (err) {
      console.error('[realtime] broadcastHtml failed', err);
    }
  }

  broadcastEvent(boardId: string, event: WsEvent): void {
    if (!boardId) {
      console.warn('[realtime] broadcastEvent called with empty boardId — skipping');
      return;
    }
    if (!this.server) {
      console.warn('[realtime] broadcastEvent called before init — skipping');
      return;
    }
    try {
      this.server.publish(`board:${boardId}`, JSON.stringify(event));
    } catch (err) {
      console.error('[realtime] broadcastEvent failed', err);
    }
  }

  broadcastRefresh(boardId: string, triggeredBy?: string): void {
    if (!boardId) {
      console.warn('[realtime] broadcastRefresh called with empty boardId — skipping');
      return;
    }
    this.broadcastEvent(boardId, { type: 'board-refresh', triggeredBy });
  }

  getViewerCount(boardId: string): number {
    if (!boardId || !this.server) return 0;
    return this.server.subscriberCount(`board:${boardId}`);
  }
}

export const realtime = new RealtimeServiceImpl();
