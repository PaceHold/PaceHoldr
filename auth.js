// auth.js — session guard + role lock (compat)
auth.onAuthStateChanged(async user=>{
  if(!user) {
    // Not signed in — some pages may redirect
    return;
  }
  const doc = await db.collection('users').doc(user.uid).get();
  if(!doc.exists || !doc.data().role){
    // No role — sign out and force user to pick role on index
    try { await auth.signOut(); } catch(e){}
    window.location.href = 'index.html';
    return;
  }
  // All good — role locked until logout
});

// global logout wiring (buttons with id logoutBtn, buyerLogout, sellerLogout, riderLogout)
document.addEventListener('click', (e)=>{
  if(e.target && (e.target.id === 'logoutBtn' || e.target.id === 'buyerLogout' || e.target.id === 'sellerLogout' || e.target.id === 'riderLogout')) {
    auth.signOut().then(()=> window.location.href = 'index.html');
  }
});
