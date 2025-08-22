'use client';

/**
 * View mode persistence utility using cookies for SSR compatibility
 * Handles 2D/3D globe view preference storage
 */

const COOKIE_NAME = 'globe-view-mode';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export class ViewModeStore {
  private static instance: ViewModeStore;
  
  private constructor() {}
  
  static getInstance(): ViewModeStore {
    if (!ViewModeStore.instance) {
      ViewModeStore.instance = new ViewModeStore();
    }
    return ViewModeStore.instance;
  }
  
  /**
   * Get current view mode from cookie
   * Works on both server and client for SSR compatibility
   */
  getViewMode(): boolean {
    if (typeof document === 'undefined') {
      return false; // Default to 2D for server-side rendering
    }
    
    try {
      const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith(`${COOKIE_NAME}=`))
        ?.split('=')[1];
      
      return cookieValue === 'true';
    } catch (error) {
      console.warn('Failed to read view mode cookie:', error);
      return false;
    }
  }
  
  /**
   * Set view mode preference in cookie
   * Only works on client side
   */
  setViewMode(is3DMode: boolean): void {
    if (typeof document === 'undefined') {
      return; // No-op on server
    }
    
    try {
      document.cookie = `${COOKIE_NAME}=${is3DMode}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
    } catch (error) {
      console.warn('Failed to set view mode cookie:', error);
    }
  }
}

/**
 * Convenience functions for direct use
 */
export const viewModeStore = ViewModeStore.getInstance();

export function getViewMode(): boolean {
  return viewModeStore.getViewMode();
}

export function setViewMode(is3DMode: boolean): void {
  viewModeStore.setViewMode(is3DMode);
}