'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function WhatsAppPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    
    setSearching(true);
    try {
      const response = await fetch('/api/whatsapp/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results);
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert("Search failed: " + err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'none' }}>&larr; Back to Dashboard</Link>
      </div>

      <h1 className="title">WhatsApp Module</h1>
      <p className="subtitle">Upload your WhatsApp export and chat with your messages.</p>

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

        {/* Search Section */}
        <div className="card" style={{ flex: '1', minWidth: '300px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>2. Semantic Search (RAG)</h3>
          
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What did we talk about yesterday?" 
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
            <button type="submit" className="btn btn-primary" disabled={searching || !query}>
              {searching ? '🔍...' : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {searchResults.map((res: any, i: number) => (
                <div key={i} style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Match: {(res._distance * 100).toFixed(1)}% | Msgs: {res.messageCount}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                    {res.text.slice(0, 300)}{res.text.length > 300 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
