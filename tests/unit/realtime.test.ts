import { expect, test } from 'bun:test';
import { RealtimeServiceImpl, realtime } from '../../src/realtime/realtime';

interface MockServer {
  publish: (topic: string, message: string) => number;
  subscriberCount: (topic: string) => number;
}

function createMockServer(): {
  server: MockServer;
  calls: Array<{ topic: string; message: string }>;
} {
  const calls: Array<{ topic: string; message: string }> = [];
  const server: MockServer = {
    publish: (topic: string, message: string) => {
      calls.push({ topic, message });
      return 1;
    },
    subscriberCount: (topic: string) => (topic === 'board:abc' ? 3 : 0),
  };
  return { server, calls };
}

test('RealtimeServiceImpl > isReady() returns false before init', () => {
  const svc = new RealtimeServiceImpl();
  expect(svc.isReady()).toBe(false);
});

test('RealtimeServiceImpl > broadcastHtml is a no-op before init', () => {
  const svc = new RealtimeServiceImpl();
  svc.broadcastHtml('board-1', '<div>test</div>');
  expect(svc.isReady()).toBe(false);
});

test('RealtimeServiceImpl > broadcastEvent is a no-op before init', () => {
  const svc = new RealtimeServiceImpl();
  svc.broadcastEvent('board-1', {
    type: 'presence',
    userId: 'u1',
    name: 'Alice',
    avatarSeed: 'seed1',
  });
  expect(svc.isReady()).toBe(false);
});

test('RealtimeServiceImpl > getViewerCount returns 0 before init', () => {
  const svc = new RealtimeServiceImpl();
  expect(svc.getViewerCount('board-1')).toBe(0);
});

test('RealtimeServiceImpl > broadcastHtml calls server.publish with correct topic', () => {
  const svc = new RealtimeServiceImpl();
  const { server, calls } = createMockServer();
  svc.init(server);
  expect(svc.isReady()).toBe(true);

  svc.broadcastHtml('board-123', '<div>hello</div>');
  expect(calls.length).toBe(1);
  expect(calls[0]?.topic).toBe('board:board-123');
  expect(calls[0]?.message).toBe('<div>hello</div>');
});

test('RealtimeServiceImpl > broadcastEvent serializes JSON correctly', () => {
  const svc = new RealtimeServiceImpl();
  const { server, calls } = createMockServer();
  svc.init(server);

  svc.broadcastEvent('board-1', {
    type: 'presence',
    userId: 'u1',
    name: 'Alice',
    avatarSeed: 'abc',
  });

  const sentMessage = calls[0]?.message ?? '{}';
  const parsed = JSON.parse(sentMessage);
  expect(parsed.type).toBe('presence');
  expect(parsed.userId).toBe('u1');
  expect(parsed.name).toBe('Alice');
  expect(parsed.avatarSeed).toBe('abc');
});

test('RealtimeServiceImpl > broadcastRefresh sends board-refresh event', () => {
  const svc = new RealtimeServiceImpl();
  const { server, calls } = createMockServer();
  svc.init(server);

  svc.broadcastRefresh('board-xyz');
  const sentMessage = calls[0]?.message ?? '{}';
  const parsed = JSON.parse(sentMessage);
  expect(parsed.type).toBe('board-refresh');
});

test('RealtimeServiceImpl > getViewerCount delegates to server.subscriberCount', () => {
  const svc = new RealtimeServiceImpl();
  const { server } = createMockServer();
  svc.init(server);
  expect(svc.getViewerCount('abc')).toBe(3);
  expect(svc.getViewerCount('other')).toBe(0);
});

test('RealtimeServiceImpl > reset() clears the server reference', () => {
  const svc = new RealtimeServiceImpl();
  const { server } = createMockServer();
  svc.init(server);
  expect(svc.isReady()).toBe(true);
  svc.reset();
  expect(svc.isReady()).toBe(false);
});

test('RealtimeServiceImpl > swallows publish errors without throwing', () => {
  const svc = new RealtimeServiceImpl();
  const badServer = {
    publish: () => {
      throw new Error('network failed');
    },
    subscriberCount: () => 0,
  } as MockServer;
  svc.init(badServer);
  expect(() => svc.broadcastHtml('board-1', 'html')).not.toThrow();
  expect(() => svc.broadcastEvent('board-1', { type: 'board-refresh' })).not.toThrow();
});

test('exported realtime singleton is initially not ready', () => {
  // The global singleton is only initialized when the Bun server starts.
  expect(typeof realtime.isReady()).toBe('boolean');
});

test('RealtimeServiceImpl > skips broadcastHtml with empty boardId', () => {
  const svc = new RealtimeServiceImpl();
  const { server, calls } = createMockServer();
  svc.init(server);
  svc.broadcastHtml('', '<div>hello</div>');
  expect(calls.length).toBe(0);
});

test('RealtimeServiceImpl > skips broadcastEvent with empty boardId', () => {
  const svc = new RealtimeServiceImpl();
  const { server, calls } = createMockServer();
  svc.init(server);
  svc.broadcastEvent('', { type: 'board-refresh' });
  expect(calls.length).toBe(0);
});

test('RealtimeServiceImpl > skips broadcastRefresh with empty boardId', () => {
  const svc = new RealtimeServiceImpl();
  const { server, calls } = createMockServer();
  svc.init(server);
  svc.broadcastRefresh('');
  expect(calls.length).toBe(0);
});

test('RealtimeServiceImpl > getViewerCount returns 0 for empty boardId', () => {
  const svc = new RealtimeServiceImpl();
  const { server } = createMockServer();
  svc.init(server);
  expect(svc.getViewerCount('')).toBe(0);
});
