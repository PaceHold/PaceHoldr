// chat.js — realtime chat with Realtime DB (compat)
(function(){
  if(!window.rtdb) return console.error('Realtime DB not initialized.');

  // helper: room id from two uids
  function roomId(a,b){ return [a,b].sort().join('__'); }

  // get display name quickly
  const nameCache = {};
  async function getName(uid){
    if(!uid) return '';
    if(nameCache[uid]) return nameCache[uid];
    try {
      const d = await db.collection('users').doc(uid).get();
      const n = d.exists ? (d.data().username || d.data().name || uid) : uid;
      nameCache[uid] = n;
      return n;
    } catch(e){ return uid; }
  }

  // open chat with a user object { uid, username }
  window.openChatWith = async function(user){
    const me = auth.currentUser;
    if(!me) return alert('Please login');
    // check allowed: must share a transaction (participants)
    const txSnap = await db.collection('transactions').where('participants','array-contains',me.uid).get();
    let allowed = false;
    txSnap.forEach(d=>{
      const tx = d.data();
      if(tx.participants && tx.participants.indexOf(user.uid) !== -1) allowed = true;
    });
    if(!allowed) return alert('Chat not allowed — no shared transaction linking you to this user.');

    const room = roomId(me.uid, user.uid);
    window.currentChatRoom = room;
    const name = user.username || await getName(user.uid);
    document.getElementById('chatWith').innerText = `${name} (${user.uid})`;
    document.getElementById('chatPanel').style.display = 'flex';
    subscribeRoom(room);
  };

  document.getElementById && document.getElementById('sendMessageBtn') && document.getElementById('sendMessageBtn').addEventListener('click', async ()=>{
    const input = document.getElementById('messageInput');
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;
    const me = auth.currentUser;
    if(!me) return alert('Sign in');
    const room = window.currentChatRoom;
    if(!room) return alert('Open a chat first');
    const payload = { from: me.uid, fromName: me.displayName || (await getName(me.uid)), text, ts: firebase.database.ServerValue.TIMESTAMP };
    await rtdb.ref('chats/' + room + '/messages').push(payload);
    input.value = '';
  });

  let currentRef = null;
  async function subscribeRoom(room){
    const body = document.getElementById('chatBody');
    if(currentRef) currentRef.off();
    currentRef = rtdb.ref('chats/' + room + '/messages').limitToLast(200);
    currentRef.on('value', async snap=>{
      const val = snap.val() || {};
      const rows = Object.keys(val).map(k => ({ id:k, ...val[k] })).sort((a,b)=>a.ts - b.ts);
      const meUid = auth.currentUser ? auth.currentUser.uid : null;
      const html = [];
      for(const m of rows){
        const isMe = m.from === meUid;
        const name = m.fromName || await getName(m.from);
        const time = m.ts ? new Date(m.ts).toLocaleTimeString() : '';
        const cls = isMe ? 'msg me' : 'msg them';
        html.push(`<div class="${cls}"><div style="font-weight:700;font-size:13px">${escapeHtml(name)}</div><div style="margin-top:6px">${escapeHtml(m.text)}</div><div class="meta">${escapeHtml(time)}</div></div>`);
      }
      body.innerHTML = html.join('');
      body.scrollTop = body.scrollHeight;
    });
  }

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  window.toggleChatPanel = function(){ const el = document.getElementById('chatPanel'); el.style.display = el.style.display === 'flex' ? 'none' : 'flex'; };
  window.closeChatPanel = function(){ document.getElementById('chatPanel').style.display = 'none'; };
})();
