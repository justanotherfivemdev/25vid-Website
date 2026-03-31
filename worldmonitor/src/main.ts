import './styles/main.css';
import { App } from './App';

const app = new App('app');
app.init().catch(console.error);
