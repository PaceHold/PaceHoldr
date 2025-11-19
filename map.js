// map.js — placeholder helpers for Google Maps integration
window.mapRegistry = {};
window.riderMarkers = {}; 

window.initMap = function(){ console.log('initMap placeholder called. Include Google Maps script tag with callback=initMap and implement marker logic.'); };

// render a mini map inside element; replace with Google Maps when key available
window.startMapForElement = function(elId, lat=6.5244, lng=3.3792, zoom=12){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML = `<div class="map-placeholder">Map placeholder — connect Google Maps API to show live rider locations</div>`;
  mapRegistry[elId] = { lat, lng, zoom, placeholder:true };
};

// update rider marker for future Google Maps integration
window.updateRiderMarker = function(riderUid, lat, lng){
  riderMarkers[riderUid] = { lat, lng, updatedAt: Date.now() };
};
