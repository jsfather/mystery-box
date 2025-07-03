'use client';

import { useEffect, useState } from 'react';
import LCD from '@/app/components/LCD';

export default function NTPClient() {
  const [serverTime, setServerTime] = useState<Date | null>(null);

  useEffect(() => {
    const syncTime = async () => {
      try {
        const res = await fetch('/api/ntp');
        const data = await res.json();
        const time = new Date(data.unix);
        setServerTime(time);
      } catch (error) {
        console.error('Failed to fetch time from server:', error);
      }
    };

    syncTime();

    const interval = setInterval(() => {
      setServerTime((prev) => {
        if (!prev) return null;
        return new Date(prev.getTime() + 1000);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!serverTime) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-stone-700" />
          <span className="text-sm text-stone-600">Syncing with server...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 text-center">
      <LCD
        lines={[
          {
            cursor: { y: 0, x: 4 },
            text: serverTime.toLocaleTimeString(undefined, { hour12: false }),
          },
          {
            cursor: { y: 1, x: 3 },
            text: serverTime.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }),
          },
        ]}
      />
    </div>
  );
}
