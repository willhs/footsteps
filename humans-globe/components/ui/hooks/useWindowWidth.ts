'use client';

import { useState, useEffect } from 'react';

export default function useWindowWidth() {
  // Start with a neutral default that is the same for both server and client.
  // The actual `window.innerWidth` will be populated after the first mount.
  const [width, setWidth] = useState<number>(1024);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}
