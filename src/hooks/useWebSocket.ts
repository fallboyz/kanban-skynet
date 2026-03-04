'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsEvent } from '@/types';

function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:4000/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
const WS_URL = getWsUrl();

const RECONNECT_DELAY_MS = 3000;
const BATCH_INTERVAL_MS = 50;

export function useWebSocket(
  onEvent: (event: WsEvent) => void,
  onReconnect?: () => void,
): {
  isConnected: boolean;
} {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  const unmountedRef = useRef(false);
  const hasConnectedRef = useRef(false);

  // Event batching: collect WS events and flush in a single microtask
  const batchRef = useRef<WsEvent[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useCallback(() => {
    batchTimerRef.current = null;
    const events = batchRef.current;
    if (events.length === 0) return;
    batchRef.current = [];
    for (const event of events) {
      onEventRef.current(event);
    }
  }, []);

  const enqueueEvent = useCallback((event: WsEvent) => {
    batchRef.current.push(event);
    batchTimerRef.current ??= setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }, [flushBatch]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      let ws: WebSocket;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) return;
        if (hasConnectedRef.current) {
          onReconnectRef.current?.();
        }
        hasConnectedRef.current = true;
        setIsConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as WsEvent;
          enqueueEvent(data);
        } catch {
          // ignore unparseable messages
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setIsConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      if (unmountedRef.current) return;
      timerRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (batchTimerRef.current !== null) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enqueueEvent]);

  return { isConnected };
}
