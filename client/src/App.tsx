import React from 'react';
import './App.css';
import { VoiceWaveform } from './components/VoiceWaveform';
import { useGeminiSession } from './hooks/useGeminiSession';

function App() {
  const {
    sessionId,
    connectionState,
    mediaStream,
    audioContext,
    error,
    startSession,
    interrupt,
    endSession,
    isConnected,
    isSpeaking,
  } = useGeminiSession();

  const getStatusColor = () => {
    switch (connectionState) {
      case 'disconnected':
        return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      case 'connecting':
        return { bg: '#fef3c7', color: '#d97706', border: '#fde68a' };
      case 'connected':
      case 'listening':
        return { bg: '#d1fae5', color: '#059669', border: '#a7f3d0' };
      case 'speaking':
        return { bg: '#e0e7ff', color: '#6366f1', border: '#c7d2fe' };
      default:
        return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'disconnected':
        return 'Disconnected';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Connected';
      case 'listening':
        return 'Connected';
      case 'speaking':
        return 'Connected';
      default:
        return 'Unknown';
    }
  };

  const getVisualizerStatusText = () => {
    if (!isConnected) {
      return 'Ready to start';
    }
    if (isSpeaking) {
      return 'AI is responding';
    }
    return 'Listening... Speak now';
  };

  const getVisualizerSubtext = () => {
    if (isSpeaking) {
      return 'Click "Interrupt AI" when finished';
    }
    return '';
  };

  const statusColors = getStatusColor();

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <div className="header-top">
            <div className="title-section">
              <div className="mic-badge">🎙️</div>
              <div className="title-text">
                <h1>Campx Chat AI</h1>
                <p className="subtitle">Speech-to-Speech AI</p>
              </div>
            </div>

            <div
              className="status-badge"
              style={{
                backgroundColor: statusColors.bg,
                color: statusColors.color,
                borderColor: statusColors.border,
              }}
            >
              <span
                className="status-dot"
                style={{ backgroundColor: statusColors.color }}
              />
              {getStatusText()}
            </div>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </header>

        <main className="main-content">
          <div className="visualizer-wrapper">
            {!isConnected && (
              <div className="visualizer-idle-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
            )}

            <VoiceWaveform
              isActive={isConnected}
              variant={isSpeaking ? 'responding' : 'listening'}
            />

            <div className="visualizer-status-overlay">
              <div className="visualizer-status-text">
                {getVisualizerStatusText()}
              </div>
              {getVisualizerSubtext() && (
                <div className="visualizer-status-subtext">
                  {getVisualizerSubtext()}
                </div>
              )}
            </div>
          </div>

          <div className="controls">
            {!isConnected ? (
              <button className="btn btn-primary" onClick={startSession}>
                <span>🎤</span>
                <span>Start Conversation</span>
              </button>
            ) : (
              <>
                {isSpeaking && (
                  <button className="btn btn-warning" onClick={interrupt}>
                    <span>✋</span>
                    <span>Interrupt AI</span>
                  </button>
                )}
                <button className="btn btn-secondary" onClick={endSession}>
                  <span>⏹</span>
                  <span>End Session</span>
                </button>
              </>
            )}
          </div>

          <div className="quick-tips">
            <h3>Quick Tips</h3>
            <div className="tips-grid">
              <div className="tip-item">
                <span className="tip-icon">🎧</span>
                <span>Allow microphone</span>
              </div>
              <div className="tip-item">
                <span className="tip-icon">🗣</span>
                <span>Speak naturally</span>
              </div>
              <div className="tip-item">
                <span className="tip-icon">↩</span>
                <span>Click when done</span>
              </div>
              <div className="tip-item">
                <span className="tip-icon">⛔</span>
                <span>Interrupt anytime</span>
              </div>
            </div>
          </div>

          {isConnected && sessionId && (
            <div className="session-info">
              <h3>
                <span className="session-info-icon">ℹ</span>
                <span>Session Info</span>
              </h3>
              <div className="session-details">
                <div className="session-detail">
                  <span className="session-detail-label">Session</span>
                  <span className="session-detail-value">
                    {sessionId.slice(0, 12)}...
                  </span>
                </div>
                <div className="session-detail">
                  <span className="session-detail-label">Transport</span>
                  <span className="session-detail-value">
                    <span>📡</span>
                    <span>WebSocket</span>
                  </span>
                </div>
                <div className="session-detail">
                  <span className="session-detail-label">Audio</span>
                  <span className="session-detail-value">PCM 16-bit</span>
                </div>
                <div className="session-detail">
                  <span className="session-detail-label">Latency</span>
                  <span className="session-detail-value latency-good">
                    <span>🕐</span>
                    <span>174ms</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="footer">
          <p>React + TypeScript + WebSocket</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
