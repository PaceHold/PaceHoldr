// escrow.js (compat) — Escrow helper functions used by dashboard.js
(function(){
  if(!window.db) return console.error('firebase-config.js missing');

  const PLATFORM_FEE_PERCENT = 4;

  // assignRider (for sellers)
  window.assignRider = async function(txId, riderUid){
    await db.collection('transactions').doc(txId).update({
      rider_uid: riderUid,
      status: 'rider_assigned',
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      participants: firebase.firestore.FieldValue.arrayUnion(riderUid)
    });
    return true;
  };

  // tryAutoRelease: releases funds from escrow to seller when buyerConfirmed && riderConfirmed
  window.tryAutoRelease = async function(txId){
    const txRef = db.collection('transactions').doc(txId);
    try {
      await db.runTransaction(async (t)=>{
        const snap = await t.get(txRef);
        if(!snap.exists) throw new Error('Transaction not found');
        const tx = snap.data();
        if(tx.status === 'released') return;
        const buyerConfirmed = !!tx.buyerConfirmed;
        const riderConfirmed = !!tx.riderConfirmed;
        if(buyerConfirmed && riderConfirmed){
          const amount = Number(tx.amount || 0);
          const fee = Math.round((PLATFORM_FEE_PERCENT/100) * amount * 100) / 100;
          const sellerAmount = Math.round((amount - fee) * 100) / 100;

          const buyerWalletRef = db.collection('wallets').doc(tx.buyer_uid);
          const sellerWalletRef = db.collection('wallets').doc(tx.seller_uid);
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
