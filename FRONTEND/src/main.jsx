import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { ThemeProvider } from './components/use_ui/ThemeProvider.jsx';



createRoot(document.getElementById('root')).render(

  <BrowserRouter>
    <ThemeProvider>
      {/* <StrictMode> */}
      <App />
      {/* </StrictMode> */}
    </ThemeProvider>
  </BrowserRouter>

)
