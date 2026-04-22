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
  content: string;
}

interface Document {
  id: number;
  filename: string | null;
  file_hash: string;
  total_chunks: number;
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
  
  // Document States
  const [availableDocs, setAvailableDocs] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [showDocs, setShowDocs] = useState<boolean>(false);
  
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
        if (data.documents) {
          setAvailableDocs(data.documents);
        }
      }).catch(err => console.error(err));

    loadInitialSessions();
  }, []);

  // 2. Load specific session messages and documents
  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    try {
      const [messagesRes, docsRes] = await Promise.all([
        fetch(`/api/chats/${id}/messages`),
        fetch(`/api/chats/${id}/documents`)
      ]);
      
      const messagesData = await messagesRes.json();
      const docsData = await docsRes.json();
      
      if (messagesData.messages) {
        setChatLog(messagesData.messages);
      }
      if (docsData.available) {
        setAvailableDocs(docsData.available);
      }
      if (docsData.selected) {
        setSelectedDocs(docsData.selected.map((d: Document) => d.id));
      }
    } catch(e) { console.error('Failed to load session', e); }
  };

  // Toggle document selection
  const toggleDocument = async (jobId: number) => {
    if (!activeSessionId) {
      alert('Once bir sohbet secin veya yeni olusturun');
      return;
    }
    
    const isSelected = selectedDocs.includes(jobId);
    const action = isSelected ? 'remove' : 'add';
    
    try {
      const res = await fetch(`/api/chats/${activeSessionId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action })
      });
      
      if (res.ok) {
        if (isSelected) {
          setSelectedDocs(prev => prev.filter(id => id !== jobId));
        } else {
          setSelectedDocs(prev => [...prev, jobId]);
        }
      }
    } catch(e) { console.error('Failed to toggle document', e); }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setChatLog([]);
    setQuery('');
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    
    try {
      const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeSessionId === id) {
          setActiveSessionId(null);
          setChatLog([]);
        }
        loadSessions();
      }
    } catch (e) {
      console.error('Failed to delete session', e);
    }
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
          if (statusData.documents) {
            setAvailableDocs(statusData.documents);
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
        body: JSON.stringify({ message: userMessage, model: 'gemma4', sessionId: currentSessionId })
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
    <div className="container" style={{ maxWidth: '1400px', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/" className="nav-link" style={{ marginBottom: '1rem', display: 'inline-flex' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </Link>
        <div className="section-header" style={{ marginTop: '1rem', marginBottom: 0 }}>
          <div className="section-title">WhatsApp</div>
          <div className="section-subtitle">Search through your chat history</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        
        {/* Sidebar */}
        <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Documents Toggle */}
          <div className="card" style={{ padding: '1rem' }}>
            <div 
              onClick={() => setShowDocs(!showDocs)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
                  Documents
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {selectedDocs.length} of {availableDocs.length} selected
                </div>
              </div>
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                style={{ 
                  transform: showDocs ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  color: 'var(--text-secondary)'
                }}
              >
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
            
            {showDocs && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {availableDocs.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    No documents imported yet.
                  </span>
                ) : (
                  availableDocs.map(doc => (
                    <label 
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: selectedDocs.includes(doc.id) ? 'var(--bg-hover)' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(doc.id)}
                        onChange={() => toggleDocument(doc.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ 
                        fontSize: '0.75rem', 
                        color: selectedDocs.includes(doc.id) ? 'var(--text)' : 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {doc.filename || `Export ${doc.id}`}
                      </span>
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                        {doc.total_chunks} chunks
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Status Card */}
          <div className="card" style={{ padding: '1rem' }}>
            {dbLoaded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: 'var(--success)' 
                }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
                    Database Active
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {dbRows.toLocaleString()} chunks indexed
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)', marginBottom: '0.5rem' }}>
                  No data loaded
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Upload your WhatsApp chat export to get started.
                </p>
              </div>
            )}
            
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input 
                type="file" 
                accept=".txt" 
                onChange={handleFileChange}
                style={{ fontSize: '0.75rem', flex: 1, minWidth: 0 }}
              />
              <button 
                onClick={handleUpload} 
                disabled={!file || loading}
                className="btn btn-primary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', flexShrink: 0 }}
              >
                {loading ? '...' : 'Import'}
              </button>
            </div>
          </div>

          {/* Sessions */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Chats
              </span>
              <button 
                onClick={handleNewChat}
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              >
                New
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {sessions.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No chats yet.</span>
              ) : (
                sessions.map(s => (
                  <div 
                    key={s.id} 
                    onClick={() => loadSession(s.id)}
                    style={{ 
                      padding: '0.625rem 0.75rem', 
                      borderRadius: 'var(--radius-sm)', 
                      cursor: 'pointer',
                      background: activeSessionId === s.id ? 'var(--bg-active)' : 'transparent',
                      color: activeSessionId === s.id ? 'var(--text)' : 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'all 0.15s ease',
                      border: '1px solid transparent',
                      borderColor: activeSessionId === s.id ? 'var(--border-active)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    <button
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      title="Delete chat"
                      style={{
                        padding: '0.25rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.4,
                        transition: 'all 0.15s ease',
                        borderRadius: '4px',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.color = 'var(--error)';
                        e.currentTarget.style.background = 'var(--error-bg)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.4';
                        e.currentTarget.style.color = 'var(--text)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          
          {/* Messages */}
          <div style={{ 
              flex: 1, 
              background: 'var(--bg)', 
              padding: '1.5rem', 
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
             {chatLog.length === 0 ? (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  textAlign: 'center'
                }}>
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '12px', 
                    background: 'var(--bg-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                    fontSize: '1.5rem',
                    fontWeight: 600
                  }}>
                    W
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text)', marginBottom: '0.5rem' }}>
                    Start a conversation
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                    Ask about your messages. Try: "What did we discuss last week?" or "Find messages about dinner plans."
                  </p>
                </div>
             ) : (
                chatLog.map((log, i) => (
                  <div key={i} style={{ 
                      alignSelf: log.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%'
                  }}>
                    <div style={{
                      background: log.role === 'user' ? 'var(--primary)' : 'var(--bg-card)',
                      color: log.role === 'user' ? 'var(--bg)' : 'var(--text)',
                      padding: '0.875rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.9375rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      border: log.role === 'user' ? 'none' : '1px solid var(--border)'
                    }}>
                      {log.content ? (
                        log.content
                      ) : chatting && i === chatLog.length - 1 && log.role === 'agent' ? (
                        <span style={{ 
                          color: 'var(--text-muted)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem' 
                        }}>
                          <span style={{
                            width: '4px',
                            height: '4px',
                            background: 'var(--text-muted)',
                            borderRadius: '50%',
                            animation: 'pulse 1.4s ease-in-out infinite'
                          }} />
                          <span style={{
                            width: '4px',
                            height: '4px',
                            background: 'var(--text-muted)',
                            borderRadius: '50%',
                            animation: 'pulse 1.4s ease-in-out infinite 0.2s'
                          }} />
                          <span style={{
                            width: '4px',
                            height: '4px',
                            background: 'var(--text-muted)',
                            borderRadius: '50%',
                            animation: 'pulse 1.4s ease-in-out infinite 0.4s'
                          }} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
             )}
             <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ 
            padding: '1rem 1.5rem', 
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)'
          }}>
            <form onSubmit={handleChat} style={{ display: 'flex', gap: '0.75rem' }}>
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about your messages..."
                disabled={chatting}
                className="input"
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)'
                }}
              />
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={chatting || !query.trim()}
                style={{ padding: '0 1.25rem' }}
              >
                {chatting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                  </span>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                )}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
