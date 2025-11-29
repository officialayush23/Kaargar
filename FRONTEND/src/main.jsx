import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { ThemeProvider } from './components/use_ui/ThemeProvider.jsx';
import { Toaster } from 'sonner';
import { Analytics } from "@vercel/analytics/next"


createRoot(document.getElementById('root')).render(

  <BrowserRouter>
  <Analytics/>
    <ThemeProvider>
      {/* <StrictMode> */}
      <App />
      {/* </StrictMode> */}
      <Toaster/>
    </ThemeProvider>
  </BrowserRouter>

)
