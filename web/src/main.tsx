import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tailwind.css';
import './styles/stage-theme.css';
import './styles/player.css';
/* preview-host.css только в PreviewHostPage — иначе .landing-nav.topbar { display:none } прячет меню везде */

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
