/**
 * Codigo.gs — Backend de notificaciones por correo para "Ingeniería de Procesos"
 * (Línea Italia)
 *
 * QUÉ HACE:
 *  - notify_project: cuando se crea un proyecto nuevo en la app, le manda un correo
 *    al líder asignado (la app ya llama esto solo; este script es lo que faltaba
 *    para que el correo realmente salga).
 *  - notify_overdue: manda un correo a cada persona con sus entregables vencidos.
 *    Se puede disparar manualmente (botón "📧 Enviar vencidos ahora" en Ajustes)
 *    o automáticamente cada día a las 8am (ver instalarTriggerDiario más abajo).
 *
 * Los correos llegan a la bandeja que cada persona tenga registrada en su perfil
 * (columna "email" en Equipo) — puede ser Gmail, Outlook, o cualquier proveedor;
 * no importa, MailApp envía a cualquier dirección válida.
 *
 * NO cubre: respaldo/sincronización con Google Sheets (acciones "load"/"save").
 * Si más adelante quieres eso también, es una función aparte.
 *
 * ══════════════════════════════════════════════════════════════
 * CÓMO DESPLEGAR (una sola vez):
 *  1. Ve a https://script.google.com/ → Proyecto nuevo.
 *  2. Borra el contenido de "Código.gs" y pega TODO este archivo.
 *  3. Arriba a la derecha: Implementar → Nueva implementación.
 *  4. Tipo: "Aplicación web".
 *  5. "Ejecutar como": Yo (tu cuenta).
 *  6. "Quién tiene acceso": Cualquier persona.
 *  7. Implementar → te va a pedir autorizar permisos (es tu propio script, dale
 *     "Avanzado" → "Ir a [nombre del proyecto] (no seguro)" si Google lo marca así
 *     — es normal para scripts personales sin verificar).
 *  8. Copia la URL que te da ("https://script.google.com/macros/s/…/exec") y
 *     pégala en la app: Ajustes → Sincronización Google Sheets → "URL del Web App".
 *  9. En el editor de Apps Script, en el menú de funciones (arriba), selecciona
 *     "instalarTriggerDiario" y dale ▶ Ejecutar una sola vez — esto activa el
 *     correo automático de vencidos todos los días a las 8am.
 *
 * CADA VEZ QUE EDITES ESTE ARCHIVO: tienes que crear una NUEVA versión de
 * implementación (Implementar → Nueva implementación) — no basta con guardar.
 * La URL puede cambiar si eliges "Nueva implementación" en vez de "Administrar
 * implementaciones → Editar"; usa esta última si quieres mantener la misma URL.
 * ══════════════════════════════════════════════════════════════
 */

// URL pública de tu base de datos (Firebase Realtime Database). Ya viene
// configurada con la de tu app — no la cambies a menos que también cambies
// la de index.html.
var FB_URL = 'https://ingenieria-de-procesos-24ba4-default-rtdb.firebaseio.com/li_procesos.json';

// Link de la app, para incluir en los correos.
var APP_URL = 'https://eamm070594-cpu.github.io/procesos-li/';

var TIMEZONE = 'America/Mexico_City';

function doGet(e){
  var output = ContentService
    .createTextOutput(JSON.stringify(handleGet(e)))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function doPost(e){
  var output = ContentService
    .createTextOutput(JSON.stringify(handlePost(e)))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function handleGet(e){
  var action = e && e.parameter ? e.parameter.action : null;
  if(action === 'notify_overdue'){
    return notifyOverdue();
  }
  return {ok:false, error:'Acción no reconocida (GET): ' + action + '. Este script solo implementa notificaciones por correo (notify_overdue, notify_project) — no respaldo a Sheets.'};
}

function handlePost(e){
  var body;
  try{
    body = JSON.parse(e.postData.contents);
  }catch(err){
    return {ok:false, error:'JSON inválido en el POST: ' + err.message};
  }
  if(body.action === 'notify_project'){
    return notifyProject(body.data);
  }
  return {ok:false, error:'Acción no reconocida (POST): ' + body.action + '. Este script solo implementa notificaciones por correo (notify_overdue, notify_project) — no respaldo a Sheets.'};
}

// ── Lee toda la base de datos desde Firebase (lectura pública, sin credenciales) ──
function fetchDB_(){
  var resp = UrlFetchApp.fetch(FB_URL, {muteHttpExceptions:true});
  var code = resp.getResponseCode();
  if(code !== 200) throw new Error('No se pudo leer Firebase (HTTP ' + code + ')');
  var data = JSON.parse(resp.getContentText());
  if(!data) throw new Error('Firebase devolvió datos vacíos (revisa que FB_URL sea correcta)');
  return data;
}

function todayISO_(){
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function daysBetween_(a, b){
  var d1 = new Date(a + 'T00:00:00');
  var d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}

// ══════════════════════════════════════════════════════
// NOTIFICACIÓN: entregables vencidos (uno por persona con lo que tiene vencido)
// ══════════════════════════════════════════════════════
function notifyOverdue(){
  var data = fetchDB_();
  var users = data.users || [];
  var deliverables = data.deliverables || [];
  var projects = data.projects || [];
  var today = todayISO_();

  var byUser = {};
  deliverables.forEach(function(d){
    if(!d.due) return;
    if(d.status === 'Aprobado' || d.status === 'En Pausa') return;
    if(d.due >= today) return; // no está vencido
    if(!byUser[d.assigneeId]) byUser[d.assigneeId] = [];
    byUser[d.assigneeId].push(d);
  });

  var enviados = 0;
  var errores = [];

  Object.keys(byUser).forEach(function(userId){
    var user = users.filter(function(u){ return u.id === userId; })[0];
    if(!user || !user.email){
      if(user) errores.push(user.name + ': sin correo registrado');
      return;
    }
    var dels = byUser[userId];
    var rows = dels.map(function(d){
      var proj = projects.filter(function(p){ return p.id === d.projectId; })[0];
      var dias = daysBetween_(d.due, today);
      return '- ' + d.title + (proj ? ' (' + proj.name + ')' : '') + ' — vencido hace ' + dias + ' día' + (dias===1?'':'s');
    }).join('\n');
    var subject = '⚠️ Tienes ' + dels.length + ' entregable' + (dels.length===1?'':'s') + ' vencido' + (dels.length===1?'':'s') + ' — Ingeniería de Procesos';
    var body = 'Hola ' + (user.name || '') + ',\n\n' +
      'Estos entregables tuyos están vencidos:\n\n' + rows + '\n\n' +
      'Entra a la app para ponerte al corriente:\n' + APP_URL + '\n\n' +
      '— Ingeniería de Procesos, Línea Italia';
    try{
      MailApp.sendEmail(user.email, subject, body);
      enviados++;
    }catch(err){
      errores.push((user.name||userId) + ': ' + err.message);
    }
  });

  return {ok:true, enviados:enviados, errores:errores};
}

// ══════════════════════════════════════════════════════
// NOTIFICACIÓN: proyecto nuevo asignado
// data = {projectName, leaderName, endDate, notes, assignees:[{name,email,deliverables:[{title,due}]}]}
// (la app ya arma y manda este payload al crear un proyecto)
// ══════════════════════════════════════════════════════
function notifyProject(data){
  if(!data) return {ok:false, error:'Sin datos'};
  var assignees = data.assignees || [];
  var enviados = 0;
  var errores = [];

  assignees.forEach(function(a){
    if(!a.email){ errores.push((a.name||'—') + ': sin correo registrado'); return; }
    var rows = (a.deliverables || []).map(function(d){
      return '- ' + d.title + (d.due ? ' (fecha: ' + d.due + ')' : '');
    }).join('\n');
    var subject = '📁 Nuevo proyecto asignado: ' + data.projectName;
    var body = 'Hola ' + (a.name || '') + ',\n\n' +
      'Se te asignó el proyecto "' + data.projectName + '".\n' +
      'Líder: ' + (data.leaderName || '—') + '\n' +
      (data.endDate ? 'Fecha de fin: ' + data.endDate + '\n' : '') +
      (data.notes ? '\nNotas:\n' + data.notes + '\n' : '') +
      (rows ? '\nTus entregables en este proyecto:\n' + rows + '\n' : '') +
      '\nEntra a la app para más detalles:\n' + APP_URL + '\n\n' +
      '— Ingeniería de Procesos, Línea Italia';
    try{
      MailApp.sendEmail(a.email, subject, body);
      enviados++;
    }catch(err){
      errores.push((a.name||'—') + ': ' + err.message);
    }
  });

  return {ok:true, enviados:enviados, errores:errores};
}

// ══════════════════════════════════════════════════════
// Trigger diario a las 8am — ejecuta esta función UNA VEZ manualmente desde
// el editor de Apps Script (menú de funciones arriba → instalarTriggerDiario
// → ▶ Ejecutar). No hace falta volver a correrla salvo que borres el trigger.
// ══════════════════════════════════════════════════════
function instalarTriggerDiario(){
  // Elimina triggers previos de esta función para no duplicar envíos si la
  // vuelves a ejecutar por accidente.
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'notifyOverdue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('notifyOverdue')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}
