// auth.js — session guard + role lock
(function(){
  auth.onAuthStateChanged(async user=>{
    if(!user) return; // no action here, pages will redirect if needed
    const udoc = await db.collection('users').doc(user.uid).get();
    if(!udoc.exists || !udoc.data().role){
      // if user somehow lacks role, send to index to pick role
      try { await auth.signOut(); } catch(e){}
      window.location.href = 'index.html';
      return;
    }
  });

  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id === 'logoutBtn') {
      auth.signOut().then(()=> window.location.href = 'index.html');
    }
  });
})();
