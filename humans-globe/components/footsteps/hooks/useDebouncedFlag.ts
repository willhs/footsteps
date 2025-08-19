import { useCallback, useEffect, useRef, useState } from 'react';

export default function useDebouncedFlag(delay: number): [boolean, () => void] {
  const [flag, setFlag] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const trigger = useCallback(() => {
    setFlag(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setFlag(false);
      timeoutRef.current = null;
    }, delay);
  }, [delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [flag, trigger];
}
