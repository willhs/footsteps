'use client';

import { useState, useEffect } from 'react';

interface SimpleGlobeProps {
  year: number;
}

export default function SimpleGlobe({ year }: SimpleGlobeProps) {
  const [loading, setLoading] = useState(true);
  const [dataCount, setDataCount] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Loading data for simple test...');
        const response = await fetch('/api/human-dots');
        if (response.ok) {
          const data = await response.json();
          setDataCount(data.features?.length || 0);
        }
      } catch (err) {
        console.error('Simple load test failed:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="w-full h-full bg-gray-900 flex items-center justify-center">
      <div className="text-white text-center">
        <div className="text-4xl mb-4">🌍</div>
        <div className="text-2xl font-bold mb-2">Simple Globe Test</div>
        <div className="text-lg mb-4">Year: {year}</div>
        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : (
          <div className="text-green-400">
            Data loaded: {dataCount.toLocaleString()} points
          </div>
        )}
        <div className="mt-4 text-sm text-gray-500">
          If you see this without errors, the issue is with DeckGL rendering
        </div>
      </div>
    </div>
  );
}