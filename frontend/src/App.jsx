import { useState, useEffect, useRef } from 'react'

const GAS_URL = import.meta.env.VITE_GAS_URL
const ITEM_VACIO = { unidades: '', articulo: '', descripcion: '' }
const FORM_INICIAL = {
  solicitante: '',
  proyecto: '',
  paraCuando: '',
  items: [{ ...ITEM_VACIO }],
  proveedorSugerido: '',
  archivos: [],
}
const MAX_ARCHIVOS = 10
const MAX_TAMANO_ARCHIVO_MB = 8
const MAX_TAMANO_ARCHIVO_BYTES = MAX_TAMANO_ARCHIVO_MB * 1024 * 1024
const CACHE_KEY = 'compras_ncm_solicitantes'

function PantallaExito({ solicitudId, onNueva }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Solicitud enviada!</h2>
        <p className="text-gray-500 text-sm mb-2">Tu pedido fue registrado correctamente.</p>
        <p className="text-xs text-gray-400 font-mono mb-8">{solicitudId}</p>
        <button onClick={onNueva} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
          Nueva solicitud
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [solicitantes, setSolicitantes] = useState([])
  const [proyectos, setProyectos]       = useState([])
  const [form, setForm]                 = useState(FORM_INICIAL)
  const [estado, setEstado]             = useState({ cargando: true, enviando: false, exitoId: null, error: '' })
  const [refreshing, setRefreshing]     = useState(false)
  const fileInputRef = useRef(null)

  const cargarSolicitantes = (forzar = false) => {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached && !forzar) {
      setSolicitantes(JSON.parse(cached))
      setEstado(s => ({ ...s, cargando: false }))
      return
    }
    setEstado(s => ({ ...s, cargando: true, error: '' }))
    fetch(`${GAS_URL}?action=getSolicitantes`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : []
        setSolicitantes(lista)
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(lista))
        setEstado(s => ({ ...s, cargando: false }))
      })
      .catch(() => setEstado(s => ({ ...s, cargando: false, error: 'No se pudieron cargar los solicitantes.' })))
  }

  const handleRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    sessionStorage.removeItem(CACHE_KEY)
    setProyectos([])
    setForm(f => ({ ...f, solicitante: '', proyecto: '' }))
    fetch(`${GAS_URL}?action=getSolicitantes`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : []
        setSolicitantes(lista)
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(lista))
        setEstado(s => ({ ...s, error: '' }))
      })
      .catch(() => setEstado(s => ({ ...s, error: 'Error al refrescar los datos.' })))
      .finally(() => setRefreshing(false))
  }

  useEffect(() => { cargarSolicitantes() }, [])

  useEffect(() => {
    if (!form.solicitante) { setProyectos([]); return }
    setEstado(s => ({ ...s, cargandoProyectos: true }))
    fetch(`${GAS_URL}?action=getProyectos&solicitante=${encodeURIComponent(form.solicitante)}`)
      .then(r => r.json())
      .then(data => {
        setProyectos(Array.isArray(data) ? data : [])
        setForm(f => ({ ...f, proyecto: '' }))
        setEstado(s => ({ ...s, cargandoProyectos: false }))
      })
      .catch(() => setEstado(s => ({ ...s, cargandoProyectos: false, error: 'No se pudieron cargar los proyectos.' })))
  }, [form.solicitante])

  const setField = (field, value) => {
    setEstado(s => ({ ...s, error: '' }))
    setForm(f => ({ ...f, [field]: value }))
  }

  const setItemField = (index, field, value) => {
    const items = [...form.items]
    items[index] = { ...items[index], [field]: value }
    setForm(f => ({ ...f, items }))
  }

  const agregarItem  = () => setForm(f => ({ ...f, items: [...f.items, { ...ITEM_VACIO }] }))
  const eliminarItem = (index) => {
    if (form.items.length === 1) return
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }))
  }

  const handleArchivos = async (e) => {
    const nuevos = Array.from(e.target.files || [])
    const disponibles = MAX_ARCHIVOS - form.archivos.length
    if (disponibles <= 0) return

    const demasiadoGrandes = nuevos.filter(f => f.size > MAX_TAMANO_ARCHIVO_BYTES).map(f => f.name)
    if (demasiadoGrandes.length > 0) {
      setEstado(s => ({ ...s, error: `Los siguientes archivos superan el límite de ${MAX_TAMANO_ARCHIVO_MB} MB: ${demasiadoGrandes.join(', ')}` }))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const leidos = await Promise.all(
      nuevos.slice(0, disponibles).map(file => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve({ nombre: file.name, tipo: file.type, base64: reader.result.split(',')[1] })
        reader.onerror = reject
        reader.readAsDataURL(file)
      }))
    )
    setForm(f => ({ ...f, archivos: [...f.archivos, ...leidos] }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const eliminarArchivo = (index) =>
    setForm(f => ({ ...f, archivos: f.archivos.filter((_, i) => i !== index) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setEstado(s => ({ ...s, enviando: true, error: '' }))
    try {
      const res  = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(form), redirect: 'follow' })
      const data = await res.json()
      if (data.success) {
        setEstado(s => ({ ...s, enviando: false, exitoId: data.id }))
      } else {
        setEstado(s => ({ ...s, enviando: false, error: data.error || 'Error al registrar la solicitud.' }))
      }
    } catch {
      setEstado(s => ({ ...s, enviando: false, error: 'Error de red. Intentá nuevamente.' }))
    }
  }

  const resetear = () => {
    setForm(FORM_INICIAL)
    setProyectos([])
    setEstado({ cargando: false, enviando: false, exitoId: null, error: '' })
  }

  if (estado.exitoId) {
    return <PantallaExito solicitudId={estado.exitoId} onNueva={resetear} />
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Solicitud de Compra</h1>
            <p className="mt-1 text-sm text-gray-500">Completa los datos para registrar tu pedido.</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refrescar datos"
            className="mt-1 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {estado.error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {estado.error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault() }}
          className="space-y-6"
        >
          <Card titulo="Informacion general">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label text="Solicitante" required />
                <select required value={form.solicitante} onChange={e => setField('solicitante', e.target.value)} disabled={estado.cargando} className={selectClass}>
                  <option value="">{estado.cargando ? 'Cargando...' : 'Seleccionar'}</option>
                  {solicitantes.map(s => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <Label text="Proyecto" required />
                <select required value={form.proyecto} onChange={e => setField('proyecto', e.target.value)} disabled={!form.solicitante || estado.cargandoProyectos} className={selectClass}>
                  <option value="">
                    {estado.cargandoProyectos ? 'Cargando...' : !form.solicitante ? 'Selecciona un solicitante primero' : proyectos.length === 0 ? 'Sin proyectos asignados' : 'Seleccionar'}
                  </option>
                  {proyectos.map(p => <option key={p.proyecto} value={p.proyecto}>{p.proyecto}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 max-w-xs">
              <Label text="Para cuando" required />
              <input type="date" required value={form.paraCuando} onChange={e => setField('paraCuando', e.target.value)} className={inputClass} />
            </div>
          </Card>

          <Card titulo="Articulos" accion={<button type="button" onClick={agregarItem} className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">+ Agregar articulo</button>}>
            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="rounded-xl bg-gray-50 p-4">
                  {/* Header fila: número + botón eliminar */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-gray-400">#{index + 1}</span>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => eliminarItem(index)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {/* Fila 1: Unidades + Artículo */}
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="col-span-1">
                      <Label text="Unidades" required small />
                      <input type="number" min="1" required placeholder="1" value={item.unidades} onChange={e => setItemField(index, 'unidades', e.target.value)} className={inputClass} />
                    </div>
                    <div className="col-span-3">
                      <Label text="Articulo" required small />
                      <input type="text" required placeholder="Ej: Tornillos 3/8" value={item.articulo} onChange={e => setItemField(index, 'articulo', e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  {/* Fila 2: Descripción */}
                  <div>
                    <Label text="Descripcion" small />
                    <input type="text" placeholder="Ej: para madera" value={item.descripcion} onChange={e => setItemField(index, 'descripcion', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarItem() } }} className={inputClass} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card titulo="Proveedor y archivos">
            <div className="mb-4">
              <Label text="Proveedor sugerido" optional />
              <input type="text" placeholder="Nombre del proveedor (opcional)" value={form.proveedorSugerido} onChange={e => setField('proveedorSugerido', e.target.value)} className={inputClass} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label text="Archivos adjuntos" optional />
                <span className="text-xs text-gray-400">{form.archivos.length}/{MAX_ARCHIVOS}</span>
              </div>
              {form.archivos.length < MAX_ARCHIVOS && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Seleccionar archivos
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleArchivos} />
                </label>
              )}
              {form.archivos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {form.archivos.map((archivo, index) => (
                    <li key={index} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      <span className="truncate max-w-xs">{archivo.nombre}</span>
                      <button type="button" onClick={() => eliminarArchivo(index)} className="ml-2 shrink-0 text-gray-300 hover:text-red-400 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <button type="submit" disabled={estado.enviando || estado.cargando} className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {estado.enviando ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Card({ titulo, accion, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{titulo}</h2>
        {accion}
      </div>
      {children}
    </div>
  )
}

function Label({ text, required, optional, small }) {
  return (
    <label className={`mb-1 block font-medium text-gray-700 ${small ? 'text-xs' : 'text-sm'}`}>
      {text}
      {required && <span className="ml-0.5 text-red-500"> *</span>}
      {optional && <span className="ml-1 text-gray-400 font-normal">(opcional)</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder-gray-400 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ' +
  'disabled:bg-gray-100 disabled:text-gray-400'

const selectClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ' +
  'disabled:bg-gray-100 disabled:text-gray-400'
