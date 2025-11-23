// escrow.js — core escrow logic (compat)
(function(){
  if(!window.db) return console.error('Firestore not found');

  const FEE_PERCENT = 4;

  // fund wallet (Paystack inline). Replace key with your Paystack key.
  window.fundWallet = function(amount){
    const user = auth.currentUser;
    if(!user) return alert('Login first');
    const handler = PaystackPop.setup({
      key: 'PAYSTACK_PUBLIC_KEY_HERE',
      email: user.email,
      amount: Math.round(Number(amount)*100),
      currency: 'NGN',
      callback: async function(response){
        // increase wallet
        const wRef = db.collection('wallets').doc(user.uid);
        await db.runTransaction(async t=>{
          const snap = await t.get(wRef);
          const cur = snap.exists ? (snap.data().balance || 0) : 0;
          t.set(wRef, { balance: Number(cur) + Number(amount) }, { merge:true });
        });
        await db.collection('walletLogs').add({ uid: user.uid, amount, type:'fund', reference: response.reference, created_at: firebase.firestore.FieldValue.serverTimestamp() });
        alert('Wallet funded');
      },
      onClose: function(){ alert('Payment closed'); }
    });
    handler.openIframe();
  };

  // create escrow: only buyer
  window.createEscrow = async function(buyerUid, sellerUid, amount, description){
    if(!buyerUid) throw new Error('buyerUid required');
    const walletRef = db.collection('wallets').doc(buyerUid);
    const wSnap = await walletRef.get();
    const balance = wSnap.exists ? (wSnap.data().balance || 0) : 0;
    if(balance < amount) throw new Error('Insufficient wallet balance. Fund your wallet first.');
    const txRef = db.collection('transactions').doc();
    const fee = Math.round((FEE_PERCENT/100)*Number(amount)*100)/100;
    const net = Math.round((Number(amount)-fee)*100)/100;
    await db.runTransaction(async t=>{
      t.set(txRef, {
        id: txRef.id,
        buyer_uid: buyerUid,
        seller_uid: sellerUid,
        amount: Number(amount),
        fee,
        netAmount: net,
        status: 'paid',
        buyerConfirmed: false,
        riderConfirmed: false,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        participants: [buyerUid, sellerUid]
      });
      // deduct buyer wallet and put into escrowHeld
      const snap = await t.get(walletRef);
      const old = snap.exists ? (snap.data().balance || 0) : 0;
      t.set(walletRef, { balance: Number(old) - Number(amount), escrowHeld: firebase.firestore.FieldValue.increment(Number(amount)) }, { merge:true });
    });
    // notify seller
    await db.collection('notifications').add({ to: sellerUid, type:'new_escrow', txId: txRef.id, amount: Number(amount), created_at: firebase.firestore.FieldValue.serverTimestamp() });
    return txRef.id;
  };

  // seller requests rider
  window.sellerRequestRider = async function(txId, sellerUid, pickupDetails){
    const reqRef = db.collection('riderRequests').doc();
    await reqRef.set({ id:reqRef.id, txId, sellerUid, pickupDetails: pickupDetails || {}, status:'open', created_at: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('transactions').doc(txId).update({ riderRequestId: reqRef.id, status:'seller_requested_rider' });
    // notify riders
    const riders = await db.collection('users').where('role','==','rider').get();
    riders.forEach(r=> db.collection('notifications').add({ to: r.id, type:'rider_request', reqId: reqRef.id, txId, created_at: firebase.firestore.FieldValue.serverTimestamp() }));
    return reqRef.id;
  };

  // assign rider
  window.assignRiderToTx = async function(txId, riderUid){
    await db.collection('transactions').doc(txId).update({ rider_uid: riderUid, status:'rider_assigned', updated_at: firebase.firestore.FieldValue.serverTimestamp(), participants: firebase.firestore.FieldValue.arrayUnion(riderUid) });
    const tx = (await db.collection('transactions').doc(txId).get()).data();
    await db.collection('notifications').add({ to: tx.seller_uid, type:'rider_assigned', txId, riderUid, created_at: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('notifications').add({ to: tx.buyer_uid, type:'rider_assigned', txId, riderUid, created_at: firebase.firestore.FieldValue.serverTimestamp() });
  };

  // rider confirms arrived
  window.riderConfirmArrived = async function(txId){
    await db.collection('transactions').doc(txId).update({ riderConfirmed: true, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
    tryAutoRelease(txId).catch(()=>{});
  };

  // buyer confirms arrived
  window.buyerConfirmArrived = async function(txId){
    await db.collection('transactions').doc(txId).update({ buyerConfirmed: true, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
    tryAutoRelease(txId).catch(()=>{});
  };

  // try auto-release when both confirmed
  window.tryAutoRelease = async function(txId){
    const txRef = db.collection('transactions').doc(txId);
    try {
      await db.runTransaction(async t=>{
        const snap = await t.get(txRef);
        if(!snap.exists) throw new Error('Tx not found');
        const tx = snap.data();
        if(tx.status === 'released') return;
        if(tx.riderConfirmed && tx.buyerConfirmed){
          const amount = Number(tx.amount || 0);
          const fee = Number(tx.fee || Math.round((FEE_PERCENT/100)*amount*100)/100);
          const sellerAmount = Math.round((amount - fee)*100)/100;

          const sellerW = db.collection('wallets').doc(tx.seller_uid);
          const platformW = db.collection('wallets').doc('_platform');
          const buyerW = db.collection('wallets').doc(tx.buyer_uid);

          const sSnap = await t.get(sellerW);
          const pSnap = await t.get(platformW);
          const bSnap = await t.get(buyerW);

          const sellerBal = Number(sSnap.exists ? sSnap.data().balance || 0 : 0);
          const platformBal = Number(pSnap.exists ? pSnap.data().balance || 0 : 0);
          const buyerEscrowHeld = Number(bSnap.exists ? bSnap.data().escrowHeld || 0 : 0);

          t.set(sellerW, { balance: sellerBal + sellerAmount }, { merge:true });
          t.set(platformW, { uid:'_platform', balance: platformBal + fee }, { merge:true });
          t.set(buyerW, { escrowHeld: Math.max(0, buyerEscrowHeld - amount) }, { merge:true });
          t.update(txRef, { status:'released', fee, sellerAmount, releasedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      });
    } catch(e){ console.error('Auto-release error', e); }
  };

})();
