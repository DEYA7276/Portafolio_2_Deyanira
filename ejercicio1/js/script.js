/**
 * EJERCICIO 1: CONSULTA DE PERMISOS Y GEOLOCALIZACIÓN
 * Archivo script.js autocontenido para la carpeta /ejercicio1/
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado interno
  let mapInstance = null;
  let userMarker = null;
  let accuracyCircle = null;
  let watchId = null;
  let currentCoords = null;
  let permissionStatusObj = null;

  // Elementos DOM
  const elements = {
    // Permisos
    permBanner: document.getElementById('perm-status-banner'),
    permOrb: document.getElementById('perm-status-orb'),
    permStateText: document.getElementById('perm-state-text'),
    permDesc: document.getElementById('perm-desc'),
    btnCheckPermission: document.getElementById('btn-check-permission'),

    // GPS
    btnGetLocation: document.getElementById('btn-get-location'),
    btnToggleWatch: document.getElementById('btn-toggle-watch'),
    switchHighAccuracy: document.getElementById('switch-high-accuracy'),

    // Telemetría
    valLatitude: document.getElementById('telemetry-lat'),
    valLongitude: document.getElementById('telemetry-lng'),
    valAccuracy: document.getElementById('telemetry-acc'),
    valAltitude: document.getElementById('telemetry-alt'),
    valSpeed: document.getElementById('telemetry-speed'),
    valHeading: document.getElementById('telemetry-heading'),
    valTimestamp: document.getElementById('telemetry-time'),
    linkGoogleMaps: document.getElementById('link-google-maps'),
    linkOsm: document.getElementById('link-osm'),
    btnCopyCoords: document.getElementById('btn-copy-coords'),

    // Mapa
    mapView: document.getElementById('map-view'),
    mapFloatingTip: document.getElementById('map-floating-tip'),
    btnRecenterMap: document.getElementById('btn-recenter-map'),

    // Red
    networkBadge: document.getElementById('network-badge'),
    networkDot: document.getElementById('network-dot'),
    networkText: document.getElementById('network-text')
  };

  // Toast simple
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

  // 1. Permissions API
  const checkPermissions = async () => {
    if (!('permissions' in navigator) || !navigator.permissions.query) {
      updatePermissionUI('prompt', 'Permiso de Ubicación', 'El navegador no soporta consulta previa de permisos.');
      return;
    }

    try {
      permissionStatusObj = await navigator.permissions.query({ name: 'geolocation' });
      renderPermissionState(permissionStatusObj.state);

      permissionStatusObj.onchange = () => {
        renderPermissionState(permissionStatusObj.state);
        showToast('info', 'Permiso Modificado', `Estado actualizado a: ${permissionStatusObj.state}`);
      };
    } catch (err) {
      updatePermissionUI('prompt', 'Permiso Pendiente', 'Se solicitará al presionar "Obtener mi ubicación actual".');
    }
  };

  const renderPermissionState = (state) => {
    if (state === 'granted') {
      updatePermissionUI(
        'granted',
        'Permiso Autorizado (Granted)',
        'Acceso otorgado al GPS. Las lecturas se obtienen directamente sin confirmaciones adicionales.'
      );
    } else if (state === 'prompt') {
      updatePermissionUI(
        'prompt',
        'Pendiente de Confirmación (Prompt)',
        'El navegador solicitará autorización al usuario al presionar "Obtener mi ubicación actual".'
      );
    } else if (state === 'denied') {
      updatePermissionUI(
        'denied',
        'Acceso Bloqueado (Denied)',
        'El acceso a la ubicación fue denegado. Se puede habilitar en el icono de candado de la URL.'
      );
    }
  };

  const updatePermissionUI = (statusClass, title, desc) => {
    if (!elements.permBanner) return;
    elements.permBanner.className = `permission-box ${statusClass}`;
    if (elements.permStateText) elements.permStateText.textContent = title;
    if (elements.permDesc) elements.permDesc.textContent = desc;
  };

  // 2. Geolocation API
  const getPositionOptions = () => ({
    enableHighAccuracy: elements.switchHighAccuracy ? elements.switchHighAccuracy.checked : true,
    timeout: 15000,
    maximumAge: 0
  });

  const getCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      showToast('error', 'Incompatible', 'Geolocation API no está disponible en este navegador.');
      return;
    }

    elements.btnGetLocation.disabled = true;
    elements.btnGetLocation.textContent = 'Obteniendo GPS...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        elements.btnGetLocation.disabled = false;
        elements.btnGetLocation.innerHTML = '<span>📍</span> Obtener mi ubicación actual';
        handleLocationSuccess(position);
        showToast('success', 'Ubicación Obtenida', `Coordenadas capturadas con ±${Math.round(position.coords.accuracy)}m.`);
      },
      (error) => {
        elements.btnGetLocation.disabled = false;
        elements.btnGetLocation.innerHTML = '<span>📍</span> Obtener mi ubicación actual';
        handleLocationError(error);
      },
      getPositionOptions()
    );
  };

  const toggleWatch = () => {
    if (!('geolocation' in navigator)) return;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      elements.btnToggleWatch.textContent = 'Rastreo en vivo (watchPosition)';
      elements.btnToggleWatch.style.backgroundColor = '';
      elements.btnToggleWatch.style.color = '';
      showToast('info', 'Rastreo Finalizado', 'Suscripción continua al GPS detenida.');
    } else {
      watchId = navigator.geolocation.watchPosition(
        (position) => handleLocationSuccess(position, true),
        (error) => {
          handleLocationError(error);
          toggleWatch();
        },
        getPositionOptions()
      );
      elements.btnToggleWatch.textContent = '⏹ Detener rastreo en vivo';
      elements.btnToggleWatch.style.backgroundColor = 'var(--status-warn-border)';
      elements.btnToggleWatch.style.color = '#ffffff';
      showToast('success', 'Rastreo Activo', 'Actualizando telemetría conforme cambie la posición.');
    }
  };

  const handleLocationSuccess = (position) => {
    const coords = position.coords;
    currentCoords = coords;

    // Telemetría en texto
    if (elements.valLatitude) elements.valLatitude.textContent = coords.latitude.toFixed(6) + '°';
    if (elements.valLongitude) elements.valLongitude.textContent = coords.longitude.toFixed(6) + '°';
    if (elements.valAccuracy) elements.valAccuracy.textContent = `±${Math.round(coords.accuracy)} m`;
    if (elements.valAltitude) elements.valAltitude.textContent = coords.altitude !== null ? `${coords.altitude.toFixed(1)} m` : 'No disponible';
    if (elements.valSpeed) elements.valSpeed.textContent = (coords.speed !== null && coords.speed > 0) ? `${(coords.speed * 3.6).toFixed(1)} km/h` : 'Estático';
    if (elements.valHeading) elements.valHeading.textContent = coords.heading !== null ? `${coords.heading.toFixed(0)}°` : '--';
    if (elements.valTimestamp) elements.valTimestamp.textContent = new Date(position.timestamp).toLocaleTimeString();

    // Enlaces
    const lat = coords.latitude;
    const lng = coords.longitude;
    if (elements.linkGoogleMaps) {
      elements.linkGoogleMaps.href = `https://www.google.com/maps?q=${lat},${lng}`;
      elements.linkGoogleMaps.style.display = 'inline-flex';
    }
    if (elements.linkOsm) {
      elements.linkOsm.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
      elements.linkOsm.style.display = 'inline-flex';
    }

    // Mapa
    updateMapLocation(lat, lng, coords.accuracy, position.timestamp);

    if (permissionStatusObj) {
      renderPermissionState(permissionStatusObj.state);
    }
  };

  const handleLocationError = (error) => {
    let msg = 'Error desconocido al consultar ubicación.';
    if (error.code === 1) {
      msg = 'Permiso denegado por el usuario o navegador.';
      updatePermissionUI('denied', 'Acceso Denegado', msg);
    } else if (error.code === 2) {
      msg = 'Señal de posición no disponible.';
    } else if (error.code === 3) {
      msg = 'Tiempo de espera agotado al consultar GPS.';
    }
    showToast('error', 'Error GPS', msg);
  };

  // 3. Leaflet OpenStreetMap
  const initMap = () => {
    if (!elements.mapView || typeof L === 'undefined') return;

    mapInstance = L.map('map-view', {
      center: [20.6597, -103.3496],
      zoom: 6,
      zoomControl: true
    });

    // Mosaicos OpenStreetMap oficial (100% libre sin API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
    }).addTo(mapInstance);

    // Permitir clic en el mapa
    mapInstance.on('click', (e) => {
      const { lat, lng } = e.latlng;
      handleLocationSuccess({
        coords: { latitude: lat, longitude: lng, accuracy: 15, altitude: null, speed: null, heading: null },
        timestamp: Date.now()
      });
      showToast('info', 'Ubicación Manual', `Punto fijado en: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`);
    });

    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 250);
  };

  const updateMapLocation = (lat, lng, accuracy, timestamp) => {
    if (!mapInstance || typeof L === 'undefined') return;

    if (elements.mapFloatingTip) {
      elements.mapFloatingTip.style.display = 'none';
    }

    const customIcon = L.divIcon({
      className: 'custom-gps-pin',
      html: '<div class="gps-pulse-beacon"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const popupContent = `
      <div style="font-family: inherit; font-size: 0.82rem; padding: 3px;">
        <strong>📍 Mi Ubicación</strong><br>
        Lat: ${lat.toFixed(6)}<br>
        Lng: ${lng.toFixed(6)}<br>
        Margen: ±${Math.round(accuracy)} m
      </div>
    `;

    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
      userMarker.getPopup().setContent(popupContent);
    } else {
      userMarker = L.marker([lat, lng], { icon: customIcon }).addTo(mapInstance);
      userMarker.bindPopup(popupContent);
    }

    if (accuracyCircle) {
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(accuracy);
    } else {
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#345680',
        weight: 1.5,
        fillColor: '#345680',
        fillOpacity: 0.18
      }).addTo(mapInstance);
    }

    mapInstance.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });
  };

  // Listeners
  if (elements.btnCheckPermission) {
    elements.btnCheckPermission.addEventListener('click', () => {
      checkPermissions();
      showToast('info', 'Verificando', 'Consulta ejecutada en Permissions API.');
    });
  }

  if (elements.btnGetLocation) {
    elements.btnGetLocation.addEventListener('click', getCurrentLocation);
  }

  if (elements.btnToggleWatch) {
    elements.btnToggleWatch.addEventListener('click', toggleWatch);
  }

  if (elements.btnRecenterMap) {
    elements.btnRecenterMap.addEventListener('click', () => {
      if (currentCoords && mapInstance) {
        mapInstance.flyTo([currentCoords.latitude, currentCoords.longitude], 16, { animate: true });
      } else {
        getCurrentLocation();
      }
    });
  }

  if (elements.btnCopyCoords) {
    elements.btnCopyCoords.addEventListener('click', () => {
      if (!currentCoords) {
        showToast('warning', 'Sin datos', 'Primero adquiere la ubicación.');
        return;
      }
      const text = `${currentCoords.latitude.toFixed(6)}, ${currentCoords.longitude.toFixed(6)}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast('success', 'Copiado', text);
      });
    });
  }

  // Inicialización
  initMap();
  checkPermissions();

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.log('SW Ejercicio 1:', e));
  }
});
