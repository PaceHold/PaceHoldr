// firebase-config.js (compat)
// Make sure your HTML includes the compat SDKs before this file.
if (!window.firebase) {
  console.error('Firebase compat SDK not loaded. Include compat scripts before firebase-config.js');
}
if (!firebase.apps || !firebase.apps.length) {
  const firebaseConfig = {
    apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
    authDomain: "pacehold-4c7b2.firebaseapp.com",
    projectId: "pacehold-4c7b2",
    storageBucket: "pacehold-4c7b2.firebasestorage.app",
    messagingSenderId: "45898843261",
    appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
  };
  firebase.initializeApp(firebaseConfig);
}
window.auth = firebase.auth();
window.db = firebase.firestore();
window.rtdb = firebase.database();
