type EventListener = (data: string) => void;

const orgListeners = new Map<string, Set<EventListener>>();

export function subscribeOrgEvents(orgId: string, listener: EventListener) {
  if (!orgListeners.has(orgId)) {
    orgListeners.set(orgId, new Set());
  }
  orgListeners.get(orgId)!.add(listener);
  return () => orgListeners.get(orgId)?.delete(listener);
}

export function emitOrgEvent(orgId: string, event: string, payload: Record<string, unknown>) {
  const data = JSON.stringify({ event, payload, ts: Date.now() });
  orgListeners.get(orgId)?.forEach((listener) => listener(data));
}
