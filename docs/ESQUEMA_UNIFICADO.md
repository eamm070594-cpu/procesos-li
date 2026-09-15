# Esquema unificado — Remaster LI Ingeniería de Procesos

**Fase 1 del remaster.** Este documento diseña UN solo modelo de datos que reemplaza los 3
mundos de datos separados que hoy existen para Proyectos + Centro de Trabajo + Máquinas/Herramientas.
Es la base sobre la que se construyen las Fases 2-4 (remaster visual, integración de Control CT,
integración de CT M&H). Nada de esto se ha aplicado todavía a producción.

## 1. Estado actual (confirmado leyendo el código y los datos reales de Firebase)

Tres apps, mismo proyecto de Firebase (`ingenieria-de-procesos-24ba4`), tres nodos raíz
independientes, **sin ningún ID compartido entre ellos**:

### `li_procesos` (index.html) — 11 usuarios reales, catálogo con login
```
users[]        {id, name, customUsername, loginPassword, loginRole, role(puesto),
                team, reportsTo, email, nivel, responsabilidades, centrosTrabajo[con métricas]}
centros[]      {id, nombre, encargadoId, ingenieros:[userId,...]}
projects[]     {id, name, leaderId, priority, status, start, end, notes}
deliverables[] {id, title, projectId, assigneeId, due, originalDue, status, blocked,
                blockSince, evidence, notes, completedAt, scorePenalty}
departments[], roles[]   (catálogos de puesto/depto)
rocas[], incidents[], monthlyScores[], comments{}, bitacora[]
rules{}, scoreRules{}
```

### `control_ct` (Control_CT_v7.html) — 18 "centros", SIN login
```
centros[]      {n:nombre, s:icono-svg}          ← el índice del array ES el id (0-17)
state[i]       {ops[], mod, cif[], asignaciones}   ← uno por cada índice de centros[]
equipoState.ingenieros[]  {nombre(texto libre), areas:[índices], rol:'ingeniero'|'gerente'}
tabulador      {grupos[], categorias:[{grupoIdx,nombre}],
                niveles:[{categoriaIdx,num,salario,desc,autonomia,ascenso,incremento}]}
```
*18 centros reales, nombres como "Carpintería", "Láser", "Ensamble Sillas"... varios
coinciden por nombre con conceptos de `li_procesos` pero CERO por id.*

### `control_ct_mh` (CT_MH_v8.html) — abandonado en junio, SIN login, nunca enlazado
```
D.centros[]     [strings]  ← 18 nombres, otra vez independientes (casi los mismos nombres)
D.machines[]    {id,status,eficiencia,costoHora,hsAcum,otActual,mantFecha,año,marca,
                 modelo,type, foto:BASE64 ← mismo riesgo de peso que LineaItalia.html}
D.operators[]   {machines[],color,av,rol,turno,hrsMes,salario,...}  ← 4° catálogo de personas
D.troqueles[]   {golpesPorPieza,histGolpes[],lineas[],notas,ubicacion,frecuencia,
                 estado,golpes,golpesMax,foto}
D.ots[]         órdenes de trabajo
D.mantenimientos[], D.historial[]
D.proyectos[]   ← un CUARTO concepto de "proyecto", paralelo al de li_procesos
D.cifItems[], D.params
```

**El problema de fondo:** "Valeria Esparza" existe como usuario real con ID en `li_procesos`,
como nombre libre en `equipoState.ingenieros` de `control_ct`, y probablemente otra vez en
`D.operators` de `control_ct_mh` — tres representaciones de la misma persona sin ningún vínculo.
Lo mismo pasa con "Centro de Trabajo": tres catálogos independientes con nombres parecidos.

## 2. Esquema objetivo (un solo nodo, ej. `li_suite`)

```
usuarios[]          {id, nombre, nombreUsuario, loginPassword, permiso: admin|leader|user,
                     puesto, departamento, reportaA, email, nivel, responsabilidades,
                     esOperador:bool, turno?, salarioOperador?, colorAvatar?}
                     ← reemplaza users[] + equipoState.ingenieros[] + D.operators[]

centrosTrabajo[]    {id (slug estable, NO índice de array), nombre, icono, encargadoId,
                     ingenieroIds:[...], operaciones[], mod, cif[], asignaciones[],
                     costoHoraCIFMOD, maquinaIds:[...], troquelIds:[...]}
                     ← reemplaza centros[] (li_procesos) + centros[]+state[i] (control_ct)
                       + D.centros[] (control_ct_mh)

maquinas[]          {id, centroTrabajoId, status, eficiencia, costoHora, horasAcumuladas,
                     otActualId, fechaMantenimiento, año, marca, modelo, tipo,
                     fotoUrl}             ← fotoUrl = Firebase Storage, NUNCA más base64 inline
troqueles[]         {id, centroTrabajoId, golpesPorPieza, historialGolpes[], lineas[],
                     notas, ubicacion, frecuencia, estado, golpes, golpesMax, fotoUrl}
ordenesTrabajo[]    {id, maquinaId|troquelId, ...}
mantenimientos[]    {id, maquinaId|troquelId, ...}

proyectos[]         {id, nombre, centroTrabajoId?, liderId, prioridad, estatus,
                     inicio, fin, notas, origen: 'ingenieria'|'mantenimiento'}
                     ← fusiona projects[] (li_procesos) + D.proyectos[] (control_ct_mh),
                       diferenciados por "origen" para no perder el contexto
entregables[]       (igual que hoy, sin cambios de forma)

tabuladorSalarial   {grupos[], categorias[], niveles[]}   ← se queda igual, ya es único
departamentos[], puestos[]                                 ← catálogos, sin cambio
rocas[], incidentes[], scoresMenusales[], comentarios{}, bitacora[]   ← sin cambio
reglas{}, reglasScore{}                                    ← sin cambio
```

## 3. Mapa de migración (resumen — el detalle vive en el script de migración)

| Origen | Campo | Destino | Regla de emparejamiento |
|---|---|---|---|
| `control_ct.equipoState.ingenieros[].nombre` | texto libre | `usuarios[].id` | normalizar nombre y buscar coincidencia en `li_procesos.users[].name`; si no hay match, crear usuario nuevo con permiso `user` y marcarlo para revisión manual |
| `control_ct.centros[i]` + `control_ct.state[i]` | índice de array | `centrosTrabajo[].id` (slug) | emparejar por nombre contra `li_procesos.centros[].nombre`; si no hay match, crear centro nuevo |
| `control_ct_mh.D.centros[]` | string | `centrosTrabajo[].id` | mismo emparejamiento por nombre; casi todos deberían caer en centros ya migrados desde `control_ct` |
| `control_ct_mh.D.operators[]` | texto libre | `usuarios[].id` | igual que ingenieros — normalizar y emparejar, si no existe, crear |
| `control_ct_mh.D.proyectos[]` | — | `proyectos[]` con `origen:'mantenimiento'` | conservar tal cual, solo agregar el campo `origen` |
| fotos base64 (`D.machines[].foto`, `D.troqueles[].foto`) | base64 inline | Firebase Storage + `fotoUrl` | subir cada imagen una sola vez a Storage, reemplazar el campo por la URL — esto es lo que evita que la app unificada vuelva a pesar 4MB como `LineaItalia.html` |

## 4. Decisiones pendientes (a confirmar contigo antes de migrar datos reales)

1. **Nombres que no logren emparejarse automáticamente** (ej. "Leonador Ortiz" en
   `equipoState.ingenieros`, que no aparece en `li_procesos.users`) — ¿se crean como
   usuarios nuevos con acceso, o se quedan solo como referencia histórica sin cuenta?
2. **Rol `gerente`/`ingeniero` de Control_CT** vs. `admin`/`leader`/`user` de li_procesos —
   propongo mapear `gerente→leader` e `ingeniero→user`, a confirmar.
3. El script de migración se prueba primero **contra una copia exportada de Firebase**,
   nunca directo en producción — se corre, se revisa la lista de "sin match automático",
   se ajusta a mano, y solo entonces se aplica al nodo real.

---
*Generado como parte del remaster global — ver conversación con Claude Code para contexto completo.*
