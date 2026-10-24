/**
 * Ejercicio 3: Notificaciones Push Locales desde el Service Worker
 * Lógica de cliente: Registro de SW, gestión reactiva de permisos,
 * vinculación de vista previa, presets y disparo de notificaciones nativas.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elementos UI de Estado
  const permBadge = document.getElementById('perm-status-badge');
  const swBadge = document.getElementById('sw-status-badge');
  const btnRequestPerm = document.getElementById('btn-request-perm');
  const networkBadge = document.getElementById('network-badge');
  const networkDot = document.getElementById('network-dot');
  const networkText = document.getElementById('network-text');

  // Elementos del Formulario
  const notifTitleInput = document.getElementById('notif-title');
  const notifBodyInput = document.getElementById('notif-body');
  const notifTagInput = document.getElementById('notif-tag');
  const notifVibrationSelect = document.getElementById('notif-vibration');
  const notifRequireInteractionCheck = document.getElementById('notif-require-interaction');
  const notifIncludeActionsCheck = document.getElementById('notif-include-actions');

  // Elementos de Vista Previa
  const previewTitle = document.getElementById('preview-title');
  const previewBody = document.getElementById('preview-body');
  const previewTag = document.getElementById('preview-tag');
  const previewActionsContainer = document.getElementById('preview-actions-container');

  // Botones de Disparo
  const btnSendNow = document.getElementById('btn-send-now');
  const btnSendDelayed = document.getElementById('btn-send-delayed');
  const btnDelayedText = document.getElementById('btn-delayed-text');

  // Presets y Terminal
  const presetChips = document.querySelectorAll('.preset-chip');
  const terminalLogsBox = document.getElementById('terminal-logs-box');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const toastContainer = document.getElementById('toast-container');

  let swRegistration = null;
  let countdownInterval = null;

  // -------------------------------------------------------------
  // 1. Registro del Service Worker
  // -------------------------------------------------------------
  async function initServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      updateSwStatus('No Soportado', 'denied');
      addLog('error', 'El navegador no tiene soporte para Service Workers.');
      showToast('Navegador sin soporte de Service Worker', 'danger');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      swRegistration = reg;
      updateSwStatus('Activo y Listo', 'active');
      addLog('success', `Service Worker registrado con éxito en scope: ${reg.scope}`);

      // Escuchar mensajes provenientes del Service Worker (clics y cierres de notificación)
      navigator.serviceWorker.addEventListener('message', (event) => {
        handleServiceWorkerMessage(event.data);
      });

    } catch (err) {
      updateSwStatus('Error al Registrar', 'denied');
      addLog('error', `Fallo al registrar Service Worker: ${err.message}`);
    }
  }

  function updateSwStatus(text, statusClass) {
    if (!swBadge) return;
    swBadge.textContent = text;
    swBadge.className = `indicator-value ${statusClass}`;
  }

  // -------------------------------------------------------------
  // 2. Consulta y Gestión de Permisos de Notificación
  // -------------------------------------------------------------
  async function initNotificationPermissions() {
    if (!('Notification' in window)) {
      updatePermBadge('denied', 'No Soportado');
      addLog('error', 'La Notification API no está disponible en este navegador.');
      btnRequestPerm.disabled = true;
      btnSendNow.disabled = true;
      btnSendDelayed.disabled = true;
      return;
    }

    // Actualizar badge con el permiso actual
    updatePermissionUI(Notification.permission);

    // Si la Permissions API soporta 'notifications', escuchar cambios en vivo
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permStatus = await navigator.permissions.query({ name: 'notifications' });
        updatePermissionUI(permStatus.state);

        permStatus.onchange = () => {
          addLog('info', `Estado del permiso de notificación actualizado a: ${permStatus.state}`);
          updatePermissionUI(permStatus.state);
        };
      } catch (e) {
        // Fallback básico si query notifications no está habilitado
        console.warn('Permissions query para notifications no disponible:', e);
      }
    }
  }

  function updatePermissionUI(state) {
    if (state === 'granted') {
      updatePermBadge('granted', 'Concedido');
      btnRequestPerm.disabled = true;
      btnRequestPerm.innerHTML = '<span>✓ Permiso Concedido</span>';
      btnSendNow.disabled = false;
      btnSendDelayed.disabled = false;
    } else if (state === 'denied') {
      updatePermBadge('denied', 'Bloqueado');
      btnRequestPerm.disabled = false;
      btnRequestPerm.innerHTML = '<span>⚠️ Permiso Bloqueado en Ajustes</span>';
      btnSendNow.disabled = true;
      btnSendDelayed.disabled = true;
    } else {
      updatePermBadge('default', 'Pendiente (Default)');
      btnRequestPerm.disabled = false;
      btnRequestPerm.innerHTML = '<span>🔔 Solicitar Permiso</span>';
      btnSendNow.disabled = false;
      btnSendDelayed.disabled = false;
    }
  }

  function updatePermBadge(statusClass, label) {
    if (!permBadge) return;
    permBadge.className = `indicator-value ${statusClass}`;
    permBadge.textContent = label;
  }

  // Solicitar permiso explícito al usuario
  btnRequestPerm.addEventListener('click', async () => {
    if (!('Notification' in window)) return;

    addLog('info', 'Solicitando permiso de notificación al usuario (Notification.requestPermission)...');
    try {
      const permission = await Notification.requestPermission();
      updatePermissionUI(permission);

      if (permission === 'granted') {
        addLog('success', 'Permiso concedido por el usuario.');
        showToast('Permiso de notificación concedido', 'success');
      } else if (permission === 'denied') {
        addLog('error', 'El usuario denegó los permisos de notificación.');
        showToast('Permiso bloqueado. Debes habilitarlo en los ajustes del sitio.', 'danger');
      } else {
        addLog('info', 'El usuario descartó el diálogo de permiso.');
      }
    } catch (err) {
      addLog('error', `Error solicitando permisos: ${err.message}`);
    }
  });

  // -------------------------------------------------------------
  // 3. Sincronización en Tiempo Real de la Vista Previa
  // -------------------------------------------------------------
  function syncPreview() {
    if (previewTitle) previewTitle.textContent = notifTitleInput.value.trim() || 'Sin título';
    if (previewBody) previewBody.textContent = notifBodyInput.value.trim() || 'Sin contenido de mensaje';
    if (previewTag) previewTag.textContent = `TAG: ${(notifTagInput.value.trim() || 'DEFAULT').toUpperCase()}`;

    if (previewActionsContainer) {
      previewActionsContainer.style.display = notifIncludeActionsCheck.checked ? 'flex' : 'none';
    }
  }

  notifTitleInput.addEventListener('input', syncPreview);
  notifBodyInput.addEventListener('input', syncPreview);
  notifTagInput.addEventListener('input', syncPreview);
  notifIncludeActionsCheck.addEventListener('change', syncPreview);

  // -------------------------------------------------------------
  // 4. Presets Rápidos
  // -------------------------------------------------------------
  const presetsData = {
    info: {
      title: 'Alerta del Sistema PWA',
      body: 'El entorno de ejecución local se encuentra activo y listo para operar offline.',
      tag: 'pwa-system-info',
      vibration: '[200, 100, 200]',
      interaction: false,
      actions: true
    },
    task: {
      title: 'Recordatorio de Tarea',
      body: 'Recuerda revisar la implementación de IndexedDB en el siguiente ejercicio.',
      tag: 'pwa-task-reminder',
      vibration: '[100, 50, 100, 50, 100]',
      interaction: false,
      actions: true
    },
    security: {
      title: 'Aviso de Seguridad Crítico',
      body: 'Se ha detectado un cambio en el hardware de red. Verificación completada.',
      tag: 'pwa-security-alert',
      vibration: '[500, 200, 500]',
      interaction: true,
      actions: true
    }
  };

  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const presetKey = chip.getAttribute('data-preset');
      const data = presetsData[presetKey];
      if (!data) return;

      notifTitleInput.value = data.title;
      notifBodyInput.value = data.body;
      notifTagInput.value = data.tag;
      notifVibrationSelect.value = data.vibration;
      notifRequireInteractionCheck.checked = data.interaction;
      notifIncludeActionsCheck.checked = data.actions;

      syncPreview();
      addLog('info', `Plantilla rápida cargada: "${data.title}"`);
      showToast(`Plantilla "${data.title}" aplicada`, 'info');
    });
  });

  // -------------------------------------------------------------
  // 5. Construcción y Disparo de Notificaciones Locales
  // -------------------------------------------------------------
  async function triggerNotification() {
    // 1. Verificar soporte
    if (!('Notification' in window)) {
      showToast('Navegador sin soporte de notificaciones', 'danger');
      return;
    }

    // 2. Si no tiene permiso concedido, solicitarlo primero
    if (Notification.permission !== 'granted') {
      addLog('info', 'Permiso no concedido previamente. Solicitando ahora...');
      const requested = await Notification.requestPermission();
      updatePermissionUI(requested);
      if (requested !== 'granted') {
        showToast('No se puede mostrar la notificación sin permisos', 'danger');
        addLog('error', 'Disparo cancelado: Permiso no concedido.');
        return;
      }
    }

    // 3. Asegurar Service Worker activo
    if (!swRegistration) {
      addLog('info', 'Esperando a que el Service Worker esté listo...');
      swRegistration = await navigator.serviceWorker.ready;
    }

    const title = notifTitleInput.value.trim() || 'Notificación PWA';
    const body = notifBodyInput.value.trim() || 'Mensaje de notificación local.';
    const tag = notifTagInput.value.trim() || 'pwa-local-tag';
    
    // Parsear patrón de vibración
    let vibratePattern = [200, 100, 200];
    try {
      vibratePattern = JSON.parse(notifVibrationSelect.value);
    } catch (e) {
      vibratePattern = [200, 100, 200];
    }

    const options = {
      body: body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: tag,
      vibrate: vibratePattern,
      requireInteraction: notifRequireInteractionCheck.checked,
      renotify: true,
      data: {
        timestamp: Date.now(),
        source: 'ejercicio3-pwa'
      }
    };

    // Agregar botones de acción si están habilitados
    if (notifIncludeActionsCheck.checked) {
      options.actions = [
        { action: 'explore', title: 'Explorar' },
        { action: 'dismiss', title: 'Descartar' }
      ];
    }

    addLog('info', `Emitiendo notificación: "${title}" (Tag: ${tag})...`);

    try {
      // Disparo mediante la API del Service Worker Registration
      await swRegistration.showNotification(title, options);
      addLog('success', `Notificación local lanzada con éxito a través del Service Worker.`);
      showToast('Notificación enviada al sistema operativo', 'success');
    } catch (err) {
      addLog('error', `Error en showNotification: ${err.message}`);
      showToast(`Error al disparar: ${err.message}`, 'danger');
    }
  }

  // Disparo Inmediato
  btnSendNow.addEventListener('click', () => {
    triggerNotification();
  });

  // Disparo Diferido (5 segundos)
  btnSendDelayed.addEventListener('click', () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      btnDelayedText.textContent = '⏱ Disparar en 5 Segundos';
      btnSendDelayed.classList.remove('btn-accent');
      addLog('info', 'Disparo diferido cancelado por el usuario.');
      return;
    }

    let timeLeft = 5;
    btnSendDelayed.classList.add('btn-accent');
    btnDelayedText.textContent = `⏱ En ${timeLeft}s (¡Minimiza o cambia de app!)`;
    addLog('info', `Cuenta regresiva iniciada: ${timeLeft} segundos antes de emitir notificación.`);
    showToast('Minimiza la ventana para ver la notificación del sistema', 'warning');

    countdownInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btnDelayedText.textContent = `⏱ En ${timeLeft}s (¡Minimiza o cambia de app!)`;
      } else {
        clearInterval(countdownInterval);
        countdownInterval = null;
        btnDelayedText.textContent = '⏱ Disparar en 5 Segundos';
        btnSendDelayed.classList.remove('btn-accent');
        triggerNotification();
      }
    }, 1000);
  });

  // -------------------------------------------------------------
  // 6. Mensajería entrante del Service Worker
  // -------------------------------------------------------------
  function handleServiceWorkerMessage(data) {
    if (!data) return;

    if (data.type === 'NOTIFICATION_SHOWN') {
      addLog('success', `[SW Event] Notificación mostrada: "${data.title}" (${data.timestamp})`);
    } else if (data.type === 'NOTIFICATION_CLICKED') {
      addLog('click', `[SW Event] ¡Usuario hizo clic en la notificación! Acción: "${data.action}", Tag: "${data.tag}"`);
      showToast(`Clic recibido en notificación (Acción: ${data.action})`, 'info');
    } else if (data.type === 'NOTIFICATION_CLOSED') {
      addLog('info', `[SW Event] Notificación descartada por el usuario (Tag: ${data.tag})`);
    } else if (data.type === 'NOTIFICATION_ERROR') {
      addLog('error', `[SW Event] Error reportado por SW: ${data.error}`);
    }
  }

  // -------------------------------------------------------------
  // 7. Consola de Registro (Terminal UI)
  // -------------------------------------------------------------
  function addLog(type, message) {
    if (!terminalLogsBox) return;

    const timeStr = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const typeLabels = {
      info: 'INFO',
      success: 'OK',
      click: 'CLICK',
      error: 'ERROR'
    };

    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-type ${type}">${typeLabels[type] || 'LOG'}</span>
      <span class="log-msg">${escapeHtml(message)}</span>
    `;

    terminalLogsBox.appendChild(entry);
    terminalLogsBox.scrollTop = terminalLogsBox.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  btnClearLogs.addEventListener('click', () => {
    terminalLogsBox.innerHTML = '';
    addLog('info', 'Registro de eventos limpiado.');
  });

  // -------------------------------------------------------------
  // 8. Toasts UI
  // -------------------------------------------------------------
  function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // -------------------------------------------------------------
  // 9. Detección de Conexión de Red
  // -------------------------------------------------------------
  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    if (networkBadge && networkDot && networkText) {
      if (isOnline) {
        networkBadge.className = 'status-pill online';
        networkDot.className = 'dot online';
        networkText.textContent = 'En línea';
      } else {
        networkBadge.className = 'status-pill offline';
        networkDot.className = 'dot offline';
        networkText.textContent = 'Sin conexión';
      }
    }
  }

  window.addEventListener('online', () => {
    updateNetworkStatus();
    addLog('info', 'Conexión de red restablecida (Online).');
    showToast('Conexión reestablecida', 'success');
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    addLog('info', 'Sin conexión a Internet (Offline). Operando en modo desconectado.');
    showToast('Sin conexión a Internet', 'warning');
  });

  // -------------------------------------------------------------
  // Inicialización
  // -------------------------------------------------------------
  updateNetworkStatus();
  syncPreview();
  initServiceWorker();
  initNotificationPermissions();
});
