// escrow.js — escrow helpers used by dashboard + other scripts
(function(){
  if(!window.db) return console.error('firebase-config missing');

  const PLATFORM_FEE_PERCENT = 4;

  // create a transaction (called after Paystack success or as hold)
  window.createTransaction = async function({ buyerUid, sellerUid, amount, reference, description }){
    const docRef = db.collection('transactions').doc(reference || db.collection('transactions').doc().id);
    const fee = Math.round((PLATFORM_FEE_PERCENT/100) * Number(amount) * 100) / 100;
    await docRef.set({
      id: docRef.id,
      buyer_uid: buyerUid,
      seller_uid: sellerUid,
      rider_uid: null,
      amount: Number(amount),
      fee,
      netAmount: Math.round((Number(amount) - fee) * 100) / 100,
      description: description || '',
      reference: reference || docRef.id,
      status: 'paid',
      buyerConfirmed: false,
      riderConfirmed: false,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      participants: [buyerUid, sellerUid]
    });
    // notify seller via notifications collection (simple doc)
    await db.collection('notifications').add({
      to: sellerUid,
      type: 'new_escrow',
      txId: docRef.id,
      amount: Number(amount),
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  };

  // seller requests rider (creates a rider request doc)
  window.sellerRequestRider = async function(txId, sellerUid, pickupDetails){
    const reqRef = db.collection('riderRequests').doc();
    await reqRef.set({
      id: reqRef.id,
      txId,
      sellerUid,
      pickupDetails: pickupDetails || {},
      status: 'open',
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    // optionally write on transaction
    await db.collection('transactions').doc(txId).update({ riderRequestId: reqRef.id, status: 'seller_requested_rider' });
    return reqRef.id;
  };

  // assign rider (seller assigns or rider picks and assignment is saved)
  window.assignRiderToTx = async function(txId, riderUid){
    await db.collection('transactions').doc(txId).update({
      rider_uid: riderUid,
      status: 'rider_assigned',
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      participants: firebase.firestore.FieldValue.arrayUnion(riderUid)
    });
    // notify buyer & seller
    const tx = (await db.collection('transactions').doc(txId).get()).data();
    await db.collection('notifications').add({ to: tx.buyer_uid, type: 'rider_assigned', txId, riderUid, created_at: firebase.firestore.FieldValue.serverTimestamp() });
  };

  // rider confirms arrived; buyer confirms arrived → when both true auto release
  window.riderConfirmArrived = async function(txId){
    await db.collection('transactions').doc(txId).update({
      riderConfirmed: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    if(window.tryAutoRelease) tryAutoRelease(txId).catch(()=>{});
  };

  window.buyerConfirmArrived = async function(txId){
    await db.collection('transactions').doc(txId).update({
      buyerConfirmed: true,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    if(window.tryAutoRelease) tryAutoRelease(txId).catch(()=>{});
  };

  // tryAutoRelease: when both buyer & rider confirmed -> release funds
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
          const fee = Number(tx.fee || Math.round((PLATFORM_FEE_PERCENT/100) * amount * 100) / 100);
          const sellerAmount = Math.round((amount - fee) * 100) / 100;

          const sellerWalletRef = db.collection('wallets').doc(tx.seller_uid);
          const platformRef = db.collection('wallets').doc('_platform');

          const sSnap = await t.get(sellerWalletRef);
          const pSnap = await t.get(platformRef);

          const sellerBal = Number(sSnap.exists ? sSnap.data().balance || 0 : 0);
          const platformBal = Number(pSnap.exists ? pSnap.data().balance || 0 : 0);

          const newSellerBal = Math.round((sellerBal + sellerAmount) * 100) / 100;
          const newPlatformBal = Math.round((platformBal + fee) * 100) / 100;

          t.set(sellerWalletRef, { balance: newSellerBal }, { merge:true });
          t.set(platformRef, { uid: '_platform', balance: newPlatformBal }, { merge:true });

          t.update(txRef, { status: 'released', fee, sellerAmount, releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      });
    } catch(e){ console.error('Auto release failed', e); }
  };

})();
