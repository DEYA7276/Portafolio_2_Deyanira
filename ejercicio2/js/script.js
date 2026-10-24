/**
 * EJERCICIO 2: CAPTURA DE MEDIOS CON CÁMARA Y CANVAS
 * Archivo script.js autocontenido para la carpeta /ejercicio2/
 */

document.addEventListener('DOMContentLoaded', () => {
  let currentStream = null;
  let activeFilter = 'none';

  // Elementos DOM
  const elements = {
    // Permisos
    permBanner: document.getElementById('camera-perm-banner'),
    permOrb: document.getElementById('camera-perm-orb'),
    permStateText: document.getElementById('camera-perm-state'),
    permDesc: document.getElementById('camera-perm-desc'),

    // Controles
    btnToggleCamera: document.getElementById('btn-toggle-camera'),
    btnCaptureSnapshot: document.getElementById('btn-capture-snapshot'),
    selectCameraDevice: document.getElementById('select-camera-device'),

    // Video Feed
    videoFeed: document.getElementById('camera-video-feed'),
    videoPlaceholder: document.getElementById('video-placeholder'),
    videoResolutionText: document.getElementById('video-resolution-text'),
    videoStatusText: document.getElementById('video-status-text'),

    // Canvas Snapshot
    canvas: document.getElementById('snapshot-canvas'),
    canvasPlaceholder: document.getElementById('canvas-placeholder'),
    canvasResolutionText: document.getElementById('canvas-resolution-text'),
    btnDownloadPhoto: document.getElementById('btn-download-photo'),
    btnOpenPhoto: document.getElementById('btn-open-photo'),
    btnClearCanvas: document.getElementById('btn-clear-canvas'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    galleryContainer: document.getElementById('snapshot-gallery'),

    // Red
    networkBadge: document.getElementById('network-badge'),
    networkDot: document.getElementById('network-dot'),
    networkText: document.getElementById('network-text')
  };

  // Toast
  const showToast = (type, title, message) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div>
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  };

  // Red
  const updateNetwork = () => {
    const online = navigator.onLine;
    if (elements.networkBadge && elements.networkDot && elements.networkText) {
      elements.networkBadge.className = `status-pill ${online ? 'online' : 'offline'}`;
      elements.networkDot.className = `dot ${online ? 'online' : 'offline'}`;
      elements.networkText.textContent = online ? 'En línea' : 'Desconectado';
    }
  };
  window.addEventListener('online', () => { updateNetwork(); showToast('success', 'Conexión Restablecida', 'En línea.'); });
  window.addEventListener('offline', () => { updateNetwork(); showToast('warning', 'Sin Conexión', 'Modo offline activo.'); });
  updateNetwork();

  // 1. Permisos
  const checkCameraPermissions = async () => {
    if (!('permissions' in navigator) || !navigator.permissions.query) {
      updatePermissionUI('prompt', 'Permiso de Cámara', 'Listo para solicitar al encender la cámara.');
      return;
    }

    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      renderPermissionState(status.state);

      status.onchange = () => {
        renderPermissionState(status.state);
        showToast('info', 'Permiso Modificado', `Permiso de cámara: ${status.state}`);
      };
    } catch (e) {
      updatePermissionUI('prompt', 'Permiso de Cámara', 'Se solicitará al activar el hardware.');
    }
  };

  const renderPermissionState = (state) => {
    if (state === 'granted') {
      updatePermissionUI(
        'granted',
        'Acceso Autorizado (Granted)',
        'El navegador tiene autorización para utilizar el hardware de cámara.'
      );
    } else if (state === 'prompt') {
      updatePermissionUI(
        'prompt',
        'Pendiente de Solicitud (Prompt)',
        'Al pulsar "Encender cámara" el navegador pedirá confirmación al usuario.'
      );
    } else if (state === 'denied') {
      updatePermissionUI(
        'denied',
        'Acceso Bloqueado (Denied)',
        'El acceso a la cámara fue denegado. Se debe habilitar en el candado de la URL.'
      );
    }
  };

  const updatePermissionUI = (statusClass, title, desc) => {
    if (!elements.permBanner) return;
    elements.permBanner.className = `permission-box ${statusClass}`;
    if (elements.permStateText) elements.permStateText.textContent = title;
    if (elements.permDesc) elements.permDesc.textContent = desc;
  };

  // Enumerar dispositivos de video reales
  const enumerateVideoDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      if (elements.selectCameraDevice) {
        elements.selectCameraDevice.innerHTML = '';

        if (videoDevices.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'Cámara predeterminada';
          elements.selectCameraDevice.appendChild(opt);
          return;
        }

        videoDevices.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Cámara ${index + 1} (${device.deviceId.substring(0, 6)}...)`;
          elements.selectCameraDevice.appendChild(option);
        });
      }
    } catch (err) {
      console.warn('[Ejercicio 2] No se pudieron enumerar dispositivos:', err);
    }
  };

  // 2. getUserMedia Hardware Real
  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('error', 'Incompatible', 'navigator.mediaDevices.getUserMedia no soportado.');
      return;
    }

    const selectedDeviceId = elements.selectCameraDevice ? elements.selectCameraDevice.value : null;

    const constraints = {
      audio: false,
      video: selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId } }
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    };

    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      elements.videoFeed.srcObject = currentStream;
      await elements.videoFeed.play();

      elements.videoFeed.classList.add('active');
      elements.videoPlaceholder.classList.add('hidden');

      if (elements.btnToggleCamera) {
        elements.btnToggleCamera.textContent = '⏹ Apagar cámara';
        elements.btnToggleCamera.style.backgroundColor = 'var(--status-err-border)';
      }

      if (elements.btnCaptureSnapshot) {
        elements.btnCaptureSnapshot.disabled = false;
      }

      if (elements.videoStatusText) {
        elements.videoStatusText.textContent = 'En vivo';
        elements.videoStatusText.style.color = 'var(--status-ok)';
      }

      elements.videoFeed.onloadedmetadata = () => {
        const w = elements.videoFeed.videoWidth;
        const h = elements.videoFeed.videoHeight;
        if (elements.videoResolutionText) {
          elements.videoResolutionText.textContent = `${w} × ${h} px`;
        }
      };

      enumerateVideoDevices();
      checkCameraPermissions();
      showToast('success', 'Cámara Activa', 'Transmitiendo en vivo desde el hardware físico.');
    } catch (err) {
      console.error('[Ejercicio 2] Error al acceder a getUserMedia:', err);
      if (err.name === 'OverconstrainedError') {
        try {
          currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          elements.videoFeed.srcObject = currentStream;
          await elements.videoFeed.play();
          elements.videoFeed.classList.add('active');
          elements.videoPlaceholder.classList.add('hidden');
          if (elements.btnToggleCamera) {
            elements.btnToggleCamera.textContent = '⏹ Apagar cámara';
            elements.btnToggleCamera.style.backgroundColor = 'var(--status-err-border)';
          }
          if (elements.btnCaptureSnapshot) elements.btnCaptureSnapshot.disabled = false;
          return;
        } catch (fErr) {
          handleCameraError(fErr);
          return;
        }
      }
      handleCameraError(err);
    }
  };

  const stopCamera = () => {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }

    if (elements.videoFeed) {
      elements.videoFeed.srcObject = null;
      elements.videoFeed.classList.remove('active');
    }

    if (elements.videoPlaceholder) {
      elements.videoPlaceholder.classList.remove('hidden');
    }

    if (elements.btnToggleCamera) {
      elements.btnToggleCamera.textContent = '🎥 Encender cámara';
      elements.btnToggleCamera.style.backgroundColor = '';
    }

    if (elements.btnCaptureSnapshot) {
      elements.btnCaptureSnapshot.disabled = true;
    }

    if (elements.videoStatusText) {
      elements.videoStatusText.textContent = 'Inactivo';
      elements.videoStatusText.style.color = '';
    }

    if (elements.videoResolutionText) {
      elements.videoResolutionText.textContent = '--';
    }

    showToast('info', 'Cámara Apagada', 'Hardware liberado correctamente.');
  };

  const handleCameraError = (err) => {
    let title = 'Error de Cámara';
    let msg = 'No fue posible acceder al dispositivo de video.';

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      title = 'Permiso Denegado';
      msg = 'El usuario rechazó la solicitud o el navegador tiene bloqueado el origen.';
      updatePermissionUI('denied', 'Acceso Denegado', msg);
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      title = 'Cámara No Encontrada';
      msg = 'No se detectó ningún hardware de cámara web conectado a este equipo.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      title = 'Cámara en Uso';
      msg = 'El sensor ya está siendo utilizado por otra aplicación del sistema.';
    }

    showToast('error', title, msg);
  };

  // 3. Captura en Canvas
  const captureSnapshot = () => {
    if (!elements.videoFeed || !currentStream) {
      showToast('warning', 'Cámara Inactiva', 'Primero enciende la cámara para capturar.');
      return;
    }

    const video = elements.videoFeed;
    const canvas = elements.canvas;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    applyContextFilter(ctx, activeFilter);
    ctx.drawImage(video, 0, 0, width, height);

    canvas.classList.add('active');
    if (elements.canvasPlaceholder) {
      elements.canvasPlaceholder.classList.add('hidden');
    }

    if (elements.canvasResolutionText) {
      elements.canvasResolutionText.textContent = `${width} × ${height} px`;
    }

    if (elements.btnDownloadPhoto) {
      elements.btnDownloadPhoto.disabled = false;
    }

    // Miniatura en galería
    addSnapshotToGallery(canvas.toDataURL('image/jpeg', 0.85));
    showToast('success', 'Foto Capturada', `Instantánea congelada a ${width}×${height} px. Lista para descargar en PNG.`);
  };

  const applyContextFilter = (ctx, filterName) => {
    switch (filterName) {
      case 'grayscale': ctx.filter = 'grayscale(100%)'; break;
      case 'sepia': ctx.filter = 'sepia(80%)'; break;
      case 'invert': ctx.filter = 'invert(100%)'; break;
      case 'contrast': ctx.filter = 'contrast(140%) brightness(105%)'; break;
      default: ctx.filter = 'none'; break;
    }
  };

  const setFilter = (filterName) => {
    activeFilter = filterName;

    elements.filterButtons.forEach((btn) => {
      if (btn.getAttribute('data-filter') === filterName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (elements.canvas.classList.contains('active') && elements.videoFeed) {
      const ctx = elements.canvas.getContext('2d');
      const w = elements.canvas.width;
      const h = elements.canvas.height;
      ctx.clearRect(0, 0, w, h);
      applyContextFilter(ctx, activeFilter);
      ctx.drawImage(elements.videoFeed, 0, 0, w, h);
    }
  };

  // Descarga limpia y 100% garantizada en formato PNG con nombre foto.png
  const downloadSnapshotPNG = () => {
    const canvas = elements.canvas;
    if (!canvas || !canvas.classList.contains('active')) {
      showToast('warning', 'Sin fotografía', 'Primero enciende la cámara y toma una fotografía.');
      return;
    }

    // Generar imagen en formato PNG nativo auténtico (image/png)
    const pngDataUrl = canvas.toDataURL('image/png');

    // 1. Método Principal: Envío al endpoint local download.php
    // Las cabeceras HTTP Content-Disposition: attachment; filename="foto.png"
    // obligan a Chrome y Windows a guardarlo con nombre 'foto.png' y tipo 'image/png'
    const form = document.getElementById('download-form');
    const input = document.getElementById('download-form-data');
    if (form && input) {
      input.value = pngDataUrl;
      form.submit();
      showToast('success', 'Descarga Completada', 'Guardando foto.png en formato PNG auténtico.');
      return;
    }

    // 2. Método Secundario (Fallback para modo offline sin servidor)
    const downloadAnchor = document.createElement('a');
    downloadAnchor.style.display = 'none';
    downloadAnchor.href = pngDataUrl;
    downloadAnchor.download = 'foto.png';
    downloadAnchor.setAttribute('download', 'foto.png');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();

    setTimeout(() => {
      document.body.removeChild(downloadAnchor);
    }, 300);

    showToast('success', 'Descarga Completada', 'Guardando foto.png en formato PNG.');
  };

  // Limpiar
  const clearCanvas = () => {
    const canvas = elements.canvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    canvas.classList.remove('active');
    if (elements.canvasPlaceholder) elements.canvasPlaceholder.classList.remove('hidden');
    if (elements.canvasResolutionText) elements.canvasResolutionText.textContent = '--';
    if (elements.btnDownloadPhoto) elements.btnDownloadPhoto.disabled = true;
  };

  const addSnapshotToGallery = (dataUrl) => {
    if (!elements.galleryContainer) return;
    const img = document.createElement('img');
    img.className = 'gallery-thumb';
    img.src = dataUrl;
    img.title = 'Clic para ver en el canvas';

    img.addEventListener('click', () => {
      const canvas = elements.canvas;
      const ctx = canvas.getContext('2d');
      const tempImg = new Image();
      tempImg.onload = () => {
        canvas.width = tempImg.width;
        canvas.height = tempImg.height;
        ctx.filter = 'none';
        ctx.drawImage(tempImg, 0, 0);
        canvas.classList.add('active');
        if (elements.canvasPlaceholder) elements.canvasPlaceholder.classList.add('hidden');
        if (elements.btnDownloadPhoto) elements.btnDownloadPhoto.disabled = false;
      };
      tempImg.src = dataUrl;
    });

    elements.galleryContainer.prepend(img);
  };

  // Listeners
  if (elements.btnToggleCamera) {
    elements.btnToggleCamera.addEventListener('click', () => {
      if (currentStream) stopCamera();
      else startCamera();
    });
  }

  if (elements.btnCaptureSnapshot) {
    elements.btnCaptureSnapshot.addEventListener('click', captureSnapshot);
  }

  if (elements.btnDownloadPhoto) {
    elements.btnDownloadPhoto.addEventListener('click', downloadSnapshotPNG);
  }

  if (elements.btnClearCanvas) {
    elements.btnClearCanvas.addEventListener('click', clearCanvas);
  }

  if (elements.selectCameraDevice) {
    elements.selectCameraDevice.addEventListener('change', () => {
      if (currentStream) {
        stopCamera();
        startCamera();
      }
    });
  }

  elements.filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setFilter(btn.getAttribute('data-filter'));
    });
  });

  // Inicializar
  checkCameraPermissions();
  enumerateVideoDevices();

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.log('SW Ejercicio 2:', e));
  }
});
