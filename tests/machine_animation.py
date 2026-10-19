"""Generated operating poses, all-level clearance and common animation transforms."""
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sheet=Image.open(ROOT/'assets/generated/popo-operating.png').getchannel('A')
for i in range(4):
    x=i%2*694; y=i//2*566
    box=sheet.crop((x,y,x+694,min(y+566,1133))).point(lambda a:255 if a>32 else 0).getbbox()
    assert box and min(box[:2])>0 and box[2]<694 and box[3]<566, (i,box)
print('PASS all four generated operating poses are complete inside their cells',flush=True)
with sync_playwright() as p:
    b=p.chromium.launch();page=b.new_page(viewport={'width':1280,'height':720});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((ROOT/'index.html').as_uri()+'?dev=1')
    page.wait_for_function('window.popoDebug && !document.querySelector("#btn-play").disabled')
    page.locator('.dev-panel button').nth(2).click()
    page.locator('.dev-panel').evaluate('(e)=>e.remove()')
    page.wait_for_timeout(600)
    results=page.evaluate('''() => {
      const g=popoDebug.game, p=g.popo, w=g.winch;
      const raftRight=p.raftEnds().right;
      const levels=PopoGame.LEVELS.map((lv,i)=>{
        g.prepareLevel(i); const n=g.net, l=n.limits, t=n.target;
        const targetFits=t.x>=l.left && t.x<=l.right && t.y>=l.top && t.y<=l.bottom;
        return {level:i+1,targetFits,left:g.netRest.x+l.left,top:l.top,right:g.netRest.x+l.right,raftRight};
      });
      const frames=[];for(let i=0;i<8;i++){w.angle=i*Math.PI/2+.01;p.setMachine(w);frames.push(p.frame);}
      const reverse=[];for(let i=7;i>=0;i--){w.angle=i*Math.PI/2+.01;p.setMachine(w);reverse.push(p.frame);}
      const saved={tilt:p.tilt,squash:p.squash,travelShift:p.travelShift};
      p.tilt=.13;p.squash=.07;p.travelShift=27;
      const ctx=document.createElement('canvas').getContext('2d');p.applyTransform(ctx);ctx.translate(p.anchor.x,p.anchor.y);
      const q=new DOMPoint(w.hang.x,w.hang.y).matrixTransform(ctx.getTransform());const actual=p.transformPoint(w.hang.x,w.hang.y);
      const error=Math.hypot(q.x-actual.x,q.y-actual.y);Object.assign(p,saved);
      w.setRopeOut(0);w.angle=0;g.prepareLevel(0);p.setMachine(w);
      return {levels,frames,reverse,error};
    }''')
    for lv in results['levels']:
        assert lv['targetFits'] and lv['left']>=lv['raftRight']+50 and lv['top']>=24 and lv['right']<=1624, lv
    assert results['frames']==[0,1,2,3,0,1,2,3],results
    assert results['reverse']==[3,2,1,0,3,2,1,0],results
    assert results['error']<0.001,results
    page.evaluate('PopoGame.state.paused=true')
    for i in range(4):
        page.evaluate('(i)=>{const g=popoDebug.game;g.winch.angle=i*Math.PI/2+.01;g.popo.setMachine(g.winch);g.draw();}',i)
        page.screenshot(path=f'/tmp/popo-operating-{i}.png')
    assert not errors,errors
    b.close()
print('PASS every level clears the raft, forward/reverse poses, exact raft/net transforms and no errors',flush=True)
