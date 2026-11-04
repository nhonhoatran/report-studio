import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/components/ui/ui.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
