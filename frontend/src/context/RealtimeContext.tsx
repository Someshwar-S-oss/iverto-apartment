import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useRole } from './RoleContext';
import {
  playRingChime,
  playAllowChime,
  playDenyChime,
} from '../components/real-time/SoundEffects';
import type { EntryEvent, SubjectType, DeliveryPlatform } from '../api/types';

export interface IncomingApprovalEvent {
  approvalId: string;
  entryEventId: string;
  unitId: string;
  subjectType?: SubjectType | string;
  visitorName?: string;
  visitorPhone?: string;
  platform?: DeliveryPlatform | string;
  expiresAt?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface ApprovalDecidedEvent {
  approvalId: string;
  entryEventId: string;
  status: 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED' | 'EXPIRED' | string;
  unitId?: string;
  visitorName?: string;
  decidedByUserId?: string;
  decidedAt?: string;
  mode?: string;
  [key: string]: any;
}

export interface DeviceHeartbeatEvent {
  deviceId?: string;
  serialNo?: string;
  status?: string;
  lastSeenAt?: string;
  [key: string]: any;
}

export interface RealtimeEvent<T = any> {
  name: string;
  data: T;
  timestamp: number;
}

export interface RealtimeContextType {
  socket: Socket | null;
  isConnected: boolean;
  lastEvent: RealtimeEvent | null;
  incomingApproval: IncomingApprovalEvent | null;
  latestEntryEvent: EntryEvent | null;
  deviceHeartbeats: Record<string, DeviceHeartbeatEvent>;
  emitEvent: (eventName: string, payload?: any) => void;
  clearIncomingApproval: () => void;
  on: (eventName: string, handler: (...args: any[]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, isAuthenticated } = useAuth();
  const { activeContext } = useRole();

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [incomingApproval, setIncomingApproval] = useState<IncomingApprovalEvent | null>(null);
  const [latestEntryEvent, setLatestEntryEvent] = useState<EntryEvent | null>(null);
  const [deviceHeartbeats, setDeviceHeartbeats] = useState<Record<string, DeviceHeartbeatEvent>>({});

  const socketRef = useRef<Socket | null>(null);

  const clearIncomingApproval = useCallback(() => {
    setIncomingApproval(null);
  }, []);

  const emitEvent = useCallback((eventName: string, payload?: any) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(eventName, payload);
    }
  }, []);

  const on = useCallback((eventName: string, handler: (...args: any[]) => void) => {
    const s = socketRef.current;
    if (s) {
      s.on(eventName, handler);
    }
    return () => {
      if (s) {
        s.off(eventName, handler);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setIncomingApproval(null);
      setLatestEntryEvent(null);
      setDeviceHeartbeats({});
      return;
    }

    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      import.meta.env.VITE_API_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '');

    const unitId = activeContext?.unitId || (activeContext?.type === 'UNIT' ? activeContext.id : undefined);
    const gateId = activeContext?.gateId || (activeContext?.type === 'GATE' ? activeContext.id : undefined);
    const societyId =
      activeContext?.societyId ||
      (activeContext?.type === 'SOCIETY' ? activeContext.id : undefined);

    const socketInstance: Socket = io(wsUrl, {
      auth: {
        token,
        userId: user?.id,
        unitId,
        gateId,
        societyId,
      },
      query: {
        userId: user?.id || '',
        unitId: unitId || '',
        gateId: gateId || '',
        societyId: societyId || '',
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    // 1. Approval Requested event
    socketInstance.on('approval.requested', (data: IncomingApprovalEvent) => {
      setLastEvent({ name: 'approval.requested', data, timestamp: Date.now() });
      setIncomingApproval(data);
      playRingChime();
    });

    // 2. Approval Decided event
    socketInstance.on('approval.decided', (data: ApprovalDecidedEvent) => {
      setLastEvent({ name: 'approval.decided', data, timestamp: Date.now() });

      const isApproved =
        data.status === 'APPROVED' ||
        data.status === 'AUTO_APPROVED' ||
        data.mode === 'ALLOW_TO_DOOR' ||
        data.mode === 'LEAVE_AT_GATE';

      if (isApproved) {
        playAllowChime();
      } else {
        playDenyChime();
      }

      setIncomingApproval((current) => {
        if (
          current &&
          (current.approvalId === data.approvalId || current.entryEventId === data.entryEventId)
        ) {
          return null;
        }
        return current;
      });
    });

    // 3. Gate Entry Live Stream
    socketInstance.on('gate.event', (data: EntryEvent) => {
      setLastEvent({ name: 'gate.event', data, timestamp: Date.now() });
      setLatestEntryEvent(data);
    });

    // 4. Device Heartbeat
    socketInstance.on('device.heartbeat', (data: DeviceHeartbeatEvent) => {
      setLastEvent({ name: 'device.heartbeat', data, timestamp: Date.now() });
      const deviceKey = data.deviceId || data.serialNo;
      if (deviceKey) {
        setDeviceHeartbeats((prev) => ({
          ...prev,
          [deviceKey]: data,
        }));
      }
    });

    // 5. Staff Movement Status
    socketInstance.on('staff.status', (data: any) => {
      setLastEvent({ name: 'staff.status', data, timestamp: Date.now() });
    });

    // 6. Direct Delivery events
    socketInstance.on('entry.delivery', (data: any) => {
      setLastEvent({ name: 'entry.delivery', data, timestamp: Date.now() });
    });

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
    };
  }, [
    isAuthenticated,
    token,
    user?.id,
    activeContext?.type,
    activeContext?.id,
    activeContext?.unitId,
    activeContext?.gateId,
    activeContext?.societyId,
  ]);

  return (
    <RealtimeContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        lastEvent,
        incomingApproval,
        latestEntryEvent,
        deviceHeartbeats,
        emitEvent,
        clearIncomingApproval,
        on,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = (): RealtimeContextType => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};

export default RealtimeContext;
