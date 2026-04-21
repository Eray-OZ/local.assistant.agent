'use client';

import React, { useState, useRef, useEffect, useEffectEvent } from 'react';
import Link from 'next/link';

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string; // db uses content, UI used text. We migrate to content.
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function getResponseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.details === 'string' && data.details.trim()) return data.details;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {}

  return `Request failed with status ${response.status}`;
}

export default function WhatsAppPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [dbLoaded, setDbLoaded] = useState<boolean>(false);
  const [dbRows, setDbRows] = useState<number>(0);
  
  // Chat States
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatting, setChatting] = useState<boolean>(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load: Check DB Status & Fetch Sessions
  const loadSessions = async (autoLoad = false) => {
    try {
      const res = await fetch('/api/chats?module=whatsapp');
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
        // Only auto-load first session on initial page load
        if (autoLoad && data.sessions.length > 0) {
          loadSession(data.sessions[0].id);
        }
      }
    } catch(e) { console.error('Failed to load sessions', e); }
  };

  const loadInitialSessions = useEffectEvent(() => {
    void loadSessions(true);
  });

  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then(res => res.json())
      .then(data => {
        if (data.loaded) {
          setDbLoaded(true);
          setDbRows(data.rows);
          setStatus(`System Ready: Database detected with ${data.rows} chunks.`);
        }
      }).catch(err => console.error(err));

    loadInitialSessions();
  }, []);

  // 2. Load specific session messages
  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    try {
      const res = await fetch(`/api/chats/${id}/messages`);
      const data = await res.json();
      if (data.messages) {
        setChatLog(data.messages);
      }
    } catch(e) { console.error('Failed to load messages', e); }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setChatLog([]);
    setQuery('');
  };

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
        setDbLoaded(true);
        try {
          const statusRes = await fetch('/api/whatsapp/status');
          const statusData = await statusRes.json();
          if (statusData.loaded) {
            setDbRows(statusData.rows);
          }
        } catch {}
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error: unknown) {
      setStatus(`Failed to upload: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    const userMessage = query.trim();
    setQuery('');
    setChatting(true);
    
    // Read activeSessionId from a local snapshot so we can use it safely in async code
    let currentSessionId: string | null = activeSessionId;

    // Create session if it doesn't exist yet
    if (!currentSessionId) {
      try {
        const title = userMessage.split(' ').slice(0, 5).join(' ') + '...';
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: 'whatsapp', title })
        });
        if (!res.ok) throw new Error('Failed to create session');
        const data = await res.json();
        currentSessionId = data.session.id;
        setActiveSessionId(currentSessionId);
        // Refresh sidebar with the new session from DB
        loadSessions();
      } catch(e) {
        console.error('Failed to create session', e);
        setChatting(false);
        return;
      }
    }

    // Save User Message to SQLite
    await fetch(`/api/chats/${currentSessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: userMessage })
    });

    setChatLog(prev => [...prev, { role: 'user', content: userMessage }]);
    
    // Add empty agent message for streaming
    setChatLog(prev => [...prev, { role: 'agent', content: '' }]);

    let fullAgentResponse = "";

    try {
      const response = await fetch('/api/whatsapp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, model: 'gemma4' })
      });

      if (!response.ok) {
        throw new Error(await getResponseError(response));
      }
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let pending = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          pending += decoder.decode(value, { stream: true });
          const jsonChunks = pending.split('\n');
          pending = jsonChunks.pop() ?? '';

          for (const jsonStr of jsonChunks) {
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.response) {
                fullAgentResponse += parsed.response;
                setChatLog(prev => {
                  const newLog = [...prev];
                  const lastIndex = newLog.length - 1;
                  newLog[lastIndex] = { ...newLog[lastIndex], content: fullAgentResponse };
                  return newLog;
                });
              }
            } catch {}
          }
        }
      }

      if (pending.trim()) {
        try {
          const parsed = JSON.parse(pending);
          if (parsed.response) {
            fullAgentResponse += parsed.response;
            setChatLog(prev => {
              const newLog = [...prev];
              const lastIndex = newLog.length - 1;
              newLog[lastIndex] = { ...newLog[lastIndex], content: fullAgentResponse };
              return newLog;
            });
          }
        } catch {}
      }

      // Save complete Agent Message to SQLite
      await fetch(`/api/chats/${currentSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'agent', content: fullAgentResponse })
      });

    } catch (err: unknown) {
      setChatLog(prev => {
        const newLog = [...prev];
        newLog[newLog.length - 1].content = `[Error: ${getErrorMessage(err)}]`;
        return newLog;
      });
    } finally {
      setChatting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '1400px' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'none' }}>&larr; Back to Dashboard</Link>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', height: '85vh' }}>
        
        {/* Sidebar: Chat Sessions */}
        <div className="card" style={{ width: '280px', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          <button 
            onClick={handleNewChat}
            className="btn btn-primary" 
            style={{ width: '100%', marginBottom: '1rem', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)' }}
          >
            + Yeni Sohbet
          </button>
          
          <h4 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Geçmiş Sohbetler
          </h4>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sessions.length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Henüz sohbet yok.</span>
            ) : (
              sessions.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => loadSession(s.id)}
                  style={{ 
                    padding: '0.75rem', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    background: activeSessionId === s.id ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: activeSessionId === s.id ? '3px solid var(--primary)' : '3px solid transparent',
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {s.title}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
          
          {/* Top Banner for DB Loading */}
          {dbLoaded ? (
            <div style={{ background: 'var(--bg-hover)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>✅</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>Veritabanı Aktif ({dbRows} blok)</span>
              </div>
              <div>
                 <input type="file" accept=".txt" onChange={handleFileChange} style={{ fontSize: '0.75rem', width: '180px' }} />
                 <button onClick={handleUpload} disabled={!file || loading} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--primary)', border: 'none', color: '#11111b', cursor: 'pointer' }}>
                   {loading ? '...' : 'Üstüne Yaz'}
                 </button>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(243, 139, 168, 0.1)', border: '1px solid #f38ba8', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <p style={{ color: '#f38ba8', marginBottom: '0.5rem', margin: 0 }}>⚠️ WhatsApp veritabanı boş. Lütfen sohbet geçmişinizi (.txt) yükleyin.</p>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                 <input type="file" accept=".txt" onChange={handleFileChange} style={{ color: 'var(--text)' }} />
                 <button onClick={handleUpload} disabled={!file || loading} className="btn btn-primary" style={{ padding: '0.25rem 1rem' }}>
                   {loading ? 'İşleniyor...' : 'Yükle'}
                 </button>
              </div>
            </div>
          )}

          {status ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              {status}
            </div>
          ) : null}

          {/* Chat Transcript */}
          <div style={{ 
              flex: 1, 
              background: 'rgba(0,0,0,0.2)', 
              borderRadius: '8px', 
              padding: '1.5rem', 
              overflowY: 'auto', 
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem'
            }}>
             {chatLog.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'auto', maxWidth: '400px' }}>
                    <h3>Tüm Hatıralarınız Burada</h3>
                    <p>Ne aramak istediğinizi yazın. RAG destekli AI asistanınız sizin için bulup özetleyecektir.</p>
                </div>
             ) : (
                chatLog.map((log, i) => (
                    <div key={i} style={{ 
                        alignSelf: log.role === 'user' ? 'flex-end' : 'flex-start',
                        background: log.role === 'user' ? 'var(--primary)' : 'var(--bg-hover)',
                        color: log.role === 'user' ? '#11111b' : 'var(--text)',
                        padding: '1rem 1.25rem',
                        borderRadius: '16px',
                        borderBottomRightRadius: log.role === 'user' ? '4px' : '16px',
                        borderBottomLeftRadius: log.role === 'agent' ? '4px' : '16px',
                        maxWidth: '85%',
                        whiteSpace: 'pre-wrap',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        lineHeight: '1.5'
                    }}>
                        {log.content}
                    </div>
                ))
             )}
             <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleChat} style={{ display: 'flex', gap: '0.75rem' }}>
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sohbete bir şeyler yazın..." 
              style={{
                flex: 1,
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.3)',
                color: 'var(--text)',
                outline: 'none',
                fontSize: '1rem'
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={chatting || !query.trim()} style={{ padding: '0 2rem', borderRadius: '12px' }}>
              {chatting ? '...' : 'Gönder'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
