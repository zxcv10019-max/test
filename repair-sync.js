(function(){
 'use strict';
 const ENDPOINT='https://kdocs-repair-sync.zxcv10019.workers.dev/snapshot';
 let snapshot=null,unsubscribe=null,refreshTimer=null,container=null,busy=false,liveTickets=[];
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function ensure(){
  if(container)return;
  const host=document.getElementById('listPage');if(!host)return;
  container=document.createElement('section');container.className='repair-sync-panel';
  container.innerHTML='<h2>金山維修追蹤</h2><p>讀取最新維修快照，比對近兩個月正式派工及已安排的後續復機。無序號或同客編多機案件會保留供核對。</p><button type="button" id="repairSyncLoad">連接並讀取維修快照</button><span id="repairSyncMessage" role="status"></span><label style="display:block;margin:12px 0">排序：<select id="repairSyncSort"><option value="completed">實際完成日：舊到新</option><option value="customer">客編排序</option></select></label><div id="repairSyncResults"></div>';
  host.prepend(container);document.getElementById('repairSyncLoad').onclick=()=>load(true);document.getElementById('repairSyncSort').onchange=render;
 }
 function message(text){const el=document.getElementById('repairSyncMessage');if(el)el.textContent=text;}
 function rows(title,items,tracking){
  const byCustomer=(a,b)=>String(a.customerCode||'').localeCompare(String(b.customerCode||''),'zh-TW',{numeric:true,sensitivity:'base'});
  const byDate=(a,b)=>String(a.completedDate||'9999-12-31').localeCompare(String(b.completedDate||'9999-12-31'));
  const mode=document.getElementById('repairSyncSort')?.value||'completed';
  items=items.slice().sort((a,b)=>(mode==='customer'?byCustomer(a,b)||byDate(a,b):byDate(a,b)||byCustomer(a,b))||String(a.recordId||'').localeCompare(String(b.recordId||'')));
  return '<h3>'+title+'（'+items.length+' 筆）</h3><div class="repair-sync-scroll"><table><thead><tr><th>客編</th><th>機台序號</th><th>送修日</th><th>實際完成日</th><th>追蹤狀態</th><th>對照派工</th></tr></thead><tbody>'+items.map(r=>'<tr><td>'+escape(r.customerCode)+'</td><td>'+escape(r.machineCode)+'</td><td>'+escape(r.sentDate)+'</td><td>'+escape(r.completedDate)+'</td><td>'+escape(r.status)+(tracking&&r.uncertain?'（配對待核對）':'')+'</td><td>'+escape(r.dispatches.map(j=>[j.date,j.workItem,j.workContent].filter(Boolean).join(' · ')).join('\n')||'沒有符合條件的派工紀錄')+'</td></tr>').join('')+'</tbody></table></div>';
 }
 function render(){
  if(!snapshot||!container)return;
  const result=RepairSyncCore.compare(snapshot.records,typeof jobs==='undefined'?[]:jobs,liveTickets);
  const pending=result.restores.filter(r=>r.status==='待安排候選'),review=result.restores.filter(r=>r.uncertain);
  document.getElementById('repairSyncResults').innerHTML='<p>完成日範圍：'+result.range.start+' ～ '+result.range.today+'。快照更新：'+escape(new Date(snapshot.receivedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))+'。掃描 '+snapshot.scanned+' 筆，快照 '+snapshot.records.length+' 筆。</p><div class="repair-sync-counts"><strong>近兩月完成 '+result.restores.length+' 筆</strong><strong>待安排候選 '+pending.length+' 筆</strong><strong>復機紀錄待核對 '+review.length+' 筆</strong></div><p>以上為維修紀錄數，可能包含同一機器多次送修。維修完成不代表現場已復機；候選清單仍需核對。比對包含已安排的未來復機，排除取消及暫押派工。</p>'+rows('待安排復機候選',pending,false)+rows('近兩月完成紀錄',result.restores,false)+rows('已派工送修追蹤',result.tracking,true);
 }
 async function load(interactive){
  if(busy)return;
  if(typeof firebaseAuth==='undefined'||!firebaseAuth?.currentUser){message('請先登入派工系統。');return;}
  if(interactive&&!confirm('將使用目前 Firebase 登入憑證向你的 Cloudflare 接收服務驗證身分，取得金山維修快照；不傳送派工客戶資料。是否連接？'))return;
  busy=true;message('讀取中…');
  try{
   const requestedUser=firebaseAuth.currentUser.uid;
   const token=await firebaseAuth.currentUser.getIdToken();
   const response=await fetch(ENDPOINT,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(response.status===401?'尚未設定讀取帳號或登入已過期':'讀取失敗 HTTP '+response.status);
   const data=await response.json();if(firebaseAuth.currentUser?.uid!==requestedUser)throw Error('登入帳號已變更，請重新連接');if(data.version!==1||!Array.isArray(data.records)||!data.receivedAt)throw Error('快照格式不符');
   snapshot=data;render();message(Date.now()-Date.parse(data.receivedAt)>3*3600000?'資料已超過三小時，請查看同步日誌。':'已連接；每五分鐘檢查最新快照。');
   if(!refreshTimer)refreshTimer=setInterval(()=>load(false),5*60000);
   if(!unsubscribe&&typeof firebaseDb!=='undefined')unsubscribe=firebaseDb.collection('repairTickets').onSnapshot(s=>{liveTickets=s.docs.map(d=>({id:d.id,...d.data()}));render();},()=>message('報修單讀取失敗，送修追蹤可能不完整。'));
  }catch(e){message(e.message+'；目前未更新畫面資料。');}finally{busy=false;}
 }
 function initialize(){ensure();if(typeof firebaseAuth!=='undefined'&&firebaseAuth)firebaseAuth.onAuthStateChanged(user=>{if(!user){snapshot=null;if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;if(unsubscribe)unsubscribe();unsubscribe=null;if(container)document.getElementById('repairSyncResults').replaceChildren();message('請先登入派工系統。');}});}
 const style=document.createElement('style');style.textContent='.repair-sync-panel{padding:18px;margin:12px 0;background:#fff;border:1px solid #ccd8e4;border-radius:10px}.repair-sync-panel h2{font-size:19px}.repair-sync-panel p{line-height:1.6;color:#526579}.repair-sync-panel button{padding:9px 14px;border:0;border-radius:6px;background:#275f83;color:white}.repair-sync-panel [role=status]{margin:0 10px}.repair-sync-scroll{overflow:auto;max-height:420px}.repair-sync-panel table{width:100%;border-collapse:collapse;font-size:13px}.repair-sync-panel th,.repair-sync-panel td{padding:9px;border:1px solid #dce3eb;text-align:left;white-space:pre-wrap;min-width:90px}.repair-sync-panel th{background:#edf3f8;position:sticky;top:0}.repair-sync-counts{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0}';document.head.append(style);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
 // Existing dispatch filters re-render independently. Recompute from current in-memory jobs.
 setInterval(()=>{if(snapshot&&container?.offsetParent)render();},30000);
})();
