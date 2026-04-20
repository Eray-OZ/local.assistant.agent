'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export default function WhatsAppPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  
  // Chat States
  const [query, setQuery] = useState<string>('');
  const [chatLog, setChatLog] = useState<{role: 'user' | 'agent', text: string}[]>([]);
  const [chatting, setChatting] = useState<boolean>(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus('Processing local embeddings (This may take a minute for large files)...');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/whatsapp/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (response.ok) {
        setStatus(`Success: ${data.message}`);
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setStatus(`Failed to upload: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    const userMessage = query.trim();
    setChatLog(prev => [...prev, { role: 'user', text: userMessage }]);
    setQuery('');
    setChatting(true);
    
    // Add empty agent message to stream into
    setChatLog(prev => [...prev, { role: 'agent', text: '' }]);

    try {
      const response = await fetch('/api/whatsapp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, model: 'gemma4' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch chat");
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          
          // Ollama sends JSON objects separated by newlines
          const jsonChunks = chunkStr.split('\n').filter(Boolean);
          for (const jsonStr of jsonChunks) {
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.response) {
                setChatLog(prev => {
                  const newLog = [...prev];
                  const lastIndex = newLog.length - 1;
                  newLog[lastIndex] = { 
                      ...newLog[lastIndex], 
                      text: newLog[lastIndex].text + parsed.response 
                  };
                  return newLog;
                });
              }
            } catch (err) {
               // ignore parse errors for partial chunks
            }
          }
        }
      }
    } catch (err: any) {
      setChatLog(prev => {
        const newLog = [...prev];
        newLog[newLog.length - 1].text = `[Error: ${err.message}]`;
        return newLog;
      });
    } finally {
      setChatting(false);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'none' }}>&larr; Back to Dashboard</Link>
      </div>

      <h1 className="title">WhatsApp Module</h1>
      <p className="subtitle">Upload your WhatsApp export and chat with your messages entirely locally.</p>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* Upload Section */}
        <div className="card" style={{ flex: '1', minWidth: '300px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>1. Import Data</h3>
          <div className="upload-area" style={{ padding: '2rem' }}>
            <span className="upload-icon">💬</span>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Select WhatsApp .txt export.
            </p>
            <input 
              type="file" 
              accept=".txt" 
              onChange={handleFileChange}
              style={{ display: 'block', margin: '0 auto', color: 'var(--text)' }}
            />
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleUpload} 
              disabled={!file || loading}
            >
              {loading ? 'Embedding...' : 'Upload & Process'}
            </button>
          </div>

          {status && (
            <div 
              className={status.includes('Success') ? 'badge-success' : ''} 
              style={{ 
                marginTop: '1.5rem', 
                textAlign: 'center', 
                color: status.includes('Error') || status.includes('Failed') ? '#f38ba8' : undefined 
              }}
            >
              {status}
            </div>
          )}
        </div>

        {/* Generative Chat Section */}
        <div className="card" style={{ flex: '2', minWidth: '400px', display: 'flex', flexDirection: 'column', height: '600px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>2. AI Chat (RAG)</h3>
            <span style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px', color: 'var(--primary)' }}>Model: gemma4</span>
          </div>
          
          <div style={{ 
              flex: 1, 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '8px', 
              padding: '1rem', 
              overflowY: 'auto', 
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
             {chatLog.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>
                    Aramak istediğiniz konuyu yazın. WhatsApp geçmişinizle eşleştirilip size cevap olarak dönülecektir.
                </div>
             ) : (
                chatLog.map((log, i) => (
                    <div key={i} style={{ 
                        alignSelf: log.role === 'user' ? 'flex-end' : 'flex-start',
                        background: log.role === 'user' ? 'var(--primary)' : 'var(--bg-hover)',
                        color: log.role === 'user' ? '#11111b' : 'var(--text)',
                        padding: '0.75rem 1rem',
                        borderRadius: '12px',
                        maxWidth: '80%',
                        whiteSpace: 'pre-wrap',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        {log.text}
                    </div>
                ))
             )}
             <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleChat} style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Geçen hafta proje hakkında ne konuştuk?" 
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.2)',
                color: 'var(--text)',
                outline: 'none'
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={chatting || !query.trim()}>
              {chatting ? '...' : 'Send'}
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
}
