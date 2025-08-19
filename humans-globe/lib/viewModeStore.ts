'use client';

import { useEffect, useState } from 'react';

/**
 * View mode persistence using cookies for SSR compatibility
 * Provides a React hook and utility functions for non-React callers
 */

const COOKIE_NAME = 'globe-view-mode';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export function getViewMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const cookieValue = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_NAME}=`))
      ?.split('=')[1];

    return cookieValue === 'true';
  } catch (error) {
    console.warn('Failed to read view mode cookie:', error);
    return false;
  }
}

export function setViewMode(is3DMode: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }

  try {
    document.cookie = `${COOKIE_NAME}=${is3DMode}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  } catch (error) {
    console.warn('Failed to set view mode cookie:', error);
  }
}

export function useViewMode(): [boolean, (is3DMode: boolean) => void] {
  const [is3DMode, setIs3DMode] = useState(false);

  useEffect(() => {
    setIs3DMode(getViewMode());
  }, []);

  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);

  return [is3DMode, setIs3DMode];
}
