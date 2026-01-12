/**
 * Circular Wave Visualizer Component
 * Real-time frequency visualization with circular waveform
 */

import React, { useEffect, useRef } from 'react';

interface CircularWaveVisualizerProps {
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  isActive: boolean;
}

export const CircularWaveVisualizer: React.FC<CircularWaveVisualizerProps> = ({
  audioContext,
  mediaStream,
  isActive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!audioContext || !mediaStream || !isActive) {
      // Clear canvas when inactive
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // Create analyser node
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = Math.min(centerX, centerY) - 80;

      // Clear canvas with fade effect
      ctx.fillStyle = 'rgba(15, 15, 35, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw outer glow circle
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius - 20,
        centerX,
        centerY,
        baseRadius + 120
      );
      gradient.addColorStop(0, 'rgba(102, 126, 234, 0)');
      gradient.addColorStop(0.5, 'rgba(102, 126, 234, 0.1)');
      gradient.addColorStop(1, 'rgba(102, 126, 234, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius + 120, 0, Math.PI * 2);
      ctx.fill();

      // Draw circular waveform
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 10;
      ctx.beginPath();

      for (let i = 0; i < bufferLength; i++) {
        const angle = (i / bufferLength) * Math.PI * 2;
        const amplitude = dataArray[i] / 255;
        const r = baseRadius + amplitude * 100;

        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();
      ctx.stroke();

      // Draw center circle
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(102, 126, 234, 0.5)';
      ctx.strokeStyle = 'rgba(102, 126, 234, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw inner circle with gradient
      const innerGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        baseRadius
      );
      innerGradient.addColorStop(0, 'rgba(102, 126, 234, 0.1)');
      innerGradient.addColorStop(1, 'rgba(102, 126, 234, 0)');
      ctx.fillStyle = innerGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Calculate average amplitude for center visualization
      const avgAmplitude =
        dataArray.reduce((sum, val) => sum + val, 0) / bufferLength;

      // Draw pulsing center dot
      const pulseRadius = 8 + (avgAmplitude / 255) * 20;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ff88';
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      source.disconnect();
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
    };
  }, [audioContext, mediaStream, isActive]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        style={{
          border: '2px solid rgba(102, 126, 234, 0.3)',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      />
    </div>
  );
};
