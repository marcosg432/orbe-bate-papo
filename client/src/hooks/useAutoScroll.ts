import { useEffect, useRef, useState } from 'react';

export function useAutoScroll(tailKey: string, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const onScroll = () => {
    const element = ref.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nearBottom = distance < 96;
    stick.current = nearBottom;
    if (nearBottom) setShowJump(false);
  };

  useEffect(() => {
    const element = ref.current;
    if (!element || !active || tailKey === '') return;
    if (stick.current) {
      element.scrollTop = element.scrollHeight;
      setShowJump(false);
      return;
    }
    setShowJump(true);
  }, [tailKey, active]);

  const pin = () => {
    stick.current = true;
    setShowJump(false);
  };

  const jump = () => {
    const element = ref.current;
    if (!element) return;
    stick.current = true;
    setShowJump(false);
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  };

  return { ref, onScroll, showJump, pin, jump };
}
