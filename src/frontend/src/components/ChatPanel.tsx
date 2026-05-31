import { useState, useRef, useEffect, type FormEvent } from 'react';
import { apiClient } from '../api/client';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await apiClient.sendAgentQuery(trimmed);
      const agentMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: response.message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, agentMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 380,
        height: 500,
        border: '1px solid #ddd',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #eee',
          fontWeight: 'bold',
        }}
      >
        Cost Guardian Agent
      </div>

      {/* Message History */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 && (
          <p style={{ color: '#999', textAlign: 'center', marginTop: 40 }}>
            Ask me about your AWS costs, resources, or optimization suggestions.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.role === 'user' ? '#0088FE' : '#f0f0f0',
              color: msg.role === 'user' ? '#fff' : '#333',
              padding: '8px 12px',
              borderRadius: 8,
              maxWidth: '80%',
              wordBreak: 'break-word',
            }}
          >
            {msg.content}
          </div>
        ))}
        {isProcessing && (
          <div style={{ alignSelf: 'flex-start', color: '#999', fontStyle: 'italic' }}>
            Agent is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        style={{
          display: 'flex',
          borderTop: '1px solid #eee',
          padding: 8,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your AWS costs..."
          disabled={isProcessing}
          aria-label="Chat message input"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          style={{ marginLeft: 8, padding: '8px 16px', borderRadius: 6 }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
