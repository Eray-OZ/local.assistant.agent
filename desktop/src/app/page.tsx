import Link from 'next/link';

export default function Home() {
  return (
    <div className="container">
      <div style={{ marginBottom: '4rem' }}>
        <h1 className="title">Personal Assistant</h1>
        <p className="subtitle">Private AI assistant. Your data stays on your device.</p>
      </div>

      <div className="grid-cards">
        <Link href="/whatsapp" className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text-secondary)'
            }}>
              W
            </div>
            <div className="card-title" style={{ margin: 0 }}>WhatsApp</div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Import chat exports and search your message history locally.
          </p>
        </Link>
        
        <Link href="/notes" className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text-secondary)'
            }}>
              N
            </div>
            <div className="card-title" style={{ margin: 0 }}>Notes</div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Import and search through your notes with semantic understanding.
          </p>
        </Link>
        
        <Link href="/emails" className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text-secondary)'
            }}>
              G
            </div>
            <div className="card-title" style={{ margin: 0 }}>Gmail</div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Connect to Gmail for intelligent email organization.
          </p>
        </Link>
        
        <Link href="/search" className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text)'
            }}>
              /
            </div>
            <div className="card-title" style={{ margin: 0 }}>Search</div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Ask anything across all your connected data sources.
          </p>
        </Link>
      </div>

      <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Powered by local LLM • No data leaves your device
        </p>
      </div>
    </div>
  );
}
