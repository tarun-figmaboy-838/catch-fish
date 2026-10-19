(function (PopoGame) {
'use strict';
const { clock, ease, Cancelled, state, PHASE, newToken, isCurrent, Fish, STORY, LEVELS, NATURAL_FISH, STAGE_W, geo, TUCK } = PopoGame;

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
    game.ui.setInstruction('');
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
  let last = net.furl;
  net.locked = true;
  winch.working = -1;
  audio.crank(ms / 1000);
  await clock.tween(ms, token, (t) => {
    const k = ease.inOut(t);
    net.furl = k;
    winch.setRopeOut(from + (-TUCK - from) * k);
    winch.turn(-(k - last) * GATHER_ROPE);
    last = k;
    net.swing = fx.reduced ? 0 : Math.sin(t * Math.PI * 3) * 0.035 * (1 - t);
  });
  net.swing = 0;
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

async function slideCorner(net, from, to, token, ms = 480) {
  await clock.tween(ms, token, (t) => net.setHandle(geo.lerp(from, to, ease.outBack(t))));
  net.setHandle(to);
}

// --- the puzzle -------------------------------------------------------------------
// Let go near its place, the corner settles onto it (the child still presses Drop Net).
async function settleCorner(game) {
  const net = game.net;
  const token = state.token;
  net.settling = true;
  try {
    await slideCorner(net, { ...net.points[net.movable] }, net.target, token, 240);
  } catch (e) {
    swallow(e);
  } finally {
    net.settling = false;
  }
}

// A right frame: the corner glides to its exact place and locks, and the property lights up
// with its praise; it waits until every fish has swum in.
async function lockAnswer(game, result, token) {
  const { net, popo, fx, audio, ui } = game;
  const level = LEVELS[state.level];
  const from = { ...net.points[net.movable] };
  if (geo.distance(from, result.snap) > 0.5) await slideCorner(net, from, result.snap, token, 260);
  net.solve(result.snap);
  audio.play('snap');
  const snapped = net.toStage(result.snap);
  fx.sparkle(snapped.x, snapped.y, 14);
  state.phase = PHASE.CORRECT;
  popo.react('happy', 1.2);
  await clock.wait(140, token);
  const final = level.type === 'parallelogram';
  net.showGlow(net.glowFor(level), final ? 0.5 : 0.8);
  audio.play('success');
  ui.setInstruction(level.praise);
  const spoken = game.speak(level.praise);
  await clock.wait(Math.max(1000, spoken * 1000 + 200, net.glowLength(level) * 1000), token);
  while (state.fish.some((f) => f.offstage || f.entering)) await clock.wait(100, token);
}

// After the hint the prompt returns, and the child carries on from the frame as they left it;
// its corner gives a wobble to say it's the one to fix.
function backToPuzzle(game, level) {
  const { net, ui, audio } = game;
  ui.setInstruction(level.prompt);
  net.locked = false;
  net.wobble = 1;
  audio.play('wobble');
  state.phase = PHASE.PUZZLE_READY;
  state.idleTime = state.misses >= 2 ? level.hintDelay - 1.5 : 0;
  ui.showHandle(true);
  ui.setDrop('on');
}

// --- the catch ------------------------------------------------------------------------
// Drop Net tests the frame for the level's property. A right one locks with its praise and goes
// down for the catch; a wrong one goes down all the same, and its catch breaks out of it.
async function dropNet(game) {
  const token = newToken();
  const { net, winch, popo, fx, audio, ui } = game;
  const reduced = fx.reduced;
  try {
    const result = net.check();
    const right = result.ok;
    ui.showHandle(false);
    ui.setDrop('hidden');
    if (right) await lockAnswer(game, result, token);
    state.phase = PHASE.NET_LOWERING;
    net.locked = true;
    ui.setInstruction('');
    audio.stopVoice();
    popo.squash = 0.07; // Popo takes hold of the wheel
    await clock.wait(200, token);

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
      game.herdFish();
    });
    net.swing = 0;
    winch.working = 0;

    // the frame settles around the school; each fish inside is netted in turn
    state.phase = PHASE.CATCHING;
    const caught = state.fish.filter((f) => !f.gone && net.contains(f));
    audio.play('bubbles');
    for (const f of caught) {
      f.catchAt(net.toNet(f));
      fx.puff(f.x, f.y, 0, 2, true);
      await clock.wait(70, token);
    }
    await clock.wait(reduced ? 250 : 420, token);

    state.phase = PHASE.NET_RAISING;
    const up = reduced ? 1100 : 1800;
    winch.working = -1;
    audio.crank(up / 1000);
    let surfaced = false;
    await clock.tween(up, token, (t) => {
      payOut(depth * (1 - smooth(t)));
      const bottom = net.ring().y + net.bottom();
      if (!surfaced && bottom < game.waterline) {
        surfaced = true;
        game.netSplash();
        audio.play('drip');
      }
      if (surfaced && Math.random() < 0.12) fx.drips(net.toStage(net.points[Math.random() < 0.5 ? 2 : 3]));
    });
    winch.setRopeOut(0);
    winch.working = 0;

    if (!right) {
      await netBreaks(game, caught, token);
      return;
    }
    state.phase = PHASE.LEVEL_COMPLETE;
    state.caught += caught.length;
    popo.react('laugh', 1.6);
    audio.play('catch');
    const ring = net.ring();
    fx.sparkle(ring.x, ring.y + net.bottom() / 2, 16);
    for (const f of caught) f.wiggle();
    await game.say(STORY.catch, token);
    await collectFish(game, caught, token);
    await nextLevel(game, token);
  } catch (e) {
    swallow(e);
  }
}

// A wrong net can't hold its catch: the fish thrash until the mesh tears, and they dive back
// into the sea. The level's hint shows while Popo winds the torn net up and lets it down
// mended, in the shape the child left it.
async function netBreaks(game, caught, token) {
  const { net, popo, fx, audio, ui } = game;
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
    // ...until the mesh tears
    audio.play('rip');
    popo.react('think', 1.8);
    const hole = net.toStage(net.tearHole().centre);
    for (const x of [-40, 0, 40]) fx.drips({ x: hole.x + x, y: hole.y });
    net.burst = { t: 0 };
    await clock.tween(220, token, (t) => { net.tear = 1 - (1 - t) ** 2; });
    net.tear = 1;
    audio.play('woah');
    await Promise.all(caught.map((f, i) => escape(game, f, i, hole, token)));
  }
  state.misses += 1;
  popo.react('think', 1.4);
  ui.setInstruction(level.hint);
  const spoken = game.speak(level.hint);
  const hinted = clock.wait(Math.max(1800, spoken * 1000 + 300), token);
  await windNetUp(game, token);
  // mended while it's bundled up
  net.tear = 0;
  const bundle = net.toStage({ x: 0, y: net.bottom() });
  fx.sparkle(bundle.x, bundle.y - 30, 10);
  audio.play('puff');
  await letNetDown(game, token);
  await hinted;
  backToPuzzle(game, level);
}

// A netted fish wriggles free through the tear: out of the mesh in a little hop, down into the
// sea with a splash, and on under the water to swim with its school again. Fish from either
// side head across, under the net.
async function escape(game, f, i, hole, token) {
  const { fx, audio } = game;
  const area = game.fishArea;
  const waterline = game.waterline;
  await clock.wait(i * 110, token);
  const from = { x: f.x, y: f.y };
  const dir = Math.sign(hole.x - from.x) || (Math.random() < 0.5 ? -1 : 1);
  const entry = { x: from.x + dir * between(20, 60), y: waterline + 8 };
  // where it rejoins the school, inside the water the school keeps to
  const margin = f.w / 2 + 16;
  const top = area.top + f.h / 2 + 18;
  const land = {
    x: Math.min(area.right - margin, Math.max(area.left + margin, entry.x + dir * between(50, 130))),
    y: between(top, Math.max(top, area.bottom - f.h / 2 - 18)),
  };
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
  // swimming again, from exactly where it is (on its drift curve, as when it was made)
  f.frozen = false;
  f.pitch = 0;
  f.lastY = f.y;
  f.baseY = f.y - Math.sin(f.driftPhase) * f.driftAmp;
  f.targetY = f.baseY;
  f.speed = f.cruise;
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
  state.fish = [];
  game.audio.play('complete');
  await clock.wait(500, token);
  if (LEVELS[next].location !== state.locationIndex) await rowTo(game, LEVELS[next].location, token);
  const before = game.prepareLevel(next);
  game.spawnSchool();
  await letNetDown(game, token, before);
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

// After the eighth net: Popo cheers, and the final card names the properties one at a time.
async function celebrate(game, token) {
  const { popo, fx, audio, ui, net } = game;
  state.phase = PHASE.GAME_COMPLETE;
  ui.setInstruction('');
  audio.play('tada');
  popo.react('laugh', 2.2);
  const ring = net.ring();
  for (let i = 0; i < 4; i += 1) {
    clock.wait(i * 180, token).then(() => {
      fx.sparkle(ring.x + (Math.random() - 0.5) * 400, ring.y + 60 + Math.random() * 160, 10);
    }).catch(() => {});
  }
  await game.say(STORY.complete, token);
  await clock.wait(200, token);
  ui.showComplete(true, STORY.title, '');
  game.announceComplete();
  const spoken = game.speak(STORY.title);
  await clock.wait(Math.max(1200, spoken * 1000 + 250), token);
  for (const lesson of STORY.lessons) {
    ui.setLesson(lesson);
    const said = game.speak(lesson);
    await clock.wait(Math.max(1700, said * 1000 + 450), token);
  }
}

Object.assign(PopoGame, { opening, startLevels, settleCorner, dropNet, rowTo, celebrate, letNetDown });
})(window.PopoGame = window.PopoGame || {});
