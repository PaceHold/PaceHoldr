// map.js — placeholder and helper stubs for Google Maps integration
// When ready: call initMap(API_KEY) or include Google Maps <script src=...&callback=initMap>
// This file exposes startMapForElement(elId, lat, lng) and updateRiderMarker(uid, lat, lng)

window.mapRegistry = {}; // store maps by element id
window.riderMarkers = {}; // markers by rider uid

window.initMap = function(apiKey){
  // placeholder note: you can include Google Maps script with your key and call window.initMap as callback.
  console.log('initMap placeholder called. Include Google Maps script or call startMapForElement when ready.');
};

// create map in element with center
window.startMapForElement = function(elId, lat=6.5244, lng=3.3792, zoom=12){
  const el = document.getElementById(elId);
  if(!el) return;
  // Placeholder static view until Google Maps is connected
  el.innerHTML = `<div class="map-placeholder">Map placeholder — connect Google Maps API to show live rider locations</div>`;
  mapRegistry[elId] = { lat, lng, zoom, placeholder:true };
};

// update rider marker (stub)
window.updateRiderMarker = function(riderUid, lat, lng){
  // when Google Maps is integrated add / update marker on map.
  riderMarkers[riderUid] = { lat, lng, updatedAt: Date.now() };
};
