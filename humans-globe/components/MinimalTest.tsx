'use client';

interface MinimalTestProps {
  year: number;
}

export default function MinimalTest({ year }: MinimalTestProps) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌍</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          Minimal Test
        </div>
        <div style={{ fontSize: '18px', color: '#888' }}>
          Year: {year}
        </div>
        <div style={{ fontSize: '14px', color: '#666', marginTop: '16px' }}>
          No React hooks, no API calls, no Tailwind
        </div>
      </div>
    </div>
  );
}