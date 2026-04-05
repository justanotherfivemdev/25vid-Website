import './styles/main.css';
import { App } from './App';

export type { App };

let _instance: App | null = null;

/**
 * Mount the World Monitor into a given container element.
 * Returns a cleanup function that destroys the instance.
 */
export async function mountWorldMonitor(containerId: string): Promise<() => void> {
  if (_instance) {
    // Already mounted — destroy previous instance first
    _instance.destroy?.();
    _instance = null;
  }
  const app = new App(containerId);
  _instance = app;
  await app.init();
  return () => {
    app.destroy?.();
    _instance = null;
  };
}
