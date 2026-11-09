(function(root){
  'use strict';
  const code=v=>String(v||'').trim().toUpperCase();
  const machine=v=>code(v).replace(/\s/g,'');
  function period(now=new Date()){
    const d=new Date(now.getTime()+8*3600000), y=d.getUTCFullYear(),m=d.getUTCMonth(),day=d.getUTCDate();
    const first=new Date(Date.UTC(y,m-2,1));
    const end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    return {today:new Date(Date.UTC(y,m,day)).toISOString().slice(0,10),start:new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,end))).toISOString().slice(0,10)};
  }
  function usable(j){return j&&!j.cancelled&&j.workflowStatus!=='cancelled'&&!j.isLeaveJob&&!j.isHold&&!(j.statusList||[]).includes('暫押')&&j.date;}
  function jobCode(j){return code(j.customerCode||j.customerNo||String(j.codeName||'').split(/\s/)[0]);}
  function compare(records,jobs,tickets,now){
    const range=period(now),active=(jobs||[]).filter(usable),sources=(records||[]).filter(r=>/^(FU|Y|Z)/.test(r.customerCode));
    const done=sources.filter(r=>r.completedDate>=range.start&&r.completedDate<=range.today);
    const sourceCount=new Map();for(const r of sources)sourceCount.set(r.customerCode,(sourceCount.get(r.customerCode)||0)+1);
    const restores=done.map(r=>{
      const candidates=active.filter(j=>jobCode(j)===r.customerCode&&/復機/.test(j.workItem||'')&&j.date>=range.start&&(!r.sentDate||j.date>=r.sentDate));
      const exact=candidates.filter(j=>machine(j.machineCode)&&machine(j.machineCode)===machine(r.machineCode));
      const selected=exact.length?exact:candidates;
      // Most legacy dispatches have no serial number: show possible matches, never silently close a case.
      const uncertain=selected.length>0&&(!exact.length||sourceCount.get(r.customerCode)>1);
      const status=!selected.length?'待安排候選':uncertain?'復機紀錄待核對':selected.some(j=>j.workflowStatus==='completed')?'已標記完成':'已安排復機';
      return {...r,status,dispatches:selected,uncertain};
    });
    const tracking=sources.filter(r=>r.sentDate).map(r=>{
      const linkedTickets=(tickets||[]).filter(t=>code(t.customerCode)===r.customerCode&&machine(t.machineCode)&&machine(t.machineCode)===machine(r.machineCode));
      const dispatches=active.filter(j=>jobCode(j)===r.customerCode&&(/拆機|送修/.test((j.workItem||'')+' '+(j.workContent||'')))&&j.date>=range.start&&j.date<=range.today&&j.date<=r.sentDate);
      const linked=linkedTickets.filter(t=>(t.dispatchIds||[]).length>0);
      return {...r,status:r.completedDate?'維修完成': '送修中',linkedTickets:linked,dispatches,uncertain:!linked.length||sourceCount.get(r.customerCode)>1};
    }).filter(r=>r.dispatches.length||r.linkedTickets.length);
    return {range,restores,tracking};
  }
  root.RepairSyncCore={period,compare};
})(typeof window==='undefined'?globalThis:window);
