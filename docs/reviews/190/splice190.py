from pathlib import Path

repo = Path('C:/Users/Shay/.t3/worktrees/wf/fix-190-correction-merge-reconciliation')
target = repo / 'src/gates/deliver-recovery.selfcheck.ts'
section = (repo / 'docs/reviews/190/section190.txt').read_text(encoding='utf-8')
text = target.read_text(encoding='utf-8')
start = text.index('// #190: the real dispatcher composes')
end = text.index('// \u2500\u2500 the merge completed remotely')
target.write_text(text[:start] + section + text[end:], encoding='utf-8', newline='')
print('spliced', len(section), 'chars')
