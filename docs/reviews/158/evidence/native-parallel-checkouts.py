# Owned normal/.bare fixtures; explicit parent setup is NOT an effect of the helper under test.
import json, os, pathlib, shutil, stat, subprocess, tempfile, time
out=pathlib.Path(__file__).resolve().parent;entry=str(out.parents[3]/'env/wf.mjs')
assert os.environ.get('HERDR_ENV')=='1'
receipts=[];results=[]
def run(argv,cwd=None,expected=0):
    begin=time.monotonic();r=subprocess.run(argv,cwd=cwd,capture_output=True,text=True,encoding='utf8',timeout=60)
    d={'argv':argv,'cwd':str(cwd) if cwd else None,'exit':r.returncode,'seconds':round(time.monotonic()-begin,3),'stdout':r.stdout,'stderr':r.stderr};receipts.append(d)
    (out/'native-parallel-receipts.json').write_text(json.dumps(receipts,indent=2),encoding='utf8')
    if expected is not None:assert r.returncode==expected,d
    return r

def workspaces():return json.loads(run(['herdr','workspace','list']).stdout)['result']['workspaces']
def focused(rows):return [(w['workspace_id'],w.get('active_tab_id')) for w in rows if w.get('focused')]
def remove_tree(root):
    def readonly(fn,path,error):
        if getattr(error,'winerror',None)!=5:raise error
        os.chmod(path,stat.S_IWRITE);fn(path)
    for attempt in range(40):
        try:shutil.rmtree(root,onexc=readonly);return attempt+1
        except PermissionError:
            if attempt==39:raise
            time.sleep(.25)

for layout in ('normal',):
    root=pathlib.Path(tempfile.mkdtemp(prefix='wf158-parent-'+layout+'-'));repo=root/'repo';target=root/"existing $ ' checkout";owned=[]
    try:
        repo.mkdir();run(['git','init','-q','-b','main',str(repo)])
        run(['git','-C',str(repo),'-c','user.name=wf','-c','user.email=wf@test','commit','--allow-empty','-qm','fixture'])
        if layout=='bare':
            bare=root/'.bare';run(['git','clone','--bare',str(repo),str(bare)]);remove_tree(repo);repo=bare
            # Match the existing machine layout, without changing a real repository.
            (root/'.git').write_text('gitdir: ./.bare\n',encoding='utf8')
        parent=root if layout=='bare' else repo
        flags=['--detach'] if layout=='detached' else ['-b','fixture-existing']
        run(['git','-C',str(repo),'worktree','add',*flags,str(target)])
        hook=root/'hooks';hook.mkdir();marker=root/'checkout-hook-ran'
        (hook/'post-checkout').write_text('#!/bin/sh\nprintf bad >> "'+str(marker).replace('\\','/')+'"\n',encoding='utf8')
        run(['git','-C',str(repo),'config','core.hooksPath',str(hook)])
        (target/'.config').mkdir();setup=root/'setup-ran'
        (target/'.config/wt.toml').write_text('pre-start = '+json.dumps('echo duplicate > "'+str(setup).replace('\\','/')+'"')+'\n',encoding='utf8')
        note=target/'REVIEW.md';note.write_text('Fixture obligation; not a real approval.\n',encoding='utf8')
        registry=run(['git','-C',str(repo),'worktree','list','--porcelain']).stdout
        head=run(['git','-C',str(target),'rev-parse','HEAD']).stdout
        initial=workspaces();initial_ids={w['workspace_id'] for w in initial}
        absent=run(['node',entry,'herdr','open',str(target)],cwd=target,expected=1)
        assert 'repository-parent workspace is not open' in absent.stderr,absent.stderr
        assert {w['workspace_id'] for w in workspaces()}==initial_ids
        created=json.loads(run(['herdr','workspace','create','--cwd',str(parent),'--no-focus']).stdout)['result']
        parent_id=created['workspace']['workspace_id'];owned.append(parent_id)
        assert pathlib.Path(created['root_pane']['cwd']).resolve()==parent.resolve()
        before=workspaces();before_ids={w['workspace_id'] for w in before}
        processes=[subprocess.Popen(['node',entry,'herdr','open',str(target)],cwd=target,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8') for _ in range(2)]
        parallel=[]
        for process in processes:
            stdout,stderr=process.communicate(timeout=60)
            parallel.append({'exit':process.returncode,'stdout':stdout,'stderr':stderr})
        (out/'native-parallel-commands.json').write_text(json.dumps(parallel,indent=2),encoding='utf8')
        assert all(p['exit']==0 for p in parallel),parallel
        observed=[json.loads(p['stdout']) for p in parallel]
        assert len({p['checkout']['workspace'] for p in observed})==1,observed
        first=next((p for p in observed if p['disposition']=='opened'),observed[0])
        assert first['kind']=='opened' and first['disposition']=='opened',first
        target_id=first['checkout']['workspace'];owned.append(target_id)
        repeat=json.loads(run(['node',entry,'herdr','open',str(target)],cwd=target).stdout)
        assert repeat['disposition']=='reused' and repeat['checkout']['workspace']==target_id,repeat
        after=workspaces();assert {w['workspace_id'] for w in after}-before_ids=={target_id}
        assert [wid for wid,_ in focused(before)]==[wid for wid,_ in focused(after)],{'before':focused(before),'after':focused(after)}
        parent_info=json.loads(run(['herdr','workspace','get',parent_id]).stdout)['result']['workspace'];assert not parent_info['focused']
        info=json.loads(run(['herdr','workspace','get',target_id]).stdout)['result']['workspace']
        assert not info['focused'];assert pathlib.Path(info['worktree']['checkout_path']).resolve()==target.resolve()
        assert run(['git','-C',str(repo),'worktree','list','--porcelain']).stdout==registry
        assert run(['git','-C',str(target),'rev-parse','HEAD']).stdout==head
        assert not marker.exists() and not setup.exists()
        run(['herdr','workspace','close',target_id]);owned.remove(target_id)
        assert target.is_dir() and note.read_text(encoding='utf8')=='Fixture obligation; not a real approval.\n'
        assert run(['git','-C',str(repo),'worktree','list','--porcelain']).stdout==registry
        listed=json.loads(run(['node',entry,'herdr','list'],cwd=target).stdout)
        row=next(t for t in listed['worktrees'] if pathlib.Path(t['path']).resolve()==target.resolve());assert row['workspace'] is None
        results.append({'layout':layout,'missing_parent':'refused without workspace effect','first':'opened','second':'reused','parent':parent_id,'target':target_id,'new_workspaces_from_helper':[target_id],'focus_before':focused(before),'focus_after':focused(after),'registry_and_head_unchanged':True,'checkout_and_setup_hooks_ran':False,'close_kept_checkout_and_obligation':True,'post_close_mapping':None})
    finally:
        for wid in reversed(owned):run(['herdr','workspace','close',wid])
        # All fixture IDs are reconciled by recorded path, even if a lost response interrupted assignment.
        for w in workspaces():
            wt=w.get('worktree',{}).get('checkout_path','')
            if wt and pathlib.Path(wt).resolve().is_relative_to(root.resolve()):run(['herdr','workspace','close',w['workspace_id']])
        if target.exists():run(['git','-C',str(repo),'worktree','remove','--force',str(target)])
        attempts=remove_tree(root);receipts.append({'fixture':str(root),'cleanup_attempts':attempts,'removed':not root.exists()})
        (out/'native-parallel-receipts.json').write_text(json.dumps(receipts,indent=2),encoding='utf8')
(out/'native-parallel-result.json').write_text(json.dumps(results,indent=2),encoding='utf8');print(json.dumps(results,indent=2))
