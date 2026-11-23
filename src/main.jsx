import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

console.log('🚀 MAIN.JSX LOADED - Console is working!')

// ✅ React Detection Helper for Wappalyzer
window.React = React;
window.ReactDOM = ReactDOM;
window.__REACT_VERSION__ = React.version;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
