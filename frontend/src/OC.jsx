import { useState, useEffect } from 'react'

const GAS_URL = import.meta.env.VITE_GAS_URL

// ─── Helpers ────────────────────────────────────────────────────────────────

function badgeEstado(estado) {
  const e = (estado || '')
  if (e === 'OC Emitida') return 'bg-green-100 text-green-700'
  if (e === 'Rechazada')  return 'bg-red-100 text-red-700'
  return 'bg-yellow-100 text-yellow-700'
}

function formatFecha(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function parseItems(texto) {
  if (!texto) return []
  return texto.split('\n').map(l => l.trim()).filter(Boolean).map(linea => {
    const p = linea.split(',').map(s => s.trim())
    return { unidades: p[0] || '', articulo: p[1] || '', descripcion: p[2] || '' }
  })
}

// ─── Modal detalle + crear OC ────────────────────────────────────────────────

function Modal({ sol, onClose, onOCCreada, onEstadoChanged }) {
  const [cuit, setCuit]             = useState('11111111')
  const [provMatch, setProvMatch]   = useState(null)
  const [creando, setCreando]       = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [rechazando, setRechazando] = useState(false)
  const [items, setItems]           = useState(parseItems(sol.items))

  // Buscar CUIT en sessionStorage cache de proveedores
  const [proveedores, setProveedores] = useState([])
  useEffect(() => {
    const raw = sessionStorage.getItem('compras_ncm_proveedores')
    if (raw) setProveedores(JSON.parse(raw))
  }, [])

  function handleCuit(val) {
    const limpio = val.replace(/\D/g, '').slice(0, 11)
    setCuit(limpio)
    setResultado(null)
    if (limpio.length === 11) {
      const match = proveedores.find(p => String(p.cuit).replace(/\D/g, '') === limpio)
      setProvMatch(match ? { id: match.id, nombre: match.nombre } : 'nuevo')
    } else {
      setProvMatch(null)
    }
  }

  async function handleCrearOC() {
    setCreando(true)
    setResultado(null)
    try {
      const itemsTexto = items.map(it => [it.unidades, it.articulo, it.descripcion].join(',')).join('\n')
      const url  = `${GAS_URL}?action=crearOC&solicitudId=${encodeURIComponent(sol.id)}&cuit=${encodeURIComponent(cuit)}&itemsOverride=${encodeURIComponent(itemsTexto)}`
      const resp = await fetch(url, { redirect: 'follow' })
      const data = await resp.json()
      if (data.success) {
        setResultado({ ok: true, msg: `OC creada exitosamente${data.partnerNuevo ? ' (proveedor nuevo creado en Odoo)' : ''} — ID Odoo: ${data.orderId}` })
        onOCCreada(sol.id, 'OC-' + data.orderId, 'OC Emitida')
      } else {
        setResultado({ ok: false, msg: data.error || 'Error desconocido' })
      }
    } catch (e) {
      setResultado({ ok: false, msg: 'Error de red: ' + e.message })
    } finally {
      setCreando(false)
    }
  }

  async function handleRechazar() {
    setRechazando(true)
    try {
      const url  = `${GAS_URL}?action=cambiarEstado&solicitudId=${encodeURIComponent(sol.id)}&estado=Rechazada`
      const resp = await fetch(url, { redirect: 'follow' })
      const data = await resp.json()
      if (data.success) {
        onEstadoChanged(sol.id, 'Rechazada')
        onClose()
      }
    } catch (e) {
      // silencioso
    } finally {
      setRechazando(false)
    }
  }

  const yaConOC    = sol.oc && sol.oc.trim() !== ''
  const rechazada  = (sol.estado || '').toLowerCase() === 'rechazada'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div
        className="mt-auto w-full bg-white rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <span className="text-xs font-mono text-gray-400">{sol.id}</span>
            <h2 className="text-base font-bold text-gray-900 leading-tight">{sol.proyecto || '—'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scroll content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Datos generales */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Solicitante', sol.solicitante],
              ['Fecha',       formatFecha(sol.fecha)],
              ['Para cuándo', formatFecha(sol.paraCuando)],
              ['Urgencia',    sol.urgencia],
              ['Proveedor',   sol.proveedor || '—'],
              ['Estado',      sol.estado],
            ].map(([label, val]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{val || '—'}</p>
              </div>
            ))}
          </div>

          {/* Archivos */}
          {sol.archivos && sol.archivos.startsWith('=HYPERLINK') ? null : sol.archivos && sol.archivos !== '' && (
            <div className="text-sm text-blue-600 underline">
              <a href={sol.archivos} target="_blank" rel="noreferrer">Ver archivos adjuntos</a>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Artículos</p>
            <div className="rounded-xl overflow-hidden border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-16">Cant.</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Artículo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 hidden sm:table-cell">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((it, i) => (
                    <tr key={i} className="bg-white">
                      <td className="px-2 py-1.5">
                        <input
                          type="number" min="1"
                          value={it.unidades}
                          onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, unidades: e.target.value } : x))}
                          className="w-14 font-mono text-gray-700 border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:border-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={it.articulo}
                          onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, articulo: e.target.value } : x))}
                          className="w-full uppercase font-medium text-gray-800 border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:border-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5 hidden sm:table-cell">
                        <input
                          type="text"
                          value={it.descripcion}
                          onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
                          className="w-full uppercase text-gray-500 border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:border-blue-400"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* En mobile mostrar descripcion editable bajo el artículo */}
            <div className="sm:hidden mt-2 space-y-1.5">
              {items.map((it, i) => (
                <div key={i} className="px-1">
                  <p className="text-xs text-gray-400 mb-0.5 uppercase font-medium">{it.articulo}</p>
                  <input
                    type="text"
                    value={it.descripcion}
                    onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
                    placeholder="Descripción"
                    className="w-full uppercase text-gray-500 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* OC existente */}
          {yaConOC && (
            <div className="flex items-center gap-2 bg-green-50 rounded-xl px-4 py-3">
              <svg className="h-5 w-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-green-700">OC ya generada</p>
                <p className="text-xs text-green-600 font-mono">{sol.oc}</p>
              </div>
            </div>
          )}

          {/* Crear OC */}
          {!yaConOC && !rechazada && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Crear Orden de Compra</p>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CUIT del proveedor (11 dígitos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={cuit}
                  onChange={e => handleCuit(e.target.value)}
                  placeholder="20123456789"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Feedback CUIT */}
              {cuit.length === 11 && provMatch === 'nuevo' && (
                <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5">
                  <svg className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-yellow-700">CUIT no encontrado en proveedores</p>
                    <p className="text-xs text-yellow-600">Se creará un proveedor nuevo en Odoo con este CUIT. Podés completar el nombre después.</p>
                  </div>
                </div>
              )}
              {cuit.length === 11 && provMatch && provMatch !== 'nuevo' && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-green-700">Proveedor encontrado</p>
                    <p className="text-xs text-green-600">{provMatch.nombre}</p>
                  </div>
                </div>
              )}
              {cuit.length > 0 && cuit.length < 11 && (
                <p className="text-xs text-gray-400">{11 - cuit.length} dígito{11 - cuit.length !== 1 ? 's' : ''} restante{11 - cuit.length !== 1 ? 's' : ''}</p>
              )}

              {/* Resultado */}
              {resultado && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${resultado.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <svg className={`h-4 w-4 mt-0.5 shrink-0 ${resultado.ok ? 'text-green-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {resultado.ok
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    }
                  </svg>
                  <p className={`text-xs font-medium ${resultado.ok ? 'text-green-700' : 'text-red-700'}`}>{resultado.msg}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCrearOC}
                  disabled={cuit.length !== 11 || creando || rechazando || !!resultado?.ok}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {creando && (
                    <span className="inline-block h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {creando ? 'Creando OC...' : resultado?.ok ? 'OC Creada ✓' : 'Crear OC en Odoo'}
                </button>
                <button
                  onClick={handleRechazar}
                  disabled={creando || rechazando || !!resultado?.ok}
                  className="bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 font-semibold rounded-xl px-4 text-sm transition-colors flex items-center gap-1.5"
                >
                  {rechazando
                    ? <span className="inline-block h-4 w-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                    : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  }
                  Rechazar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal OC ─────────────────────────────────────────────────────

export default function OC() {
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando]       = useState(true)
  const [error, setError]             = useState('')
  const [seleccionada, setSeleccionada] = useState(null)
  const [filtro, setFiltro]           = useState('todas') // todas | pendiente | aprobado | rechazado

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError('')
    try {
      // Cargar solicitudes y proveedores en paralelo
      const [rSol, rProv] = await Promise.all([
        fetch(`${GAS_URL}?action=getSolicitudes`, { redirect: 'follow' }).then(r => r.json()),
        fetch(`${GAS_URL}?action=getProveedores`, { redirect: 'follow' }).then(r => r.json()).catch(() => [])
      ])
      setSolicitudes(Array.isArray(rSol) ? rSol : [])
      if (Array.isArray(rProv)) {
        sessionStorage.setItem('compras_ncm_proveedores', JSON.stringify(rProv))
      }
    } catch (e) {
      setError('Error al cargar solicitudes: ' + e.message)
    } finally {
      setCargando(false)
    }
  }

  function handleOCCreada(solicitudId, ocId, estado) {
    setSolicitudes(prev => prev.map(s => s.id === solicitudId ? { ...s, oc: ocId, estado: estado || s.estado } : s))
    if (seleccionada?.id === solicitudId) setSeleccionada(s => ({ ...s, oc: ocId, estado: estado || s.estado }))
  }

  function handleEstadoChanged(solicitudId, nuevoEstado) {
    setSolicitudes(prev => prev.map(s => s.id === solicitudId ? { ...s, estado: nuevoEstado } : s))
  }

  const FILTROS = [
    { key: 'todas',      label: `Todas (${solicitudes.length})`, active: 'bg-blue-600 text-white', inactive: 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300' },
    { key: 'Pendiente',  label: 'Pendiente',  active: 'bg-blue-600 text-white', inactive: 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300' },
    { key: 'OC Emitida', label: 'OC Emitida', active: 'bg-green-600 text-white', inactive: 'bg-green-50 text-green-700 border border-green-200 hover:border-green-400' },
    { key: 'Rechazada',  label: 'Rechazada',  active: 'bg-red-600 text-white', inactive: 'bg-red-50 text-red-600 border border-red-200 hover:border-red-400' },
  ]

  const filtradas = solicitudes.filter(s => {
    if (filtro === 'todas') return true
    return (s.estado || '') === filtro
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Órdenes de Compra</h1>
          <p className="text-xs text-gray-400">{solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''}</p>
        </div>
        <button
          onClick={cargarDatos}
          disabled={cargando}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors"
        >
          <svg className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {cargando ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Filtros */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filtro === f.key ? f.active : f.inactive}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="px-4 pb-8">
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {cargando && !solicitudes.length && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="h-8 w-8 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <p className="text-sm">Cargando solicitudes...</p>
          </div>
        )}

        {!cargando && !error && filtradas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="h-10 w-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <p className="text-sm">No hay solicitudes con este filtro</p>
          </div>
        )}

        <div className="space-y-3 mt-1">
          {filtradas.map(sol => (
            <button
              key={sol.id}
              onClick={() => setSeleccionada(sol)}
              className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">{sol.id}</span>
                    {sol.oc && sol.oc.trim() !== '' && (
                      <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full">{sol.oc}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">{sol.proyecto || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sol.solicitante} · {formatFecha(sol.fecha)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeEstado(sol.estado)}`}>
                    {sol.estado || 'Pendiente'}
                  </span>
                  {sol.urgencia && sol.urgencia.toLowerCase() === 'urgente' && (
                    <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-1 rounded-full">🔴 Urgente</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Modal */}
      {seleccionada && (
        <Modal
          sol={seleccionada}
          onClose={() => setSeleccionada(null)}
          onOCCreada={handleOCCreada}
          onEstadoChanged={handleEstadoChanged}
        />
      )}
    </div>
  )
}
