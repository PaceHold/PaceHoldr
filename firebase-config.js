// firebase-config.js
// Uses your confirmed PaceHold Firebase project config.

if (!window.firebase) {
  console.error('Firebase scripts are missing. Make sure you included compat scripts in the HTML before this file.');
} else if (!firebase.apps.length) {
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
