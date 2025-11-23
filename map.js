// map.js — placeholder helper for Google Maps integration
window.mapRegistry = {};
window.riderMarkers = {};

window.initMap = function(){ console.log('initMap placeholder called. Add Google Maps script tag with callback=initMap and implement marker logic.'); };

window.startMapForElement = function(elId, lat=6.5244, lng=3.3792, zoom=12){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML = `<div class="map-placeholder">Map placeholder — paste your Google Maps API key and enable tracking to see riders here</div>`;
  mapRegistry[elId] = { lat, lng, zoom, placeholder:true };
};

window.updateRiderMarker = function(riderUid, lat, lng){
  riderMarkers[riderUid] = { lat, lng, updatedAt: Date.now() };
};
