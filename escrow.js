// escrow.js — escrow / transaction helpers (compat + uses global firebase)
(function(){
  if(!window.firebase) return console.error('Firebase not loaded');

  const PLATFORM_FEE_PERCENT = 4; // 4%

  // createHold: buyer places money into escrow (deducts balance -> increases escrowHeld)
  window.createHold = async function(sellerId, amount){
    const sessionRaw = sessionStorage.getItem('pacehold_user');
    if(!sessionRaw) return alert('Sign in first');
    const user = JSON.parse(sessionRaw);

    const amt = Number(amount);
    if(isNaN(amt) || amt <= 0) return alert('Invalid amount');

    const db = firebase.firestore();
    const buyerWalletRef = db.collection('wallets').doc(user.uid);
    const txRef = db.collection('transactions').doc();

    try {
      await db.runTransaction(async (tx) => {
        const wSnap = await tx.get(buyerWalletRef);
        const w = wSnap.exists ? wSnap.data() : { balance:0, escrowHeld:0 };
        const balance = Number(w.balance || 0);
        if(balance < amt) throw new Error('Insufficient balance');

        const newEscrowHeld = Math.round((Number(w.escrowHeld || 0) + amt) * 100) / 100;
        const newBalance = Math.round((balance - amt) * 100) / 100;

        tx.set(buyerWalletRef, { balance: newBalance, escrowHeld: newEscrowHeld }, { merge:true });

        tx.set(txRef, {
          id: txRef.id,
          buyerId: user.uid,
          sellerId: sellerId,
          riderId: null,
          amount: Math.round(amt * 100) / 100,
          status: 'held',
          buyerConfirmed: false,
          riderConfirmed: false,
          participants: [user.uid, sellerId],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      alert('Funds held in escrow.');
    } catch(e){
      alert('Hold failed: ' + (e.message || e));
    }
  };

  // tryAutoRelease: checks transaction and releases when buyer & rider confirm
  window.tryAutoRelease = async function(txId){
    const db = firebase.firestore();
    const txRef = db.collection('transactions').doc(txId);
    try {
      await db.runTransaction(async (t) => {
        const txSnap = await t.get(txRef);
        if(!txSnap.exists) throw new Error('Tx not found');
        const txData = txSnap.data();
        if(txData.status === 'released') return;

        if(txData.buyerConfirmed && txData.riderConfirmed){
          const amount = Number(txData.amount || 0);
          const fee = Math.round((PLATFORM_FEE_PERCENT/100) * amount * 100) / 100;
          const sellerAmount = Math.round((amount - fee) * 100) / 100;

          const buyerWRef = db.collection('wallets').doc(txData.buyerId);
          const sellerWRef = db.collection('wallets').doc(txData.sellerId);
          const platformRef = db.collection('wallets').doc('_platform');

          const bSnap = await t.get(buyerWRef);
          const sSnap = await t.get(sellerWRef);
          const pSnap = await t.get(platformRef);

          const buyerEsc = Number(bSnap.exists ? bSnap.data().escrowHeld || 0 : 0);
          const sellerBal = Number(sSnap.exists ? sSnap.data().balance || 0 : 0);
          const platformBal = Number(pSnap.exists ? pSnap.data().balance || 0 : 0);

          const newBuyerEsc = Math.max(0, Math.round((buyerEsc - amount) * 100) / 100);
          const newSellerBal = Math.round((sellerBal + sellerAmount) * 100) / 100;
          const newPlatformBal = Math.round((platformBal + fee) * 100) / 100;

          t.set(buyerWRef, { escrowHeld: newBuyerEsc }, { merge:true });
          t.set(sellerWRef, { balance: newSellerBal }, { merge:true });
          t.set(platformRef, { uid: '_platform', balance: newPlatformBal }, { merge:true });

          t.update(txRef, { status: 'released', fee, sellerAmount, releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      });
      // no alert here — caller can alert
    } catch(e){
      console.error('Auto release failed', e);
    }
  };

  // Assign rider to tx
  window.assignRiderToTx = async function(txId, riderId){
    const db = firebase.firestore();
    await db.collection('transactions').doc(txId).update({
      riderId,
      status: 'in_transit',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      participants: firebase.firestore.FieldValue.arrayUnion(riderId)
    });
    alert('Rider assigned.');
  };

  // buyer confirm / rider confirm wrappers
  window.buyerConfirm = async function(txId){
    const db = firebase.firestore();
    await db.collection('transactions').doc(txId).update({ buyerConfirmed: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await window.tryAutoRelease(txId);
    alert('Buyer confirmation saved.');
  };

  window.riderConfirm = async function(txId){
    const db = firebase.firestore();
    await db.collection('transactions').doc(txId).update({ riderConfirmed: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await window.tryAutoRelease(txId);
    alert('Rider confirmation saved.');
  };

})();
