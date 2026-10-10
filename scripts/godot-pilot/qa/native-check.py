"""Verify the actual exported Universal pilot in isolated, fresh public-fixture saves."""
from pathlib import Path
import argparse, hashlib, json, os, plistlib, subprocess, traceback

parser = argparse.ArgumentParser()
parser.add_argument('--app', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
app = Path(args.app).resolve()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
def require(ok, message):
    if not ok: raise RuntimeError(message)
def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()
def pins():
    return {str(p.relative_to(app)): {'bytes': p.stat().st_size, 'sha256': digest(p)} for p in sorted(app.rglob('*')) if p.is_file()}
report = {'passed': False, 'app': str(app), 'scope': 'Exported release template; authored public fixture and converted public two-source fixture; isolated progress; no AI calls.', 'runs': []}
try:
    report['filesBefore'] = pins()
    info = plistlib.loads((app/'Contents/Info.plist').read_bytes())
    binary = app/'Contents/MacOS'/info['CFBundleExecutable']
    report['architectures'] = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip().split()
    require(set(report['architectures']) == {'arm64', 'x86_64'}, 'Expected Universal arm64+x86_64 binary')
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True,capture_output=True)
    fixture = root/'fixtures/public-factory-pilot.json'
    fixture_hash = digest(fixture)
    for architecture in ['arm64','x86_64']:
        for mode in ['authored','converted']:
            name = architecture+'-'+mode
            folder = out/name; folder.mkdir()
            screens = folder/'screenshots'; screens.mkdir()
            save = folder/'progress.json'
            env = dict(os.environ, ASTERLOOM_PILOT_QA_SAVE=str(save), ASTERLOOM_PILOT_QA_SCREENSHOTS=str(screens))
            command = ['/usr/bin/arch','-'+architecture,str(binary),'--','--qa-play']
            if mode == 'converted': command.append('--mission-pack='+str(fixture))
            result = subprocess.run(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
            (folder/'run.log').write_bytes(result.stdout)
            require(result.returncode == 0, name+' process failed')
            require(b'SCRIPT ERROR' not in result.stdout and b'PILOT_QA_FAILURE' not in result.stdout, name+' reported an error')
            proof = json.loads(Path(str(save)+'.proof.json').read_text())
            require(proof.get('status') == 'passed' and proof.get('checks',0)>=40, name+' missing explicit checks')
            require(proof.get('source_unchanged') is True and proof.get('reopened_state_equal') is True, name+' source/progress verification failed')
            require(set(proof['completions']) == {'sequence','dependency'}, name+' did not complete both constructions')
            require(proof['experimental'] == (mode == 'converted'), name+' assessment mode changed')
            require(proof['xp'] == (0 if mode == 'converted' else 60), name+' unexpected workshop score')
            require(len(proof.get('captures',[]))==5, name+' did not save five actual captures')
            for capture in proof['captures']:
                file=Path(capture['path']); require(file.parent==screens,'Capture escaped its test directory')
                require(file.stat().st_size==capture['bytes'] and digest(file)==capture['sha256'],'Capture bytes changed')
                require(capture['width']>=980 and capture['height']>=680,'Capture too small')
            saved_bytes=save.read_bytes()
            reopen_command=[('--qa-smoke' if arg=='--qa-play' else arg) for arg in command]
            reopened=subprocess.run(reopen_command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
            (folder/'reopen.log').write_bytes(reopened.stdout)
            require(reopened.returncode==0 and b'PILOT_SCENE_SMOKE_OK' in reopened.stdout and b'stage=quest' in reopened.stdout,name+' fresh process did not restore the quest')
            require(save.read_bytes()==saved_bytes,name+' reopening changed or reset saved progress')
            report['runs'].append({'architecture':architecture,'fixture':mode,'processExitCode':result.returncode,'freshProcessReopened':True,'reopenPreservedSaveBytes':True,'proof':proof})
    require(digest(fixture)==fixture_hash,'Public input fixture changed')
    report['filesAfter']=pins(); require(report['filesAfter']==report['filesBefore'],'App changed during native checks')
    report['passed']=True
except Exception:
    report['error']=traceback.format_exc()
finally:
    (out/'native-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'completedRuns':len(report['runs']),'report':str(out/'native-verification.json'),'error':report.get('error')}))
raise SystemExit(0 if report['passed'] else 1)
