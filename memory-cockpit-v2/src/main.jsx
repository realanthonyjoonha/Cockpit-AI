// fonts are bundled as real /assets files — CSP blocks data:/CDN fonts (§4 HARD)
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './theme.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
