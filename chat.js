// chat.js — Realtime DB chat with participant checks
(function(){
  if(!window.rtdb) return console.error('Realtime DB not initialized (firebase-config.js)');

  function roomIdFor(a,b){
    if(!a||!b) return null;
    return [a,b].sort().join('__');
  }
  const nameCache = {};
  async function getName(uid){
    if(!uid) return '';
    if(nameCache[uid]) return nameCache[uid];
    try { const doc = await db.collection('users').doc(uid).get(); const n = doc.exists ? doc.data().name || uid : uid; nameCache[uid]=n; return n; } catch(e){ return uid; }
  }

  window.openChatWith = async function(user){
    // user is { uid, name }
    const me = auth.currentUser;
    if(!me) return alert('Sign in first');
    if(!user || !user.uid) return alert('Invalid user');
    // check if allowed: either there is a transaction linking them OR they are same role allowed
    // We'll allow chat if: there exists a transaction where both are participants OR (developer override for testing)
    const txSnap = await db.collection('transactions').where('participants','array-contains',me.uid).get();
    let allowed = false;
    txSnap.forEach(d=>{
      const tx = d.data();
      if(tx.participants && tx.participants.indexOf(user.uid) !== -1) allowed = true;
    });
    // Also allow chat if me is buyer and user is seller and tx exists the other way
    if(!allowed){
      // Additional check: if you're seller and the user is a rider in a tx assigned to you
      // (keep as-is; by design chat restricted)
    }
    if(!allowed) return alert('Chat not allowed — no shared transaction linking you to this user.');
    const room = roomIdFor(me.uid, user.uid);
    window.currentChatRoom = room;
    const name = user.name || await getName(user.uid);
    document.getElementById('chatWith').innerText = `${name} (${user.uid})`;
    document.getElementById('chatPanel').style.display = 'flex';
    subscribeRoom(room);
  };

  // send
  document.getElementById('sendMessageBtn').addEventListener('click', async ()=>{
    const txtEl = document.getElementById('messageInput');
    const txt = txtEl.value.trim();
    if(!txt) return;
    const me = auth.currentUser;
    if(!me) return alert('Sign in first');
    const room = window.currentChatRoom;
    if(!room) return alert('Open a chat first');
    const fromName = me.displayName || (await getName(me.uid)) || me.uid;
    await rtdb.ref('chats/' + room + '/messages').push({ from: me.uid, fromName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP });
    txtEl.value = '';
  });

  // subscribe
  let currentRef = null;
  async function subscribeRoom(room){
    const body = document.getElementById('chatBody');
    if(currentRef) currentRef.off();
    currentRef = rtdb.ref('chats/' + room + '/messages').limitToLast(200);
    currentRef.on('value', async snap=>{
      const data = snap.val() || {};
      const rows = Object.keys(data).map(k=> ({ id:k, ...data[k] })).sort((a,b)=>a.ts - b.ts);
      const meUid = auth.currentUser ? auth.currentUser.uid : null;
      const htmlParts = [];
      for(const m of rows){
        const isMe = m.from === meUid;
        const name = m.fromName || await getName(m.from);
        const time = m.ts ? (new Date(m.ts)).toLocaleTimeString() : '';
        const cls = isMe ? 'msg me' : 'msg them';
        htmlParts.push(`<div class="${cls}"><div style="font-weight:700;font-size:13px">${escapeHtml(name)}</div><div style="margin-top:6px">${escapeHtml(m.text)}</div><div class="meta">${escapeHtml(time)}</div></div>`);
      }
      body.innerHTML = htmlParts.join('');
      body.scrollTop = body.scrollHeight;
    });
  }

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  window.toggleChatPanel = function(){ const el = document.getElementById('chatPanel'); el.style.display = el.style.display === 'flex' ? 'none' : 'flex'; };
  window.closeChatPanel = function(){ document.getElementById('chatPanel').style.display = 'none'; };

})();
