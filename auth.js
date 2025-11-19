// auth.js — session handling + role-lock guard
// After signup role is set; role cannot be changed without logout
(function(){
  auth.onAuthStateChanged(async user=>{
    if(!user) return; // not logged in
    const udocRef = db.collection('users').doc(user.uid);
    const udoc = await udocRef.get();
    if(!udoc.exists || !udoc.data().role) {
      // If no role stored (rare), redirect to index so they can pick; but we try to keep flow consistent
      window.location.href = 'index.html';
      return;
    }
    // nothing more to do here; other scripts will read user doc
  });

  // global logout wiring
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id === 'logoutBtn') {
      auth.signOut().then(()=> window.location.href = 'index.html');
    }
  });
})();
