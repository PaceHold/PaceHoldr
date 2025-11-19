// auth.js — session handling + small helpers
// Assumes firebase-config.js loaded
(function(){
  // show top user and a simple guard
  auth.onAuthStateChanged(async user=>{
    if(!user) return window.location.href = 'index.html';
    // ensure user doc exists
    const udoc = await db.collection('users').doc(user.uid).get();
    if(!udoc.exists){
      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        name: user.displayName || '',
        email: user.email || '',
        role: 'buyer',
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
      await db.collection('wallets').doc(user.uid).set({ uid: user.uid, balance:0, escrowHeld:0 }, { merge:true });
    }
  });

  // logout wiring (dashboard)
  document.addEventListener('click', (e)=> {
    if(e.target && e.target.id === 'logoutBtn') {
      auth.signOut().then(()=> window.location.href = 'index.html');
    }
  });

})();
