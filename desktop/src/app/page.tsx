import Link from 'next/link';

export default function Home() {
  return (
    <div className="container">
      <h1 className="title">Personal Assistant</h1>
      <p className="subtitle">Fully on-device AI assistant. Private, fast, secure.</p>

      <div className="grid-cards">
        <Link href="/whatsapp" className="card">
          <div className="card-title">📱 WhatsApp Agent</div>
          <p style={{ color: 'var(--text-muted)' }}>
            Import your chat exports. Ask questions locally using Ollama/MLX.
          </p>
        </Link>
        
        <Link href="/notes" className="card">
          <div className="card-title">📝 Apple Notes Agent</div>
          <p style={{ color: 'var(--text-muted)' }}>
            Import your notes. Semantic search and conversational Q&A.
          </p>
        </Link>
        
        <Link href="/emails" className="card">
          <div className="card-title">📧 Gmail Agent</div>
          <p style={{ color: 'var(--text-muted)' }}>
            Connect to Gmail API for smart sorting and quick replies.
          </p>
        </Link>
        
        <Link href="/search" className="card" style={{ padding: '2px', background: 'linear-gradient(45deg, var(--primary), var(--success))' }}>
          <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '10px', height: '100%' }}>
            <div className="card-title" style={{ color: 'var(--success)' }}>✨ Unified Search</div>
            <p style={{ color: 'var(--text-muted)' }}>
              Ask anything. The agent routes your question to the right module.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
