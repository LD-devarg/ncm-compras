import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import OC from './OC.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/compras_ncm">
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/oc" element={<OC />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
