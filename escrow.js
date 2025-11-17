// escrow.js — Escrow & transaction helpers (uses global firebase db)
// Platform fee: 4%

(function(){
  if(!window.db) return console.error('firebase-config.js missing');

  const PLATFORM_FEE_PERCENT = 4;

  // createHold(buyerUid, sellerUid, amount) - buyer places funds in escrow
  window.createHold = async function(sellerUid, amount){
    const authUser = firebase.auth().currentUser;
    if(!authUser) return alert('Sign in first');
    const buyerUid = authUser.uid;
    const amt = Number(amount);
    if(isNaN(amt) || amt <= 0) return alert('Invalid amount');

    const buyerWalletRef = db.collection('wallets').doc(buyerUid);
    const txRef = db.collection('transactions').doc();

    try {
      await db.runTransaction(async (t)=>{
        const bw = await t.get(buyerWalletRef);
        const bal = bw.exists ? Number(bw.data().balance || 0) : 0;
        if(bal < amt) throw new Error('Insufficient funds in your wallet');
        // deduct and add to escrowHeld
        const newBal = Math.round((bal - amt) * 100) / 100;
        const newEscrow = Math.round(((bw.exists ? Number(bw.data().escrowHeld||0) : 0) + amt) * 100) / 100;
        t.set(buyerWalletRef, { balance: newBal, escrowHeld: newEscrow }, { merge:true });

        t.set(txRef, {
          id: txRef.id,
          buyerId: buyerUid,
          sellerId: sellerUid,
          riderId: null,
          amount: Math.round(amt * 100) / 100,
          status: 'held',
          buyerConfirmed: false,
          riderConfirmed: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          participants: [buyerUid, sellerUid]
        });
      });
      alert('Escrow created and funds held.');
    } catch(e){ alert('Create hold failed: ' + (e.message || e)); }
  };

  // assignRider(txId, riderUid)
  window.assignRider = async function(txId, riderUid){
    await db.collection('transactions').doc(txId).update({
      riderId: riderUid,
      status: 'in_transit',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      participants: firebase.firestore.FieldValue.arrayUnion(riderUid)
    });
    alert('Rider assigned');
  };

  // rider confirms arrival
  window.riderConfirm = async function(txId){
    await db.collection('transactions').doc(txId).update({
      riderConfirmed: true,
      status: 'awaiting_buyer',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await tryAutoRelease(txId);
    alert('Rider confirmed arrival.');
  };

  // buyer confirms receipt
  window.buyerConfirm = async function(txId){
    await db.collection('transactions').doc(txId).update({
      buyerConfirmed: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await tryAutoRelease(txId);
    alert('Buyer confirmed receipt.');
  };

  // tryAutoRelease: releases funds when both buyerConfirmed & riderConfirmed true
  window.tryAutoRelease = async function(txId){
    const txRef = db.collection('transactions').doc(txId);
    try {
      await db.runTransaction(async (t)=>{
        const snap = await t.get(txRef);
        if(!snap.exists) throw new Error('Transaction not found');
        const tx = snap.data();
        if(tx.status === 'released') return;
        if(tx.buyerConfirmed && tx.riderConfirmed){
          const amount = Number(tx.amount || 0);
          const fee = Math.round((PLATFORM_FEE_PERCENT/100) * amount * 100) / 100;
          const sellerAmount = Math.round((amount - fee) * 100) / 100;

          const buyerWalletRef = db.collection('wallets').doc(tx.buyerId);
          const sellerWalletRef = db.collection('wallets').doc(tx.sellerId);
          const platformRef = db.collection('wallets').doc('_platform');

          const bSnap = await t.get(buyerWalletRef);
          const sSnap = await t.get(sellerWalletRef);
          const pSnap = await t.get(platformRef);

          const buyerEsc = Number(bSnap.exists ? bSnap.data().escrowHeld || 0 : 0);
          const sellerBal = Number(sSnap.exists ? sSnap.data().balance || 0 : 0);
          const platformBal = Number(pSnap.exists ? pSnap.data().balance || 0 : 0);

          const newBuyerEsc = Math.max(0, Math.round((buyerEsc - amount) * 100) / 100);
          const newSellerBal = Math.round((sellerBal + sellerAmount) * 100) / 100;
          const newPlatformBal = Math.round((platformBal + fee) * 100) / 100;

          t.set(buyerWalletRef, { escrowHeld: newBuyerEsc }, { merge:true });
          t.set(sellerWalletRef, { balance: newSellerBal }, { merge:true });
          t.set(platformRef, { uid: '_platform', balance: newPlatformBal }, { merge:true });

          t.update(txRef, { status: 'released', fee, sellerAmount, releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      });
    } catch(e){ console.error('Auto release failed', e); }
  };

})();
