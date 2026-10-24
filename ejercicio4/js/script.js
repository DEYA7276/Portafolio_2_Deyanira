/**
 * Ejercicio 4: Persistencia de Datos Asíncrona con IndexedDB
 * Lógica de cliente: Inicialización de IDBDatabase, creación de IDBObjectStore,
 * operaciones CRUD completas y telemetría de almacenamiento offline.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Constantes de Base de Datos
  const DB_NAME = 'PWA_Portfolio_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'registros_local';

  let db = null;
  let allRecords = [];

  // Elementos UI
  const recordForm = document.getElementById('record-form');
  const recordIdInput = document.getElementById('record-id');
  const recordTitleInput = document.getElementById('record-title');
  const recordCategorySelect = document.getElementById('record-category');
  const recordPrioritySelect = document.getElementById('record-priority');
  const recordNotesTextarea = document.getElementById('record-notes');
  const btnSaveRecord = document.getElementById('btn-save-record');
  const btnResetForm = document.getElementById('btn-reset-form');
  const formHeading = document.getElementById('form-heading');

  const btnSeedSamples = document.getElementById('btn-seed-samples');
  const btnClearDb = document.getElementById('btn-clear-db');

  const searchQueryInput = document.getElementById('search-query');
  const filterCategorySelect = document.getElementById('filter-category');
  const sortOrderSelect = document.getElementById('sort-order');
  const recordsContainer = document.getElementById('records-container');

  const metricDbName = document.getElementById('metric-db-name');
  const metricStoreName = document.getElementById('metric-store-name');
  const metricRecordsCount = document.getElementById('metric-records-count');
  const metricStorageUsed = document.getElementById('metric-storage-used');

  const terminalLogsBox = document.getElementById('terminal-logs-box');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const toastContainer = document.getElementById('toast-container');

  const networkBadge = document.getElementById('network-badge');
  const networkDot = document.getElementById('network-dot');
  const networkText = document.getElementById('network-text');

  // -------------------------------------------------------------
  // 1. Registro del Service Worker (PWA Shell)
  // -------------------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((reg) => {
        addLog('info', `Service Worker activo en scope: ${reg.scope}`);
      })
      .catch((err) => {
        addLog('info', `Fallo al registrar SW: ${err.message}`);
      });
  }

  // -------------------------------------------------------------
  // 2. Inicialización de IndexedDB (Apertura y Object Store)
  // -------------------------------------------------------------
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      addLog('info', `Ejecutando indexedDB.open("${DB_NAME}", ${DB_VERSION})...`);
      
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      // Evento upgradeneeded: Creación de Object Store e índices si no existen
      request.onupgradeneeded = (event) => {
        const upgradeDb = event.target.result;
        addLog('info', `Evento onupgradeneeded activado (v${event.oldVersion} -> v${event.newVersion}).`);

        if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
          const store = upgradeDb.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
          });

          // Índices secundarios para consultas optimizadas
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });

          addLog('create', `Object Store "${STORE_NAME}" e índices creados con keyPath: "id".`);
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        metricDbName.textContent = db.name;
        metricStoreName.textContent = STORE_NAME;
        addLog('read', `Conexión a IndexedDB establecida exitosamente.`);

        // Manejar cierre o error inesperado
        db.onerror = (e) => {
          addLog('error', `Error general en IDB: ${e.target.error?.message}`);
        };

        resolve(db);
      };

      request.onerror = (event) => {
        addLog('error', `Error al abrir IndexedDB: ${event.target.error?.message}`);
        reject(event.target.error);
      };

      request.onblocked = () => {
        addLog('info', 'Apertura de BD bloqueada por otra pestaña activa.');
      };
    });
  }

  // -------------------------------------------------------------
  // 3. Operaciones CRUD (Create, Read, Update, Delete)
  // -------------------------------------------------------------

  // READ: Obtener todos los registros del Object Store
  function loadAllRecords() {
    return new Promise((resolve, reject) => {
      if (!db) return resolve([]);

      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        allRecords = request.result || [];
        metricRecordsCount.textContent = allRecords.length;
        renderRecords();
        updateStorageEstimate();
        resolve(allRecords);
      };

      request.onerror = (e) => {
        addLog('error', `Error en getAll: ${e.target.error?.message}`);
        reject(e.target.error);
      };
    });
  }

  // CREATE: Insertar nuevo registro
  function insertRecord(data) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = {
        title: data.title,
        category: data.category,
        priority: data.priority,
        notes: data.notes,
        createdAt: new Date().toISOString()
      };

      const request = store.add(record);

      request.onsuccess = (e) => {
        const newId = e.target.result;
        addLog('create', `Registro insertado con éxito [ID: #${newId}] "${record.title}".`);
        showToast('Registro guardado en IndexedDB', 'success');
        resolve(newId);
      };

      request.onerror = (e) => {
        addLog('error', `Error en store.add: ${e.target.error?.message}`);
        reject(e.target.error);
      };

      tx.oncomplete = () => {
        loadAllRecords();
      };
    });
  }

  // UPDATE: Actualizar registro existente
  function updateRecord(id, data) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Obtener el registro previo para preservar campos inmutables
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          showToast('Registro no encontrado para actualizar', 'danger');
          return reject(new Error('Registro no encontrado'));
        }

        const updated = {
          ...existing,
          title: data.title,
          category: data.category,
          priority: data.priority,
          notes: data.notes,
          updatedAt: new Date().toISOString()
        };

        const putReq = store.put(updated);

        putReq.onsuccess = () => {
          addLog('update', `Registro actualizado con éxito [ID: #${id}] "${updated.title}".`);
          showToast('Registro actualizado', 'success');
          resolve(updated);
        };

        putReq.onerror = (e) => {
          addLog('error', `Error en store.put: ${e.target.error?.message}`);
          reject(e.target.error);
        };
      };

      tx.oncomplete = () => {
        loadAllRecords();
      };
    });
  }

  // DELETE: Eliminar un registro por ID
  function deleteRecord(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        addLog('delete', `Registro eliminado [ID: #${id}].`);
        showToast('Registro eliminado de la base local', 'danger');
        resolve(true);
      };

      request.onerror = (e) => {
        addLog('error', `Error en store.delete: ${e.target.error?.message}`);
        reject(e.target.error);
      };

      tx.oncomplete = () => {
        loadAllRecords();
      };
    });
  }

  // CLEAR: Vaciar todos los registros del almacén
  function clearAllRecords() {
    if (!confirm('¿Estás seguro de vaciar todos los registros del Object Store?')) return;

    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      addLog('delete', `Todos los registros fueron eliminados (store.clear()).`);
      showToast('Almacén local vaciado', 'info');
    };

    tx.oncomplete = () => {
      loadAllRecords();
      resetForm();
    };
  }

  // -------------------------------------------------------------
  // 4. Renderizado Dinámico de Registros
  // -------------------------------------------------------------
  function renderRecords() {
    const query = searchQueryInput.value.trim().toLowerCase();
    const category = filterCategorySelect.value;
    const sort = sortOrderSelect.value;

    let filtered = allRecords.filter((rec) => {
      const matchesQuery = rec.title.toLowerCase().includes(query) || rec.notes.toLowerCase().includes(query);
      const matchesCategory = category === 'all' || rec.category === category;
      return matchesQuery && matchesCategory;
    });

    // Ordenamiento
    if (sort === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === 'title') {
      filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (filtered.length === 0) {
      recordsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📂</div>
          <div class="empty-state-title">No hay registros coincidentes</div>
          <p class="empty-state-desc">El Object Store está vacío o ningún elemento coincide con tu búsqueda.</p>
        </div>
      `;
      return;
    }

    recordsContainer.innerHTML = filtered.map((rec) => {
      const dateStr = new Date(rec.createdAt).toLocaleString();
      return `
        <div class="record-item" data-id="${rec.id}">
          <div class="record-header">
            <span class="record-title">${escapeHtml(rec.title)}</span>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <span class="badge-tag ${rec.category}">${rec.category}</span>
              <span class="badge-priority ${rec.priority}">Prioridad ${rec.priority}</span>
            </div>
          </div>
          <p class="record-body">${escapeHtml(rec.notes)}</p>
          <div class="record-footer">
            <span class="record-meta">ID: #${rec.id} • ${dateStr}</span>
            <div class="record-actions">
              <button class="btn btn-secondary btn-sm btn-edit" data-id="${rec.id}" title="Editar registro">✏️ Editar</button>
              <button class="btn btn-danger-outline btn-sm btn-delete" data-id="${rec.id}" title="Eliminar registro">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Asignar listeners a botones de acción de cada registro
    recordsContainer.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        editRecord(id);
      });
    });

    recordsContainer.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        deleteRecord(id);
      });
    });
  }

  // Cargar registro en el formulario para edición
  function editRecord(id) {
    const record = allRecords.find((r) => r.id === id);
    if (!record) return;

    recordIdInput.value = record.id;
    recordTitleInput.value = record.title;
    recordCategorySelect.value = record.category;
    recordPrioritySelect.value = record.priority;
    recordNotesTextarea.value = record.notes;

    formHeading.textContent = `Editar Registro #${record.id}`;
    btnSaveRecord.innerHTML = '<span>💾 Actualizar Registro</span>';
    btnResetForm.textContent = 'Cancelar';

    recordTitleInput.focus();
    addLog('read', `Cargado registro #${record.id} para edición.`);
  }

  // Limpiar formulario y volver al modo crear
  function resetForm() {
    recordIdInput.value = '';
    recordForm.reset();
    formHeading.textContent = 'Nuevo Registro';
    btnSaveRecord.innerHTML = '<span>💾 Guardar Registro</span>';
    btnResetForm.textContent = 'Limpiar';
  }

  // -------------------------------------------------------------
  // 5. Eventos del Formulario y Filtros
  // -------------------------------------------------------------
  recordForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = recordTitleInput.value.trim();
    const notes = recordNotesTextarea.value.trim();
    const category = recordCategorySelect.value;
    const priority = recordPrioritySelect.value;

    if (!title || !notes) {
      showToast('Por favor completa todos los campos requeridos', 'danger');
      return;
    }

    const id = recordIdInput.value ? parseInt(recordIdInput.value, 10) : null;

    if (id) {
      // Actualizar
      updateRecord(id, { title, category, priority, notes }).then(() => {
        resetForm();
      });
    } else {
      // Crear
      insertRecord({ title, category, priority, notes }).then(() => {
        resetForm();
      });
    }
  });

  btnResetForm.addEventListener('click', resetForm);

  // Búsqueda y filtrado en vivo
  searchQueryInput.addEventListener('input', renderRecords);
  filterCategorySelect.addEventListener('change', renderRecords);
  sortOrderSelect.addEventListener('change', renderRecords);

  // Semilla de datos de prueba
  btnSeedSamples.addEventListener('click', async () => {
    const samples = [
      {
        title: 'Calibración de Sensor Giroscópico',
        category: 'sensores',
        priority: 'alta',
        notes: 'Lectura de ejes X, Y, Z persistida tras desconexión del chip del dispositivo.'
      },
      {
        title: 'Tokens de Permiso de Cámara y Audio',
        category: 'permisos',
        priority: 'media',
        notes: 'Almacenamiento del historial de solicitudes mediante navigator.permissions.'
      },
      {
        title: 'Configuración PWA Offline Shell',
        category: 'pwa',
        priority: 'baja',
        notes: 'Caché estático sincronizado con Service Worker y soporte para ciclo de vida de instalación.'
      }
    ];

    addLog('create', 'Insertando 3 registros de demostración en lote...');
    for (const item of samples) {
      await insertRecord(item);
    }
    showToast('3 registros de prueba insertados', 'success');
  });

  // Vaciar base de datos
  btnClearDb.addEventListener('click', clearAllRecords);

  // -------------------------------------------------------------
  // 6. Telemetría de Almacenamiento (Storage Estimation API)
  // -------------------------------------------------------------
  async function updateStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const usedKB = (estimate.usage / 1024).toFixed(1);
        const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
        metricStorageUsed.textContent = `${usedKB} KB (${quotaMB} MB disponibles)`;
      } catch (err) {
        metricStorageUsed.textContent = 'Disponible';
      }
    } else {
      metricStorageUsed.textContent = 'No soportado';
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
      create: 'ADD',
      read: 'GET',
      update: 'PUT',
      delete: 'DEL',
      info: 'INFO',
      error: 'ERR'
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
    addLog('info', 'Consola de transacciones limpiada.');
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
    }, 3000);
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
        networkText.textContent = 'Sin conexión (Offline CRUD Activo)';
      }
    }
  }

  window.addEventListener('online', () => {
    updateNetworkStatus();
    addLog('info', 'Conexión a internet reestablecida.');
    showToast('Conectado a Internet', 'success');
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    addLog('info', 'Sin conexión de red. IndexedDB sigue operando al 100% offline.');
    showToast('Modo offline: IDB activo localmente', 'info');
  });

  // -------------------------------------------------------------
  // Inicialización
  // -------------------------------------------------------------
  updateNetworkStatus();
  initIndexedDB()
    .then(() => loadAllRecords())
    .catch((err) => {
      console.error('Error al inicializar IndexedDB:', err);
    });
});
