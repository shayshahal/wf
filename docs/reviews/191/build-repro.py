from pathlib import Path
import re,json
root=Path.cwd().as_uri()
s=Path('src/gates/deliver-recovery.selfcheck.ts').read_text(encoding='utf-8').split('// #190: continuous publish')[0]
s=re.sub(r"from '([^']+)'", lambda m: 'from '+json.dumps(root+'/src/gates/'+m[1]) if m[1].startswith('.') else m[0],s)
s=re.sub(r"new URL\('([^']+)', import.meta.url\)",lambda m:'new URL('+json.dumps(root+'/src/gates/'+m[1])+')',s)
s=s.replace("!k.startsWith('GIT_') &&", "!k.startsWith('PI_') && !k.startsWith('GIT_') &&")
inject=r'''
const trackerFile = process.env.WF_TEST_REMOTE + '.tracker';
const trackerRead = () => JSON.parse(readFileSync(trackerFile, 'utf8'));
const trackerWrite = (t) => writeFileSync(trackerFile, JSON.stringify(t));
const json = (o) => new Response(JSON.stringify(o), {status:200});
globalThis.fetch = async (url, init = {}) => {
 const t = trackerRead(), u = String(url), method = init.method ?? 'GET';
 t.calls.push({url:u,method});
 if (u.includes('/changelog')) {trackerWrite(t); return json({values:[],isLast:true});}
 if (u.endsWith('/comment') && method === 'POST') {t.comments.push({body:JSON.parse(init.body).body}); trackerWrite(t);return json({});}
 if (u.includes('/transitions')) {
  if(method === 'POST') {t.transitions++;t.status='Fixed in Local';trackerWrite(t);return new Response(null,{status:204});}
  trackerWrite(t);return json({transitions:t.status==='Fixed in Local'?[]:[{id:'31',to:{name:'Fixed in Local'}}]});
 }
 trackerWrite(t);return json({fields:{status:{name:t.status},attachment:[],comment:{comments:t.comments}}});
};
'''
s=s.replace("await run(JSON.parse",inject+"\nawait run(JSON.parse")
s=s.replace("...ENV, WF_TEST_REMOTE", "...ENV, JIRA_EMAIL: 'fixture@example.invalid', JIRA_TOKEN: 'controlled-not-real', WF_TEST_REMOTE")
s+=r'''
const f = makeRepo('191-continuous');
const trackerPath = f.remote + '.tracker';
const tracker = () => JSON.parse(readFileSync(trackerPath,'utf8'));
const run = (args: string[]) => {const r=attempt(f,'ok',args);console.log('$ wf '+args.join(' ')+'\nexit '+r.code+'\n'+r.out);return r;};
try {
 writeFileSync(trackerPath,JSON.stringify({status:'In Progress',comments:[],transitions:0,calls:[]}));
 const published=run(['deliver']);
 check('publish records OPEN handoff, not delivery',published.code===0 && !!readState(f).pr_handoff && !readState(f).delivery,published.out);
 const notePath=join(f.work,NOTE);
 writeFileSync(notePath,readFileSync(notePath,'utf8').replace(/<[^>]*>/g,'filled').replace(/^pictures:.*$/m,'pictures: none'));
 setState(f,{history:[{step:'classify',at:'2026-10-01T00:00:00Z'}]});
 const notified=run(['post']);
 check('OPEN notification posts once and never transitions',notified.code===0 && tracker().comments.length===1 && tracker().transitions===0 && readFileSync(notePath,'utf8').includes('(posted)'),notified.out);
 const remote=readRemote(f);remote.prs[BRANCH][0].state='MERGED';remote.prs[BRANCH][0].headRefOid=must(['rev-parse','HEAD'],f.work);setRemote(f,remote);
 console.log('CONTROLLED HUMAN MERGE: existing published candidate now MERGED');
 const reconciled=run(['deliver']);
 check('delivery reconciliation records confirmed merge',reconciled.code===0 && !!readState(f).delivery && readState(f).step==='merged',reconciled.out);
 const next=run(['next']);
 check('next does not offer reap with tracker incomplete',!next.out.startsWith('done:'),next.out);
 const posted=run(['post']);
 check('previously notified ticket reconciles actual delivered status',posted.code===0 && tracker().status==='Fixed in Local',JSON.stringify(tracker()));
 run(['post']);
 check('retries never duplicate notification',tracker().comments.length===1 && readRemote(f).create===1 && readRemote(f).merge===0,JSON.stringify(tracker()));
 console.log('TRACKER FINAL:',JSON.stringify(tracker()));
} finally {rmSync(ROOT,{recursive:true,force:true});}
process.exitCode=failures?1:0;
'''
Path('docs/reviews/191/repro.ts').write_text(s,encoding='utf-8')
