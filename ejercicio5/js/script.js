/**
 * Ejercicio 5: Estrategia de Caché Dinámica con Fallback a IndexedDB / Network-First
 * Lógica de cliente: Fetch API con estrategia Network-First, persistencia reactiva
 * en IndexedDB, fallback transparente en caso de desconexión y simulación offline.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Constantes
  const API_ENDPOINT = 'https://jsonplaceholder.typicode.com/posts?_limit=9';
  const DB_NAME = 'PWA_CacheFallback_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'api_posts';

  let db = null;
  let currentPosts = [];
  let lastSyncTimestamp = null;
  let isSimulatedOffline = false;

  // Elementos UI
  const networkBadge = document.getElementById('network-badge');
  const networkDot = document.getElementById('network-dot');
  const networkText = document.getElementById('network-text');

  const sourceBadge = document.getElementById('source-badge');
  const lastSyncTime = document.getElementById('last-sync-time');
  const itemsCount = document.getElementById('items-count');
  const itemsContainer = document.getElementById('items-container');

  const btnFetchNetwork = document.getElementById('btn-fetch-network');
  const btnToggleOfflineSim = document.getElementById('btn-toggle-offline-sim');
  const btnToggleOfflineText = document.getElementById('btn-toggle-offline-text');
  const btnInspectJson = document.getElementById('btn-inspect-json');
  const btnClearCache = document.getElementById('btn-clear-cache');

  const jsonModal = document.getElementById('json-modal');
  const modalJsonContent = document.getElementById('modal-json-content');
  const btnCloseModal = document.getElementById('btn-close-modal');

  const terminalLogsBox = document.getElementById('terminal-logs-box');
  const btnClearTerminal = document.getElementById('btn-clear-terminal');
  const toastContainer = document.getElementById('toast-container');

  // -------------------------------------------------------------
  // 1. Registro del Service Worker
  // -------------------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((reg) => {
        addLog('info', `Service Worker de red y caché registrado en scope: ${reg.scope}`);
      })
      .catch((err) => {
        addLog('err', `Error al registrar Service Worker: ${err.message}`);
      });
  }

  // -------------------------------------------------------------
  // 2. Inicialización de IndexedDB para Fallback Local
  // -------------------------------------------------------------
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      addLog('idb', `Abriendo base de datos IndexedDB "${DB_NAME}"...`);
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const upgradeDb = event.target.result;
        if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
          upgradeDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
          addLog('idb', `Object Store "${STORE_NAME}" creado para snapshots de API.`);
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        addLog('idb', 'Conexión a IndexedDB lista para persistencia de respaldo.');
        resolve(db);
      };

      request.onerror = (event) => {
        addLog('err', `Error al abrir IDB: ${event.target.error?.message}`);
        reject(event.target.error);
      };
    });
  }

  // Guardar posts recibidos de la red en IndexedDB
  function savePostsToIDB(posts, timestamp) {
    return new Promise((resolve, reject) => {
      if (!db) return resolve();

      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Guardamos el snapshot completo bajo una clave única 'latest_snapshot'
      const snapshotRecord = {
        id: 'latest_snapshot',
        posts: posts,
        timestamp: timestamp,
        count: posts.length
      };

      const putReq = store.put(snapshotRecord);

      putReq.onsuccess = () => {
        addLog('idb', `Snapshot guardado en IndexedDB (${posts.length} artículos persistidos localmente).`);
        resolve();
      };

      putReq.onerror = (e) => {
        addLog('err', `Fallo al escribir en IDB: ${e.target.error?.message}`);
        reject(e.target.error);
      };
    });
  }

  // Leer snapshot desde IndexedDB
  function loadPostsFromIDB() {
    return new Promise((resolve, reject) => {
      if (!db) return resolve(null);

      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('latest_snapshot');

      getReq.onsuccess = () => {
        const record = getReq.result;
        resolve(record || null);
      };

      getReq.onerror = (e) => {
        addLog('err', `Error al leer de IDB: ${e.target.error?.message}`);
        reject(e.target.error);
      };
    });
  }

  // Purgar snapshot de IndexedDB
  function clearPostsFromIDB() {
    return new Promise((resolve, reject) => {
      if (!db) return resolve();

      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();

      clearReq.onsuccess = () => {
        addLog('idb', 'Almacén de IndexedDB purgado.');
        resolve();
      };

      clearReq.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }

  // -------------------------------------------------------------
  // 3. Estrategia Network-First con Fallback Automático
  // -------------------------------------------------------------
  async function executeNetworkFirstStrategy() {
    btnFetchNetwork.disabled = true;
    btnFetchNetwork.innerHTML = '<span>⏳ Conectando...</span>';

    const startTime = performance.now();
    addLog('net', `[Network-First] Iniciando petición a ${API_ENDPOINT}...`);

    // Comprobar si se está forzando modo offline o no hay red
    if (isSimulatedOffline || !navigator.onLine) {
      addLog('warn', isSimulatedOffline ? 'Modo Offline Simulado activo.' : 'El dispositivo no tiene conexión a internet.');
      await handleFallback('Sin conexión a red');
      btnFetchNetwork.disabled = false;
      btnFetchNetwork.innerHTML = '<span>🔄 Sincronizar desde API REST</span>';
      return;
    }

    try {
      // 1. Intento primario por Red (Network)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const response = await fetch(API_ENDPOINT, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Respuesta HTTP no satisfactoria: ${response.status}`);
      }

      const data = await response.json();
      const duration = Math.round(performance.now() - startTime);
      lastSyncTimestamp = new Date();

      addLog('net', `[Respuesta 200 OK] Recibidos ${data.length} artículos en ${duration}ms desde el servidor.`);

      // 2. Persistir copia reactiva en IndexedDB
      await savePostsToIDB(data, lastSyncTimestamp.toISOString());

      // 3. Renderizar vista en vivo
      currentPosts = data;
      renderPosts(data, 'live');

      // Actualizar telemetría
      updateSourceBadge('network');
      lastSyncTime.textContent = lastSyncTimestamp.toLocaleTimeString();
      itemsCount.textContent = `${data.length} artículos`;
      btnInspectJson.disabled = false;

      showToast(`Sincronizado desde la red (${data.length} artículos)`, 'success');

    } catch (networkError) {
      addLog('err', `Fallo de red: ${networkError.message}. Activando fallback automático...`);
      await handleFallback(networkError.message);
    } finally {
      btnFetchNetwork.disabled = false;
      btnFetchNetwork.innerHTML = '<span>🔄 Sincronizar desde API REST</span>';
    }
  }

  // Manejo del Fallback a IndexedDB
  async function handleFallback(reason) {
    addLog('cache', `Buscando último snapshot guardado en IndexedDB [Fallback por: ${reason}]...`);
    const snapshot = await loadPostsFromIDB();

    if (snapshot && snapshot.posts && snapshot.posts.length > 0) {
      currentPosts = snapshot.posts;
      const savedDate = new Date(snapshot.timestamp).toLocaleTimeString();
      
      addLog('idb', `¡Éxito en Fallback! Recuperados ${snapshot.posts.length} artículos guardados a las ${savedDate}.`);
      
      renderPosts(snapshot.posts, 'cached');
      updateSourceBadge('indexeddb');
      lastSyncTime.textContent = `${savedDate} (Snapshot)`;
      itemsCount.textContent = `${snapshot.posts.length} artículos`;
      btnInspectJson.disabled = false;

      showToast('Sin red: Datos recuperados automáticamente de IndexedDB', 'warning');
    } else {
      addLog('err', 'No existen datos previos almacenados en IndexedDB.');
      renderEmptyState();
      updateSourceBadge('empty');
      showToast('Sin datos locales disponibles. Conéctate a internet para sincronizar.', 'danger');
    }
  }

  // -------------------------------------------------------------
  // 4. Renderizado Dinámico de Artículos
  // -------------------------------------------------------------
  function renderPosts(posts, source) {
    if (!posts || posts.length === 0) {
      renderEmptyState();
      return;
    }

    const sourceLabel = source === 'live' ? 'En Vivo (Red)' : 'Persistido (IndexedDB)';
    const sourceClass = source === 'live' ? 'live' : 'cached';

    itemsContainer.innerHTML = posts.map((post) => {
      return `
        <article class="api-card">
          <div class="api-card-header">
            <span class="api-card-id">POST #${post.id}</span>
            <span class="api-card-source ${sourceClass}">${sourceLabel}</span>
          </div>

          <h3 class="api-card-title">${escapeHtml(post.title)}</h3>
          <p class="api-card-body">${escapeHtml(post.body)}</p>

          <div class="api-card-footer">
            <span>Usuario ID: ${post.userId || 1}</span>
            <span>REST API Endpoint</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderEmptyState() {
    itemsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background-color: var(--bg-card); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📡</div>
        <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--text-title); margin-bottom: 0.35rem;">Sin datos en pantalla</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 360px; margin: 0 auto 1.25rem;">
          Haz clic en "Sincronizar desde API REST" para descargar los datos por primera vez y guardarlos en IndexedDB.
        </p>
      </div>
    `;
    itemsCount.textContent = '0 elementos';
    btnInspectJson.disabled = true;
  }

  function updateSourceBadge(status) {
    if (!sourceBadge) return;

    if (status === 'network') {
      sourceBadge.innerHTML = '<span class="telemetry-tag network">📡 RED EN VIVO</span>';
    } else if (status === 'indexeddb') {
      sourceBadge.innerHTML = '<span class="telemetry-tag indexeddb">💾 INDEXEDDB LOCAL</span>';
    } else {
      sourceBadge.innerHTML = '<span class="telemetry-tag initial">Esperando Solicitud</span>';
    }
  }

  // -------------------------------------------------------------
  // 5. Botones de Control y Simulación
  // -------------------------------------------------------------
  btnFetchNetwork.addEventListener('click', () => {
    executeNetworkFirstStrategy();
  });

  // Toggle de Simulación Offline
  btnToggleOfflineSim.addEventListener('click', () => {
    isSimulatedOffline = !isSimulatedOffline;

    if (isSimulatedOffline) {
      btnToggleOfflineSim.classList.remove('btn-warning-outline');
      btnToggleOfflineSim.classList.add('btn-warning-active');
      btnToggleOfflineText.textContent = '🔌 Desconexión Simulada ACTIVA (Restablecer)';
      updateNetworkBadge('simulated');
      addLog('warn', 'Simulación de desconexión ACTIVADA. La próxima petición probará el fallback a IndexedDB.');
      showToast('Modo desconectado simulado activado', 'warning');
    } else {
      btnToggleOfflineSim.classList.remove('btn-warning-active');
      btnToggleOfflineSim.classList.add('btn-warning-outline');
      btnToggleOfflineText.textContent = '🔌 Simular Desconexión de Red';
      updateNetworkStatus();
      addLog('net', 'Simulación de desconexión DESACTIVADA. La red vuelve a estar disponible.');
      showToast('Conexión normal reestablecida', 'success');
    }
  });

  // Purgar Almacén Local
  btnClearCache.addEventListener('click', async () => {
    if (!confirm('¿Deseas purgar el snapshot de IndexedDB y vaciar la vista?')) return;

    await clearPostsFromIDB();
    currentPosts = [];
    renderEmptyState();
    updateSourceBadge('empty');
    lastSyncTime.textContent = 'Ninguna';
    addLog('info', 'Almacén local y contenedor de vista vaciados.');
    showToast('Caché e IndexedDB limpiados', 'info');
  });

  // Modal JSON Crudo
  btnInspectJson.addEventListener('click', () => {
    if (!currentPosts || currentPosts.length === 0) return;

    modalJsonContent.textContent = JSON.stringify(currentPosts, null, 2);
    jsonModal.classList.add('active');
  });

  btnCloseModal.addEventListener('click', () => {
    jsonModal.classList.remove('active');
  });

  jsonModal.addEventListener('click', (e) => {
    if (e.target === jsonModal) jsonModal.classList.remove('active');
  });

  // -------------------------------------------------------------
  // 6. Registro de Transacciones (Terminal UI)
  // -------------------------------------------------------------
  function addLog(type, message) {
    if (!terminalLogsBox) return;

    const timeStr = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const typeLabels = {
      net: 'NET',
      cache: 'CACHE',
      idb: 'IDB',
      err: 'ERR',
      warn: 'WARN',
      info: 'INFO'
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

  btnClearTerminal.addEventListener('click', () => {
    terminalLogsBox.innerHTML = '';
    addLog('info', 'Registro de eventos de red limpiado.');
  });

  // -------------------------------------------------------------
  // 7. Toasts UI
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
  // 8. Detección de Estado de Red
  // -------------------------------------------------------------
  function updateNetworkStatus() {
    if (isSimulatedOffline) return;

    const isOnline = navigator.onLine;
    if (isOnline) {
      updateNetworkBadge('online');
    } else {
      updateNetworkBadge('offline');
    }
  }

  function updateNetworkBadge(mode) {
    if (!networkBadge || !networkDot || !networkText) return;

    if (mode === 'online') {
      networkBadge.className = 'status-pill online';
      networkDot.className = 'dot online';
      networkText.textContent = 'En línea';
    } else if (mode === 'simulated') {
      networkBadge.className = 'status-pill simulated-offline';
      networkDot.className = 'dot warning';
      networkText.textContent = 'Modo Offline Simulado';
    } else {
      networkBadge.className = 'status-pill offline';
      networkDot.className = 'dot offline';
      networkText.textContent = 'Sin conexión';
    }
  }

  window.addEventListener('online', () => {
    updateNetworkStatus();
    addLog('net', 'Conexión a internet restablecida en el dispositivo.');
    showToast('Conectado a Internet', 'success');
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    addLog('warn', 'Dispositivo desconectado de internet. Se usará IndexedDB para próximas peticiones.');
    showToast('Sin conexión: Fallback a IndexedDB habilitado', 'warning');
  });

  // -------------------------------------------------------------
  // Inicialización Automática
  // -------------------------------------------------------------
  updateNetworkStatus();
  initIndexedDB()
    .then(async () => {
      // Intentar cargar snapshot existente de IndexedDB inmediatamente al abrir
      const existing = await loadPostsFromIDB();
      if (existing && existing.posts && existing.posts.length > 0) {
        currentPosts = existing.posts;
        const savedDate = new Date(existing.timestamp).toLocaleTimeString();
        addLog('idb', `Cargado snapshot previo desde IndexedDB (${existing.posts.length} elementos guardados a las ${savedDate}).`);
        renderPosts(existing.posts, 'cached');
        updateSourceBadge('indexeddb');
        lastSyncTime.textContent = `${savedDate} (Snapshot)`;
        itemsCount.textContent = `${existing.posts.length} artículos`;
        btnInspectJson.disabled = false;
      } else {
        renderEmptyState();
        // Disparar sincronización inicial automática
        executeNetworkFirstStrategy();
      }
    })
    .catch((err) => {
      console.error('Error inicializando Ejercicio 5:', err);
    });
});
