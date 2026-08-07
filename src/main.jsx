import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import CrmNavigationProvider from './navigation/CrmNavigationProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <CrmNavigationProvider>
        <App />
      </CrmNavigationProvider>
    </ErrorBoundary>
  </StrictMode>,
)
