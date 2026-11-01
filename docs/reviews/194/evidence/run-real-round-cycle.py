# Isolated development verification only. Always restore installed hooks, including after failure.
import json
import os
from pathlib import Path
import subprocess
import sys
import time

repo = Path('C:/Users/Shay/work/jeweleryx')
editing = Path('C:/Users/Shay/work/wf-194')
out = editing / 'docs/reviews/194/evidence'
entry = str(editing / 'env/wf.mjs')
branch = sys.argv[1] if len(sys.argv) > 1 else 'bench/194-round-cycle'
prefix = sys.argv[2] if len(sys.argv) > 2 else 'real-round'
receipts = []
started = time.monotonic()

def run(label, args, cwd=repo, extra_env=None, timeout=300, shell=False):
    begin = time.monotonic()
    env = dict(os.environ)
    env.update(extra_env or {})
    with (out / (label.replace('real-round', prefix) + '.log')).open('w', encoding='utf-8') as log:
        log.write(json.dumps({'args': args, 'cwd': str(cwd)}, ensure_ascii=False) + '\n')
        log.flush()
        try:
            result = subprocess.run(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=timeout, shell=shell)
            code = result.returncode
        except subprocess.TimeoutExpired:
            log.write('\nTIMED OUT; mutation outcome requires reconciliation\n')
            code = None
    receipts.append({'step': label, 'exit': code, 'seconds': round(time.monotonic()-begin, 2)})
    return code == 0

try:
    if not run('real-round-hook-editing', ['node', entry, 'hook', 'install'], timeout=60):
        raise RuntimeError('editing hook install failed')
    if not run('real-round-new', ['node', entry, 'new', branch, '--class', 'A'], timeout=480):
        raise RuntimeError('bench creation/setup failed; cleanup and restoration still run')
    trees = subprocess.check_output(['git', 'worktree', 'list', '--porcelain'], cwd=repo, text=True, encoding='utf-8')
    blocks = [b for b in trees.split('\n\n') if f'branch refs/heads/{branch}\n' in b+'\n']
    if len(blocks) != 1:
        raise RuntimeError('bench registry identity unavailable')
    target = Path(blocks[0].splitlines()[0].removeprefix('worktree '))
    if not run('real-round-serve', ['node', entry, 'serve', '--wait'], cwd=target, timeout=300):
        raise RuntimeError('bench readiness failed')
    source = """
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {directUrls} from 'file:///C:/Users/Shay/work/wf-194/projects/jewelryx/index.ts';
import {basePortForBranch} from 'file:///C:/Users/Shay/work/wf-194/src/worktrees/worktree-registry.ts';
const urls=directUrls(basePortForBranch(BRANCH));
const status={};
for(const [name,url] of Object.entries(urls)){
 const target=name==='api'?new URL('/openapi.json',url):new URL('/',url);
 const response=await fetch(target,{signal:AbortSignal.timeout(30000)});
 status[name]=response.status; await response.body?.cancel();
 if(!response.ok) throw new Error(name+' HTTP '+response.status);
}
const ownership=JSON.parse(readFileSync(join(process.cwd(),'.wf','serve-owner.json'),'utf8'));
if(!ownership.token||!ownership.processes?.length) throw new Error('server ownership receipt missing');
const sourceRef=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
console.log(JSON.stringify({sourceRef,status,ownershipRecorded:true,state:ownership.state},null,2));
"""
    source = source.replace('BRANCH', json.dumps(branch))
    if not run('real-round-readback', ['node', '--input-type=module', '-e', source], cwd=target, timeout=120):
        raise RuntimeError('bench HTTP or ownership readback failed')
except Exception as error:
    receipts.append({'failure': str(error)})
finally:
    run('real-round-reap', ['node', entry, 'reap', branch], extra_env={'WF_FORCE_REAP':'1'}, timeout=300)
    run('real-round-hook-restored', 'wfk hook install', timeout=120, shell=True)
    receipts.append({'elapsed_seconds': round(time.monotonic()-started,2)})
    (out/(prefix+'-cycle.json')).write_text(json.dumps(receipts,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipts,indent=2))

required = ['real-round-hook-editing','real-round-new','real-round-serve','real-round-readback','real-round-reap','real-round-hook-restored']
raise SystemExit(0 if all(any(r.get('step')==name and r.get('exit')==0 for r in receipts) for name in required) else 1)
