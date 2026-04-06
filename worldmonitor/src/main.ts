/**
 * Standalone World Monitor entry point.
 *
 * Source code lives in frontend/src/features/worldmonitor/ (single source of
 * truth).  This file is only used when running `npm run dev` from the
 * worldmonitor/ directory for isolated local development.
 */
import '@/styles/main.css';
import { App } from '@/App';

const app = new App('app');
app.init().catch(console.error);
