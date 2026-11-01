import json,pathlib,subprocess,tempfile,os,stat,shutil,time
out=pathlib.Path(__file__).resolve().parent

def run(a):
    r=subprocess.run(a,capture_output=True,text=True,encoding='utf8',timeout=60)
    assert r.returncode==0,(a,r.stderr)
    return r.stdout

def onexc(fn,p,e):
    os.chmod(p,stat.S_IWRITE);fn(p)

root=pathlib.Path(tempfile.mkdtemp(prefix='wf158-target-source-'));repo=root/'repo';target=root/'checkout';repo.mkdir()
run(['git','init','-q','-b','main',str(repo)])
run(['git','-C',str(repo),'-c','user.name=wf','-c','user.email=wf@test','commit','--allow-empty','-qm','fixture'])
run(['git','-C',str(repo),'worktree','add','-b','fixture-target',str(target)])
added=[]
try:
    before=json.loads(run(['herdr','workspace','list']))['result']['workspaces']
    opened=json.loads(run(['herdr','worktree','open','--cwd',str(target),'--path',str(target),'--no-focus']))
    after=json.loads(run(['herdr','workspace','list']))['result']['workspaces']
    old={w['workspace_id'] for w in before}
    added=[w for w in after if w['workspace_id'] not in old]
    data={'root':str(root),'repo':str(repo),'target':str(target),'opened':opened,'added':added}
    (out/'native-target-source.json').write_text(json.dumps(data,indent=2),encoding='utf8')
    print(json.dumps(data,indent=2))
finally:
    for w in added:
        assert pathlib.Path(w['worktree']['checkout_path']).resolve().is_relative_to(root.resolve())
        run(['herdr','workspace','close',w['workspace_id']])
    run(['git','-C',str(repo),'worktree','remove',str(target)])
    for attempt in range(40):
        try:shutil.rmtree(root,onexc=onexc);break
        except PermissionError:
            if attempt==39:raise
            time.sleep(0.25)
