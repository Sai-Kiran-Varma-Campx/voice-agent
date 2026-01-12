import React from 'react';
import './App.css';
import { CircularWaveVisualizer } from './components/CircularWaveVisualizer';
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
    sendEndOfTurn,
    isConnected,
    isListening,
    isSpeaking,
  } = useGeminiSession();

  const getStatusColor = () => {
    switch (connectionState) {
      case 'disconnected':
        return '#ff4444';
      case 'connecting':
        return '#ffaa00';
      case 'connected':
        return '#44ff44';
      case 'listening':
        return '#00aaff';
      case 'speaking':
        return '#aa00ff';
      default:
        return '#888888';
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
        return 'Listening...';
      case 'speaking':
        return 'AI Speaking...';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🎙️ Gemini Live Speech-to-Speech</h1>
          <p className="subtitle">
            Real-time voice conversation with AI using WebRTC
          </p>
          <div className="protocol-badge">WebRTC + Gemini Live API</div>

          <div
            className="status-badge"
            style={{
              backgroundColor: `${getStatusColor()}22`,
              color: getStatusColor(),
              border: `2px solid ${getStatusColor()}`,
            }}
          >
            <span className="status-dot" style={{ backgroundColor: getStatusColor() }} />
            {getStatusText()}
            {sessionId && <span className="session-id"> • {sessionId.slice(0, 8)}</span>}
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </header>

        <main className="main-content">
          <CircularWaveVisualizer
            audioContext={audioContext}
            mediaStream={mediaStream}
            isActive={isConnected}
          />

          <div className="controls">
            {!isConnected ? (
              <button className="btn btn-primary" onClick={startSession}>
                🚀 Start Conversation
              </button>
            ) : (
              <div className="control-group">
                {isSpeaking && (
                  <button className="btn btn-warning" onClick={interrupt}>
                    ⏸️ Interrupt AI
                  </button>
                )}
                <button className="btn btn-danger" onClick={endSession}>
                  🛑 End Session
                </button>
              </div>
            )}
          </div>

          <div className="instructions">
            <h3>How to use:</h3>
            <ol>
              <li>Click Start Conversation to begin</li>
              <li>Allow microphone access when prompted</li>
              <li>Speak naturally - AI listens and responds automatically</li>
              <li>AI responds after 1.5 seconds of silence</li>
              <li>While AI is speaking, click Interrupt to stop</li>
              <li>Click End Session when done</li>
            </ol>
            <p className="tech-stack">
              <strong>Tech Stack:</strong> React + TypeScript + WebSocket + Gemini Live API
            </p>
          </div>
        </main>

        <footer className="footer">
          <p>
            Audio: 16kHz mono PCM (input) → 24kHz mono PCM (output) •
            Low-latency bidirectional streaming
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
