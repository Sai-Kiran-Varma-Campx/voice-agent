import { useEffect, useState } from 'react';

interface VoiceWaveformProps {
  isActive: boolean;
  variant: 'listening' | 'responding';
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function VoiceWaveform({ isActive, variant }: VoiceWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(12).fill(20));

  useEffect(() => {
    if (!isActive) {
      setBars(Array(12).fill(20));
      return;
    }

    const interval = setInterval(() => {
      setBars((prev) => prev.map(() => Math.random() * 60 + 20));
    }, 100);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <div className="waveform-container">
      <div
        className={cn(
          'waveform-glow',
          variant === 'listening' && 'waveform-glow-listening',
          variant === 'responding' && 'waveform-glow-responding'
        )}
      />

      <div className="waveform-bars">
        {bars.map((height, i) => (
          <div
            key={i}
            className={cn(
              'waveform-bar',
              variant === 'listening' && 'waveform-bar-listening',
              variant === 'responding' && 'waveform-bar-responding'
            )}
            style={{
              height: isActive ? `${height}%` : '20%',
              opacity: isActive ? 1 : 0.4,
            }}
          />
        ))}
      </div>

      {isActive && (
        <div className="waveform-ring-container">
          <div
            className={cn(
              'waveform-ring',
              variant === 'listening' && 'waveform-ring-listening',
              variant === 'responding' && 'waveform-ring-responding'
            )}
          />
        </div>
      )}
    </div>
  );
}
