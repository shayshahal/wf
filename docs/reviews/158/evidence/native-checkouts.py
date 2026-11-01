# Explicitly owned temporary Git fixtures and Herdr workspaces only; never worktree remove in Herdr.
import json, os, pathlib, shutil, stat, subprocess, tempfile, time
out = pathlib.Path(__file__).resolve().parent
entry = str(out.parents[3] / 'env/wf.mjs')
assert os.environ.get('HERDR_ENV') == '1'
receipts = json.loads((out/'native-checkouts-receipts.json').read_text(encoding='utf8')) if (out/'native-checkouts-receipts.json').exists() else []
def remove_tree(path):
    def readonly(func, name, error):
        if not isinstance(error, PermissionError): raise error
        os.chmod(name, stat.S_IWRITE);func(name)
    if pathlib.Path(path).exists():shutil.rmtree(path,onexc=readonly)
def run(argv, cwd=None, required=True):
    start=time.monotonic(); r=subprocess.run(argv,cwd=cwd,capture_output=True,text=True,encoding='utf8',timeout=60)
    receipt={'argv':argv,'cwd':str(cwd) if cwd else None,'exit':r.returncode,'seconds':round(time.monotonic()-start,3),'stdout':r.stdout,'stderr':r.stderr};receipts.append(receipt)
    (out/'native-checkouts-receipts.json').write_text(json.dumps(receipts,indent=2),encoding='utf8')
    if required: assert r.returncode==0,receipt
    return r

def focus():
    data=json.loads(run(['herdr','workspace','list']).stdout)['result']['workspaces']
    return [(w['workspace_id'],w.get('active_tab_id')) for w in data if w.get('focused')]

# Close the workspace this same task created during protocol discovery, then remove only its Git fixture.
initial=json.loads((out/'native-initial.json').read_text(encoding='utf8'))
initial_open=json.loads(initial['steps'][1]['stdout'])['result']['workspace']
initial_id=initial_open['workspace_id']
current=run(['herdr','workspace','get',initial_id],required=False)
if current.returncode==0:
    workspace=json.loads(current.stdout)['result']['workspace']
    assert pathlib.Path(workspace['worktree']['checkout_path']).resolve()==pathlib.Path(initial['checkout']).resolve()
    assert workspace['pane_count']==1 and workspace['tab_count']==1 and workspace.get('agent_status') in ('unknown','none',None)
    run(['herdr','workspace','close',initial_id])
if pathlib.Path(initial['checkout']).exists():run(['git','-C',initial['repo'],'worktree','remove',initial['checkout']])
remove_tree(initial['root'])

results=[]
for layout in ('normal','bare'):
    root=pathlib.Path(tempfile.mkdtemp(prefix='wf158-native-'+layout+'-'))
    repo=root/'repo';target=root/"existing $ ' checkout";owned=None
    try:
        repo.mkdir();run(['git','init','-q','-b','main',str(repo)])
        run(['git','-C',str(repo),'-c','user.name=wf','-c','user.email=wf@test','commit','--allow-empty','-qm','fixture'])
        if layout=='bare':
            bare=root/'.bare';run(['git','clone','--bare',str(repo),str(bare)]);remove_tree(repo);repo=bare
        run(['git','-C',str(repo),'worktree','add','-b','fixture-existing',str(target)])
        hook=root/'hooks';hook.mkdir();marker=root/'checkout-hook-ran'
        (hook/'post-checkout').write_text('#!/bin/sh\nprintf bad >> "'+str(marker).replace('\\','/')+'"\n',encoding='utf8')
        run(['git','-C',str(repo),'config','core.hooksPath',str(hook)])
        (target/'.config').mkdir();setup_marker=root/'setup-ran'
        (target/'.config/wt.toml').write_text('pre-start = '+json.dumps('echo duplicate > "'+str(setup_marker).replace('\\','/')+'"')+'\n',encoding='utf8')
        approval=target/'REVIEW.md';approval.write_text('Fixture obligation; never a real approval.\n',encoding='utf8')
        registry=run(['git','-C',str(repo),'worktree','list','--porcelain']).stdout
        head=run(['git','-C',str(target),'rev-parse','HEAD']).stdout
        before=focus()
        first=run(['node',entry,'herdr','open',str(target)],cwd=repo)
        result=json.loads(first.stdout);assert result['kind']=='opened' and result['disposition']=='opened',result
        owned=result['checkout']['workspace']
        again=json.loads(run(['node',entry,'herdr','open',str(target)],cwd=repo).stdout)
        assert again['disposition']=='reused' and again['checkout']['workspace']==owned,again
        after=focus();assert before==after,{'before':before,'after':after}
        info=json.loads(run(['herdr','workspace','get',owned]).stdout)['result']['workspace']
        assert not info['focused'];assert pathlib.Path(info['worktree']['checkout_path']).resolve()==target.resolve()
        assert run(['git','-C',str(repo),'worktree','list','--porcelain']).stdout==registry
        assert run(['git','-C',str(target),'rev-parse','HEAD']).stdout==head
        assert not marker.exists() and not setup_marker.exists()
        run(['herdr','workspace','close',owned]);owned=None
        assert target.is_dir() and approval.read_text(encoding='utf8')=='Fixture obligation; never a real approval.\n'
        assert run(['git','-C',str(repo),'worktree','list','--porcelain']).stdout==registry
        listing=json.loads(run(['node',entry,'herdr','list'],cwd=repo).stdout)
        row=next(t for t in listing['worktrees'] if pathlib.Path(t['path']).resolve()==target.resolve())
        assert row['workspace'] is None
        results.append({'layout':layout,'first':'opened','second':'reused','workspace':info['workspace_id'],'focus_before':before,'focus_after':after,'git_registry_unchanged':True,'head_unchanged':True,'checkout_hook_ran':False,'worktrunk_setup_ran':False,'close_kept_checkout_and_obligation':True,'post_close_mapping':None})
    finally:
        if owned:run(['herdr','workspace','close',owned])
        # Git-only fixture removal is separate from closing the UI. Dirty files belong to this fixture.
        if target.exists():run(['git','-C',str(repo),'worktree','remove','--force',str(target)])
        remove_tree(root)
(out/'native-checkouts-result.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print(json.dumps(results,indent=2))
