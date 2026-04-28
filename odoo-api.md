# Informe: Conexión a la API Externa de Odoo

## 1. Cómo conectar la API de Odoo

Odoo permite el acceso a sus características y datos desde el exterior para integraciones o análisis mediante su API externa, la cual utiliza el protocolo **XML-RPC**.

Para establecer la configuración de la conexión, necesitás cuatro parámetros fundamentales:

| Parámetro | Descripción |
|---|---|
| **URL del servidor** | El dominio de tu instancia (ej: `https://tuempresa.odoo.com`) |
| **Nombre de la base de datos** | El nombre de tu entorno o instancia |
| **Usuario** | El correo electrónico o identificador del usuario administrador |
| **Clave API** | Generada desde *Preferencias → Seguridad de la Cuenta* (reemplaza a la contraseña) |

### Proceso de Autenticación

1. Tu aplicación se conecta primero al endpoint `/xmlrpc/2/common` (no requiere autenticación previa).
2. A través de ese endpoint se llama a la función `authenticate`, enviando `db`, `username` y `api_key`.
3. El sistema devuelve un **uid** (identificador numérico del usuario).
4. Ese `uid` se usa en todas las llamadas autenticadas posteriores.

---

## 2. Detalle de la conexión para crear una Orden de Compra

Una vez obtenido el `uid`, las operaciones sobre datos se realizan a través del endpoint `/xmlrpc/2/object`, usando la función `execute_kw`.

Para crear una compra, el método a invocar es `create()`, el cual:
- Procesa la creación de un único registro.
- Devuelve el **ID numérico** del registro creado en la base de datos.
- Recibe un diccionario con los campos a completar (los campos no especificados toman su valor predeterminado).

### Ejemplo en Python

> **Nota importante:** Los nombres técnicos `purchase.order` (modelo de compras) y `partner_id` (campo del proveedor) provienen de conocimiento externo a la documentación oficial. Se recomienda verificar los nombres exactos en la documentación técnica interna de tu base de datos.

```python
import xmlrpc.client

url      = 'https://tuempresa.odoo.com'
db       = 'nombre_de_tu_base'
username = 'admin@tuempresa.com'
api_key  = 'TU_CLAVE_API'

# 1. Autenticación
common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
uid = common.authenticate(db, username, api_key, {})

# 2. Conexión a los objetos del sistema
models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(url))

# 3. Mapeo de datos para la orden de compra
valores_compra = {
    'partner_id': 120,  # ID del proveedor en la base de datos
    'company_id': 1     # ID de tu empresa
}

# 4. Creación del registro via execute_kw
# Parámetros en orden: db, uid, api_key, modelo, método, [args]
id_nueva_compra = models.execute_kw(
    db,
    uid,
    api_key,
    'purchase.order',
    'create',
    [valores_compra]
)

print(f"ID de la nueva compra creada: {id_nueva_compra}")
```

### Consideraciones avanzadas

- **Fechas:** Los campos `Date` y `Datetime` deben enviarse **como strings** (ej: `'2026-04-27'`).
- **Líneas de productos (One2many):** Una orden de compra típica incluye varias líneas. Para insertar registros en campos de relación One2many durante la misma llamada `create`, se debe usar la **sintaxis especial de comandos** (tuplas) de Odoo. Ejemplo:

```python
valores_compra = {
    'partner_id': 120,
    'company_id': 1,
    'order_line': [
        (0, 0, {
            'product_id': 55,       # ID del producto
            'product_qty': 3,       # Cantidad
            'price_unit': 150.00,   # Precio unitario
        }),
        (0, 0, {
            'product_id': 72,
            'product_qty': 1,
            'price_unit': 80.00,
        }),
    ]
}
```

> El comando `(0, 0, {...})` le indica a Odoo que cree un nuevo registro vinculado con los valores del diccionario.
