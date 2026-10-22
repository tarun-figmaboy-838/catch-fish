(function (PopoGame) {
'use strict';
const { clock, ease, Cancelled, state, PHASE, newToken, isCurrent, Fish, STORY, LEVELS, NATURAL_FISH, STAGE_W, STAGE_H, geo, TUCK } = PopoGame;

function swallow(e) {
  if (!(e instanceof Cancelled)) throw e;
}

const between = (a, b) => a + Math.random() * (b - a);
// a different fish each time, in a random order
const shuffled = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

// --- the opening ---------------------------------------------------------------
// Before the first line, a cartoon entrance: Popo zooms in rowing flat out (honk honk!), slams
// on the brakes with a screech, overshoots and springs back boing-boing, and in a poof the
// paddle is gone and his paws are on the winch's wheel (ta-da!).
async function popoArrives(game, token) {
  const { popo, fx, audio } = game;
  const reduced = fx.reduced;
  const from = -620;
  const overshoot = reduced ? 0 : 110;
  const stroke = 520; // frantic paddling
  const raftFront = () => popo.raftEnds().right + popo.travelShift;
  popo.travelShift = from;
  popo.startRowing(stroke);
  try {
    await clock.wait(120, token);
    audio.play('honk');
    audio.play('whoosh');
    audio.setTravel(true);
    let lastBlade = popo.paddleTip();
    let lastWake = 0;
    // a fish or two flee ahead of the speeding raft and leap out of its way
    if (!reduced) {
      shuffled(NATURAL_FISH).slice(0, Math.random() < 0.4 ? 1 : 2).forEach((key, i) => {
        clock.wait(i * 260, token).then(() => jump(game, token, key, between(430, 520) + i * 110, 1,
          { height: between(120, 170), ms: between(650, 800), scale: between(0.55, 0.7), speed: between(720, 840) })).catch(() => {});
      });
    }
    const zoom = reduced ? 1300 : 1500;
    await clock.tween(zoom, token, (t) => {
      const elapsed = t * zoom;
      popo.travelShift = from + (overshoot - from) * (t < 0.15 ? (t * t) / 0.3 : t - 0.075) / 0.925;
      popo.setRowingTime(elapsed);
      popo.tilt = -0.03 - popo.rowRig.sample(elapsed, stroke).power * 0.03; // leaning into it
      const blade = popo.paddleTip();
      if (lastBlade && blade && lastBlade.y < game.waterline && blade.y >= game.waterline) {
        const crossing = (game.waterline - lastBlade.y) / (blade.y - lastBlade.y);
        fx.splash(lastBlade.x + (blade.x - lastBlade.x) * crossing, game.waterline, false);
        audio.play('paddle');
      }
      lastBlade = blade;
      if (elapsed - lastWake > 160) {
        lastWake = elapsed;
        const stern = popo.raftEnds().left + popo.travelShift;
        fx.ripple(stern - 12, game.waterline + 6, 0.9);
        if (stern > 0) fx.splash(stern - 6, game.waterline, false); // spray kicked up behind
        fx.splash(stern + 340, game.waterline, false); // and off the bow
      }
    });
    audio.setTravel(false);
    const held = popo.rowing.time;
    if (overshoot) {
      // brakes! the raft screeches past the spot, squashing up in a fan of spray; fish swim
      // over to see what the fuss is about
      fishSaysHello(game, token);
      audio.play('skid');
      audio.play('woah');
      let lastSpray = 0;
      await clock.tween(520, token, (t) => {
        popo.travelShift = overshoot + 34 * Math.sin(t * Math.PI / 2);
        popo.tilt = 0.12 * Math.sin(t * Math.PI);
        popo.squash = 0.12 * Math.sin(t * Math.PI);
        popo.setRowingTime(held);
        if (t - lastSpray > 0.18) { lastSpray = t; fx.splash(raftFront() + 10, game.waterline, true); }
      });
      // ...and springs back onto it, boing-boing
      audio.play('boing');
      const back = overshoot + 34;
      let boinged = false;
      await clock.tween(820, token, (t) => {
        popo.travelShift = back * (1 - ease.outBack(t));
        popo.tilt = -Math.sin(t * Math.PI * 3) * 0.08 * (1 - t);
        popo.squash = -Math.sin(t * Math.PI * 3) * 0.1 * (1 - t);
        popo.setRowingTime(held);
        if (!boinged && t > 0.45) { boinged = true; audio.play('boing'); }
      });
    }
    popo.squash = 0;
    popo.tilt = 0;
    // ta-da: a poof, and the paddle has turned into the handwheel
    const head = popo.headTop();
    game.poof = { x: head.x + 30, y: head.y + 120, t: 0 };
    audio.play('poof');
    await clock.wait(130, token); // the swap happens inside the cloud
  } finally {
    // however the entrance ends (even cancelled by a restart), Popo is left sitting on his spot
    popo.idle();
    popo.travelShift = 0;
    popo.tilt = 0;
    popo.squash = 0;
    if (isCurrent(token)) audio.setTravel(false);
  }
  audio.play('tada');
  fx.sparkle(popo.headTop().x + 40, popo.headTop().y + 50, 18);
  await clock.wait(380, token);
  // a happy hop while the fish leap around him
  game.storyCue('hop');
  await clock.wait(900, token);
}

// One fish swims in from the edge of the water (from the left or right), leaps out with a
// splash each way, and swims on out of view on the other side.
async function jump(game, token, key, x0, dir, { height = 190, ms = 900, scale = 0.7, speed = 600 } = {}) {
  const { fx, audio } = game;
  const wl = game.waterline;
  const surface = wl + 30;
  const depth = wl + 110 + Math.random() * 70;
  const enterX = dir > 0 ? -80 : STAGE_W + 80;
  const exitX = dir > 0 ? STAGE_W + 80 : -80;
  const dx = speed * (ms / 1000) * 0.45; // the leap carries its run-up speed
  const fish = new Fish(key, enterX, depth, dir, scale);
  game.leapers.push(fish);
  let out = false;
  let back = false;
  let rippled = false;
  let lastBubble = 0;
  try {
    await clock.tween(Math.abs(x0 - enterX) / speed * 1000, token, (t) => {
      fish.x = enterX + (x0 - enterX) * t;
      const rise = Math.max(0, (t - 0.6) / 0.4); // swims level, then up toward the surface
      fish.y = depth + (surface - depth) * rise * rise;
      fish.pitch = -0.5 * rise;
      if (t - lastBubble > 0.15) { lastBubble = t; fx.puff(fish.x - dir * fish.w * 0.45, fish.y, -dir, 1); }
      if (!rippled && t > 0.9) { rippled = true; fx.ripple(x0, wl, 0.7); }
    });
    audio.play('leap');
    await clock.tween(ms, token, (t) => {
      fish.x = x0 + dir * dx * t;
      fish.y = surface - height * 4 * t * (1 - t);
      fish.pitch = Math.max(-0.8, Math.min(0.8, -(1 - 2 * t) * 0.9));
      if (!out && fish.y < wl) { out = true; fx.splash(fish.x, wl, false); audio.play('splashSmall'); }
      if (out && !back && t > 0.5 && fish.y > wl) { back = true; fx.splash(fish.x, wl, true); audio.play('splashSmall'); }
    });
    const x1 = fish.x;
    await clock.tween(Math.abs(exitX - x1) / speed * 1000, token, (t) => {
      fish.x = x1 + (exitX - x1) * t;
      const dive = Math.min(1, t / 0.25);
      fish.y = surface + (depth - surface) * (1 - (1 - dive) ** 2);
      fish.pitch = 0.6 * (1 - dive);
    });
  } finally {
    game.leapers = game.leapers.filter((f) => f !== fish);
  }
}

// A few fish swim in from either side and leap for joy beside the raft, each at its own
// moment, size, height and speed, then swim away. They run on their own.
function fishSaysHello(game, token) {
  const raft = game.popo.raftEnds().right;
  const count = 3 + Math.floor(Math.random() * 2);
  const fish = shuffled(NATURAL_FISH);
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    at += between(100, 380);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x0 = between(raft + 150, raft + 640); // clear of the raft
    const opts = { height: between(110, 220), ms: between(700, 950), scale: between(0.55, 0.72), speed: between(560, 720) };
    clock.wait(at, token).then(() => jump(game, token, fish[i], x0, dir, opts)).catch(() => {});
  }
}

// The journey opens with the narrator; then the first school swims in and the net appears.
async function opening(game) {
  const token = newToken();
  try {
    state.phase = PHASE.INTRO;
    game.instruct('');
    await popoArrives(game, token);
    for (const line of STORY.intro) await game.say(line, token);
    await firstPuzzle(game, token);
  } catch (e) {
    swallow(e);
  }
}

// Straight to the first net, without the story (Play Again).
async function startLevels(game) {
  const token = newToken();
  try {
    state.phase = PHASE.INTRO;
    await firstPuzzle(game, token);
  } catch (e) {
    swallow(e);
  }
}

// The first school swims in, Popo lets the net down from the boom in its starting shape, and
// the first prompt begins.
async function firstPuzzle(game, token) {
  game.fishIn();
  await clock.wait(400, token);
  await letNetDown(game, token);
  game.beginPuzzle();
}

// --- the net between catches ----------------------------------------------------------
// Popo winds the net up: he cranks, the ring rises to the pulley and the net gathers into a
// bundle under it, swaying as it goes.
const GATHER_ROPE = 160; // the rope gathering the net draws in, beyond the ring's own travel

async function windNetUp(game, token) {
  const { net, winch, audio, fx } = game;
  const ms = fx.reduced ? 700 : 1100;
  const from = winch.ropeOut;
  const to = Math.min(from, -TUCK); // a hauled-up bag already hangs high; it never drops to gather
  const pouch = net.pouch;
  let last = net.furl;
  net.locked = true;
  winch.working = -1;
  audio.crank(ms / 1000);
  await clock.tween(ms, token, (t) => {
    const k = ease.inOut(t);
    net.furl = k;
    net.pouch = pouch * (1 - k); // an emptied bag opens out as it gathers
    winch.setRopeOut(from + (to - from) * k);
    winch.turn(-(k - last) * GATHER_ROPE);
    last = k;
    net.swing = fx.reduced ? 0 : Math.sin(t * Math.PI * 3) * 0.035 * (1 - t);
  });
  net.swing = 0;
  net.pouch = 0;
  winch.working = 0;
}

// ...and lets it down: the bundle drops from the pulley and opens into the frame. `from` is the
// frame it was wound up in (the last net's), so it changes shape as it opens, never jumps.
async function letNetDown(game, token, from = null) {
  const { net, winch, audio, fx } = game;
  const ms = fx.reduced ? 700 : 1000;
  const after = net.points.map((p) => ({ ...p }));
  const before = from || after;
  const start = winch.ropeOut;
  let last = net.furl;
  net.points = before.map((p) => ({ ...p }));
  net.locked = true;
  winch.working = 1;
  audio.crank(ms / 1000);
  await clock.tween(ms, token, (t) => {
    const k = ease.inOut(t);
    net.furl = 1 - k;
    net.points = after.map((p, i) => geo.lerp(before[i], p, k));
    winch.setRopeOut(start * (1 - ease.outBack(t)));
    winch.turn((last - net.furl) * GATHER_ROPE);
    last = net.furl;
  });
  net.points = after;
  net.furl = 0;
  winch.setRopeOut(0);
  winch.working = 0;
}

// --- the puzzle -------------------------------------------------------------------
// A right frame: the corner (already on its exact place, the one stop that has the property)
// locks with a click, the property lights up step by step and the praise is said, all while the
// net goes down: the child dropped it now, for the fish under it, so nothing holds it back.
function lockAnswer(game, result) {
  const { net, popo, fx, audio } = game;
  const level = LEVELS[state.level];
  net.solve(result.snap);
  audio.play('snap');
  const snapped = net.toStage(result.snap);
  fx.sparkle(snapped.x, snapped.y, 14);
  popo.react('happy', 1.2);
  net.showGlow(net.glowFor(level), level.type === 'parallelogram' ? 0.5 : 0.8);
  audio.play('success');
  game.instruct(level.praise);
}

// After the hint the prompt returns, and the child carries on from the frame as they left it;
// its corner gives a wobble to say it's the one to fix.
function backToPuzzle(game, level) {
  const { net, ui, audio } = game;
  game.instruct(level.prompt, { voice: false, pace: 0.09 });
  net.locked = false;
  net.wobble = 1;
  audio.play('wobble');
  state.phase = PHASE.PUZZLE_READY;
  state.idleTime = state.misses >= 2 ? level.hintDelay - 1.5 : 0;
  ui.showHandle(true);
  ui.setDrop('on');
}

// --- the catch ------------------------------------------------------------------------
// Hauled up with a catch, the ring rises this far above where it rests, so the bag the net
// closes into clears the water.
const HAUL = 42;

// Drop Net tests the frame for the level's property. A right one locks with its praise and goes
// down; a wrong one goes down all the same. In the water it nets whichever fish are under it as
// it lands, so the child drops it as fish swim beneath. Hauled up, it closes into a bag around
// its catch. A wrong net's catch breaks out; a right net that caught nothing comes up empty,
// still right, to be dropped again.
async function dropNet(game) {
  const token = newToken();
  const { net, winch, popo, fx, audio, ui } = game;
  const reduced = fx.reduced;
  try {
    const result = net.check();
    // once the frame has been right this level it stays right: only the timing is left to try
    const right = game.netRight || result.ok;
    ui.showHandle(false);
    ui.setDrop('hidden');
    if (right && !game.netRight) {
      lockAnswer(game, result);
    } else {
      game.instruct('');
      audio.stopVoice();
    }
    const justLocked = right && !game.netRight;
    game.netRight = right;
    state.phase = PHASE.NET_LOWERING;
    net.locked = true;
    popo.squash = 0.07; // Popo takes hold of the wheel
    // a right frame holds a moment, clicked into place and glowing as its praise begins, so the
    // child sees what was right before the net goes down
    await clock.wait(justLocked ? (reduced ? 300 : 650) : 200, token);

    const depth = game.catchDepth();
    // Update payout and its dependent geometry together, before splash/capture checks.
    const payOut = (length) => {
      winch.setRopeOut(length);
      net.origin = popo.transformPoint(winch.hang.x, winch.hang.y);
      net.drop = winch.ropeOut;
      net.ropePhase = winch.ropeOut;
    };
    const smooth = (t) => t*t*t*(t*(t*6-15)+10);
    const down = reduced ? 1100 : 1800;
    winch.working = 1;
    audio.crank(down / 1000);
    let splashed = false;
    let lastBubble = 0;
    const sway = net.swing; // carried on from the idle sway, so the net never jumps
    await clock.tween(down, token, (t) => {
      const k = smooth(t);
      payOut(depth * k);
      net.swing = reduced ? 0 : (sway + Math.sin(t * Math.PI * 2) * 0.012) * (1 - t);
      const bottom = net.ring().y + net.bottom();
      if (!splashed && bottom >= game.waterline) {
        splashed = true;
        game.netSplash();
      }
      if (splashed && t - lastBubble > 0.12) {
        lastBubble = t;
        const corner = net.toStage(net.points[Math.random() < 0.5 ? 2 : 3]);
        fx.puff(corner.x, corner.y, 0, 1);
      }
    });
    net.swing = 0;
    winch.working = 0;

    // the frame settles over whoever swam under it; each fish inside is netted in turn
    state.phase = PHASE.CATCHING;
    const caught = state.fish.filter((f) => !f.gone && !f.leaving && !f.waiting && net.contains(f));
    if (caught.length) audio.play('bubbles');
    for (const f of caught) {
      f.catchAt(net.uvOf(net.toNet(f)));
      fx.puff(f.x, f.y, 0, 2, true);
      await clock.wait(70, token);
    }
    await clock.wait(reduced ? 250 : 420, token);

    // Take up slack first: the mouth closes underwater before the loaded bag rises.
    if (caught.length) {
      winch.working = -1;
      audio.crank(0.55);
      let gathered = 0;
      await clock.tween(reduced ? 300 : 550, token, (t) => {
        const k = smooth(t);
        net.pouch = 0.55 * k;
        winch.turn(-24 * (k - gathered));
        gathered = k;
      });
    }

    // up it comes, closing into a bag around its catch, the fish sliding down into its belly
    state.phase = PHASE.NET_RAISING;
    const up = reduced ? 1100 : 1800;
    const lift = caught.length ? HAUL : 0;
    winch.working = -1;
    audio.crank(up / 1000);
    let surfaced = false;
    await clock.tween(up, token, (t) => {
      const k = smooth(t);
      payOut(depth * (1 - k) - lift * k);
      if (caught.length) net.pouch = 0.55 + 0.45 * smooth(Math.min(1, t / 0.55));
      net.swing = reduced || !caught.length ? 0 : Math.sin(t * Math.PI * 2) * 0.026 * Math.sin(t * Math.PI);
      const bottom = net.ring().y + net.bottom();
      if (!surfaced && bottom < game.waterline) {
        surfaced = true;
        game.netSplash();
        audio.play('drip');
      }
      if (surfaced && Math.random() < 0.12) fx.drips(net.toStage(net.meshPoint(0.3 + Math.random() * 0.4, 1)));
    });
    winch.setRopeOut(-lift);
    winch.working = 0;
    if (right) game.instruct(''); // the praise has been said; the catch speaks for itself

    if (!right) {
      await netBreaks(game, caught, token);
      return;
    }
    if (!caught.length) {
      await emptyNet(game, token);
      return;
    }
    state.phase = PHASE.LEVEL_COMPLETE;
    state.caught += caught.length;
    ui.setNets(state.level + 1, state.level + 1);
    popo.react('laugh', 1.6);
    audio.play('catch');
    const ring = net.ring();
    fx.sparkle(ring.x, ring.y + net.bottom() * 0.7, 16);
    for (const f of caught) f.wiggle();
    await game.say(STORY.catch, token);
    await collectFish(game, caught, token);
    await nextLevel(game, token);
  } catch (e) {
    swallow(e);
  }
}

// A right net that came up empty: the fish swam on before it landed. Popo is baffled ("Huh?!"),
// and Drop Net comes back for another try when fish are under the net; the frame stays right.
async function emptyNet(game, token) {
  const { popo, audio, ui } = game;
  popo.react('think', 1.2);
  audio.play('wobble');
  await game.say(STORY.empty, token);
  state.phase = PHASE.PUZZLE_READY;
  state.idleTime = 0;
  ui.setDrop('on');
}

// A wrong net can't hold its catch: the fish thrash in the bag until it tears, and they drop
// back into the sea. The level's hint shows while Popo winds the net up and lets it down
// (mended, if it tore), in the shape the child left it.
async function netBreaks(game, caught, token) {
  const { net, popo, fx, audio } = game;
  const level = LEVELS[state.level];
  state.phase = PHASE.NET_BREAKING;
  if (caught.length) {
    // the catch thrashes, and the net jerks on its rope
    audio.play('struggle');
    let next = 0;
    await clock.tween(fx.reduced ? 500 : 1000, token, (t) => {
      if (t >= next) {
        next += 0.25;
        for (const f of caught) f.wiggle();
      }
      // jerks that grow, and still at the very end so the tear starts from rest
      net.swing = fx.reduced ? 0 : Math.sin(t * 50) * 0.03 * Math.min(1, 0.3 + 0.8 * t) * Math.min(1, (1 - t) * 8);
    });
    net.swing = 0;
    // ...until the bag tears
    audio.play('rip');
    popo.react('think', 1.8);
    const hole = net.toStage(net.tearHole().centre);
    for (const x of [-40, 0, 40]) fx.drips({ x: hole.x + x, y: hole.y });
    net.burst = { t: 0 };
    await clock.tween(220, token, (t) => { net.tear = 1 - (1 - t) ** 2; });
    net.tear = 1;
    audio.play('woah');
    await Promise.all([...caught.map((f, i) => escape(game, f, i, hole, token)), game.say(STORY.oops, token)]);
  } else {
    await game.say(STORY.oops, token);
  }
  state.misses += 1;
  popo.react('think', 1.4);
  // the hint stays up a moment after it's said; it may be cancelled (a restart) before it's
  // awaited, so its rejection is handled here too
  const shown = game.instruct(level.hint);
  const hinted = clock.wait(Math.max(1800, shown * 1000 + 800), token);
  hinted.catch(() => {});
  const torn = net.tear > 0;
  await windNetUp(game, token);
  if (torn) {
    // mended while it's bundled up
    net.tear = 0;
    const bundle = net.toStage({ x: 0, y: net.bottom() });
    fx.sparkle(bundle.x, bundle.y - 30, 10);
    audio.play('puff');
  }
  await letNetDown(game, token);
  await hinted;
  backToPuzzle(game, level);
}

// A netted fish wriggles free through the tear: out of the mesh in a little hop the way its lane
// swims, down into the sea with a splash, and on to its lane's depth to swim with its school
// again (the Sea eases it back into its place in the lane).
async function escape(game, f, i, hole, token) {
  const { fx, audio } = game;
  const waterline = game.waterline;
  await clock.wait(i * 110, token);
  const from = { x: f.x, y: f.y };
  const dir = f.lane ? f.lane.dir : (Math.sign(hole.x - from.x) || 1);
  const entry = { x: from.x + dir * between(20, 60), y: waterline + 8 };
  const land = { x: entry.x + dir * between(60, 120), y: f.lane ? f.lane.y : entry.y + 60 };
  const hop = between(30, 60);
  f.caught = null;
  f.dir = dir;
  await clock.tween(between(480, 620), token, (t) => {
    f.x = from.x + (entry.x - from.x) * t;
    // up in a hop, then falling faster and faster
    f.y = from.y - hop * 4 * t * (1 - t) + (entry.y - from.y) * t * t;
    const fall = -hop * 4 * (1 - 2 * t) + 2 * (entry.y - from.y) * t;
    f.pitch = Math.max(-0.7, Math.min(1.1, fall / 500));
  });
  fx.splash(entry.x, waterline, false);
  fx.ripple(entry.x, waterline + 4, 0.8);
  audio.play('splashSmall');
  await clock.tween(between(600, 800), token, (t) => {
    const k = 1 - (1 - t) ** 2;
    f.x = entry.x + (land.x - entry.x) * k;
    f.y = entry.y + (land.y - entry.y) * k;
    f.pitch = 0.9 * (1 - k);
  });
  // swimming again, from exactly where it is (on its float, so it never jumps)
  f.frozen = false;
  f.pitch = 0;
  f.lastY = f.y;
  f.baseY = f.y - Math.sin(f.driftPhase) * f.driftAmp;
  f.speed = f.lane ? f.lane.speed : 50;
  f.puffs += 2;
}

// Fish hop from their exact mesh position into the moving bucket, then pass behind
// its rim. The whole fish remains intact; no instant flip or visible disappearance.
async function collectFish(game, fish, token) {
  const { popo, fx, audio } = game;
  const flights = fish.map((f, i) => clock.wait(i * 150, token).then(() => {
    const from = { x: f.x, y: f.y };
    f.caught = null;
    f.flying = true;
    const duration = Math.max(780, Math.min(1150, Math.abs(from.x-popo.bucketPoint().x)*1.2));
    return clock.tween(duration, token, (t) => {
      const bucket = popo.bucketPoint();
      const k = t*t*(3-2*t);
      const peak = { x:(from.x+bucket.x)/2, y:Math.min(from.y,bucket.y)-130 };
      f.x = (1-k)*(1-k)*from.x + 2*(1-k)*k*peak.x + k*k*bucket.x;
      f.y = (1-k)*(1-k)*from.y + 2*(1-k)*k*peak.y + k*k*(bucket.y+10);
      f.scale = 1 - 0.65*k;
      f.landing = t > 0.82;
      const sink = Math.max(0,(t-0.88)/0.12);
      f.alpha = 1-sink*sink*(3-2*sink);
    }).then(() => {
      f.gone = true;
      const bucket = popo.bucketPoint();
      fx.sparkle(bucket.x, bucket.y-10, 8);
      audio.play('collect');
      game.landed += 1;
      game.ui.setCatch(game.landed, true);
    });
  }));
  await Promise.all(flights);
}

// On to the next net: Popo winds the empty net up, rows to new waters when the level moves on,
// and lets the net down in its new shape while the next school swims in. After the last net,
// the celebration.
async function nextLevel(game, token) {
  const next = state.level + 1;
  state.phase = PHASE.TRANSITIONING;
  await windNetUp(game, token);
  if (next >= LEVELS.length) {
    await celebrate(game, token);
    return;
  }
  // the fish the net missed swim on and are joined by more for the next net (rowing to new
  // waters, they come along); only for the golden school do they swim off out of the sea, as
  // the golden fish swim in behind them
  state.fish = state.fish.filter((f) => !f.gone && !f.caught);
  const golden = Boolean(LEVELS[next].rare) && !LEVELS[state.level].rare;
  if (golden) {
    for (const f of state.fish) f.swimAway();
    game.strays.push(...state.fish.filter((f) => !f.gone));
    state.fish = [];
  }
  game.audio.play('complete');
  await clock.wait(500, token);
  if (LEVELS[next].location !== state.locationIndex) await rowTo(game, LEVELS[next].location, token);
  const before = game.prepareLevel(next);
  game.spawnSchool();
  await letNetDown(game, token, before);
  // the golden school rushing in: Popo can't believe his eyes
  if (golden) await game.say(STORY.golden, token);
  game.beginPuzzle();
}

async function rowTo(game, nextIndex, token) {
  const { popo, fx, audio, net } = game;
  try {
    await game.prepareTransition(nextIndex, token);
  } catch (e) {
    // the next scenery couldn't load: arrive without the row rather than get stuck
    if (!isCurrent(token)) throw new Cancelled();
    game.finishTransition(nextIndex);
    return;
  }
  audio.setTravel(true);
  const fromWater = game.waterline;
  const toWater = game.locationWaterline(nextIndex);
  const duration = fx.reduced ? 1800 : 3400;
  const stroke = duration / (fx.reduced ? 1 : 2);
  popo.startRowing(stroke);
  let lastBlade = popo.paddleTip();
  let lastSplashStroke = -1;
  let lastWake = 0;
  try {
    await clock.tween(duration, token, (t) => {
      const k = ease.inOut(t);
      game.transition.k = k;
      game.setWaterline(fromWater + (toWater - fromWater) * k);
      const elapsed = t * duration;
      popo.setRowingTime(elapsed);
      // every pull drives the raft forward and lifts the bow a little; it settles as the blade lifts
      const surge = popo.rowRig.sample(elapsed, stroke).power;
      const pace = Math.sin(t * Math.PI);
      popo.travelShift = pace * (18 + surge * 24);
      popo.tilt = -pace * (0.012 + surge * 0.014);
      net.swing = -pace * 0.04; // the net trails a little behind the moving raft
      const blade = popo.paddleTip();
      const strokeIndex = Math.floor(elapsed / stroke);
      if (strokeIndex !== lastSplashStroke && lastBlade.y < game.waterline && blade.y >= game.waterline) {
        lastSplashStroke = strokeIndex;
        const crossing = (game.waterline - lastBlade.y) / (blade.y - lastBlade.y);
        fx.splash(lastBlade.x + (blade.x - lastBlade.x) * crossing, game.waterline, false);
        audio.play('paddle');
      }
      lastBlade = blade;
      if (elapsed - lastWake > 380 && t > 0.06 && t < 0.94) {
        lastWake = elapsed;
        fx.ripple(popo.raftEnds().left + popo.travelShift - 12, game.waterline + 6, 0.7);
      }
    });
  } finally {
    popo.idle();
    popo.travelShift = 0;
    popo.tilt = 0;
    net.swing = 0;
    if (isCurrent(token)) audio.setTravel(false);
  }
  game.finishTransition(nextIndex);
  await clock.wait(250, token);
}

// After the eighth net: Popo cheers ("Wow! What a catch!") and the end screen closes in on him,
// as in Fishing Frenzy.
async function celebrate(game, token) {
  const { popo, fx, audio, net, ui } = game;
  state.phase = PHASE.GAME_COMPLETE;
  game.instruct('');
  ui.showHandle(false);
  ui.setDrop('hidden');
  audio.play('tada');
  popo.react('laugh', 2.2);
  const ring = net.ring();
  for (let i = 0; i < 4; i += 1) {
    clock.wait(i * 180, token).then(() => {
      fx.sparkle(ring.x + (Math.random() - 0.5) * 400, ring.y + 60 + Math.random() * 160, 10);
    }).catch(() => {});
  }
  for (const line of STORY.complete) await game.say(line, token);
  await clock.wait(300, token);
  await theEnd(game, token);
}

// The End, as in Fishing Frenzy: a circle closes in on Popo and his raft over the live scene and
// glides with them to the middle, everything around it a warm, slowly turning sunburst; "The End"
// pops in letter by letter while Popo laughs, then Play Again springs in at the bottom right.
async function theEnd(game, token) {
  const { popo, audio, ui, fx } = game;
  const reduced = fx.reduced;
  const head = popo.headTop();
  const raft = popo.raftEnds();
  const deck = popo.anchor.y + 24;
  const centre = { x: (raft.left + raft.right) / 2, y: (head.y + deck) / 2 };
  const r = Math.max(...[{ x: raft.left, y: deck }, { x: raft.right, y: deck }, head].map((p) => geo.distance(p, centre))) + 14;
  // the scene's left edge must stay outside the circle as it glides
  centre.x = Math.max(centre.x, r + 4);
  const ending = game.ending = { x: centre.x, y: centre.y, r: 1500, pan: { x: 0, y: 0 }, t: 0, laugh: true, laughIn: 0, giggles: 2 };
  audio.play('iris');
  await clock.tween(reduced ? 400 : 950, token, (t) => { ending.r = 1500 + (r - 1500) * ease.inOut(t); });
  const to = { x: STAGE_W / 2, y: Math.min(STAGE_H - r - 12, Math.max(575, r + 235)) };
  await clock.tween(reduced ? 300 : 750, token, (t) => {
    const k = ease.inOut(t);
    ending.pan = { x: (to.x - centre.x) * k, y: (to.y - centre.y) * k };
  });
  game.announceComplete();
  ending.titleAt = ending.t;
  audio.play('tada');
  ui.setCatch(game.landed, true);
  await clock.wait(reduced ? 600 : 1300, token);
  ui.showAgain(true);
  audio.play('bloop');
}

// Play Again: The End fades as the circle closes to nothing, the game is set up afresh out of
// sight, and the circle opens again on the first net (Game.updateEnding).
async function closeCurtain(game) {
  const token = newToken();
  const ending = game.ending;
  ending.closing = true;
  ending.laugh = false;
  game.ui.showAgain(false);
  game.audio.play('iris');
  const from = ending.r;
  try {
    await clock.tween(game.fx.reduced ? 250 : 500, token, (t) => {
      ending.r = from * (1 - t * t * t);
      ending.fade = 1 - t;
    });
  } catch (e) {
    swallow(e);
    return;
  }
  game.reset();
  game.ending = { x: STAGE_W / 2, y: STAGE_H / 2, r: 0, pan: { x: 0, y: 0 }, t: 0, opening: true };
  startLevels(game);
}

Object.assign(PopoGame, { opening, startLevels, dropNet, rowTo, celebrate, closeCurtain, letNetDown });
})(window.PopoGame = window.PopoGame || {});
