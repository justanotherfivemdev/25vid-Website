import { useState, useEffect } from 'react';
import { device, refreshScreenClass } from '@/utils/deviceCapability';

/**
 * React hook — returns the device capability snapshot and re-renders
 * when screen class changes (resize) or reduced-motion preference toggles.
 */
export function useDeviceCapability() {
  const [cap, setCap] = useState(() => ({ ...device }));

  useEffect(() => {
    let lastScreen = device.screen;

    const onResize = () => {
      refreshScreenClass();
      if (device.screen !== lastScreen) {
        lastScreen = device.screen;
        setCap({ ...device });
      }
    };

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (e) => {
      device.prefersReducedMotion = e.matches;
      device.shouldReduceComplexity =
        device.tier === 'low' || device.prefersReducedMotion || device.prefersReducedData;
      setCap({ ...device });
    };

    window.addEventListener('resize', onResize, { passive: true });
    motionMq.addEventListener('change', onMotionChange);

    return () => {
      window.removeEventListener('resize', onResize);
      motionMq.removeEventListener('change', onMotionChange);
    };
  }, []);

  return cap;
}

export default useDeviceCapability;
